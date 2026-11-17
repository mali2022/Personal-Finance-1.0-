import axios, { AxiosError, CanceledError } from 'axios';
import type { ApiResponse, User } from '../types';
import { normalizeApiError } from '../utils/errors';
import { isApiError } from '../utils/errors';
import { t } from '../i18n';
import {
  completeOperation,
  journalOwner,
  journalMethodAllowed,
  prepareOperation,
  setJournalOwner,
} from '../stores/operationJournal';
let accessToken: string | undefined;
let sessionEpoch = 0;
let refreshRequest: { epoch: number; promise: Promise<void> } | undefined;
export function setAccessToken(token?: string) {
  sessionEpoch += 1;
  accessToken = token;
  refreshRequest = undefined;
  setJournalOwner();
}
const config = {
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { 'Content-Type': 'application/json' },
};
export const apiClient = axios.create(config);
// Refresh uses a separate client to avoid recursively retrying its own 401.
const refreshClient = axios.create(config);
const requestEpochs = new WeakMap<object, number>();
const journalUsers = new WeakMap<object, string>();
apiClient.interceptors.request.use(async (request) => {
  requestEpochs.set(request, sessionEpoch);
  const epoch = sessionEpoch;
  const user = journalOwner();
  const key = request.headers['Idempotency-Key'];
  if (
    user &&
    typeof key === 'string' &&
    import.meta.env.VITE_ENABLE_MOCK !== 'true'
  ) {
    const method = request.method?.toLowerCase() || 'post';
    const path = request.url || '';
    if (
      !journalMethodAllowed(method, path) ||
      !path.startsWith('/') ||
      path.includes('://')
    )
      throw { message: '请求地址不支持安全恢复。', code: 'OPERATION_INVALID' };
    try {
      const body: unknown =
        typeof request.data === 'string'
          ? JSON.parse(request.data)
          : request.data;
      const prepared = await prepareOperation(user, {
        key,
        method,
        path,
        body,
        version: request.headers['If-Match']?.toString(),
      });
      if (epoch !== sessionEpoch) throw new CanceledError('会话已切换');
      request.headers['Idempotency-Key'] = prepared.operation.key;
      request.headers['X-Operation-Fingerprint'] =
        prepared.operation.fingerprint;
      journalUsers.set(request, user);
      if (prepared.reused) {
        const lookup = await apiClient.get<ApiResponse<OperationResult>>(
          `/operations/${encodeURIComponent(prepared.operation.key)}`,
          {
            params: { fingerprint: prepared.operation.fingerprint },
          },
        );
        const saved = lookup.data.data;
        if (saved.state === 'Completed' && !saved.legacy) {
          if (
            saved.path !== `/api${path}` ||
            saved.method?.toLowerCase() !== method
          )
            throw {
              message: '请求与保存结果不匹配。',
              code: 'IDEMPOTENCY_CONFLICT',
            };
          request.adapter = async (config) => ({
            data: { data: saved.result, traceId: lookup.data.traceId },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        }
      }
    } catch (error: unknown) {
      if (axios.isCancel(error) || isApiError(error)) throw error;
      throw {
        message:
          '无法保存提交记录，请先查看待核实结果；也请检查浏览器是否允许会话存储。',
        code: 'OPERATION_JOURNAL_ERROR',
      };
    }
  }
  if (epoch !== sessionEpoch) throw new CanceledError('会话已切换');
  if (accessToken) request.headers.Authorization = `Bearer ${accessToken}`;
  else delete request.headers.Authorization;
  return request;
});
apiClient.interceptors.response.use(
  (response) => {
    if (requestEpochs.get(response.config) !== sessionEpoch)
      throw new CanceledError('会话已切换');
    const user = journalUsers.get(response.config);
    if (user) {
      // A storage failure must never turn a confirmed server success into an apparent failed payment.
      try {
        completeOperation(
          user,
          String(response.config.headers['Idempotency-Key']),
        );
      } catch {
        /* Retained journal can be resolved using the server result. */
      }
    }
    if (
      ['post', 'put', 'delete'].includes(response.config.method || '') &&
      !/\/auth\/|preview|suggest/.test(response.config.url || '')
    ) {
      window.dispatchEvent(new Event('finance:planning-changed'));
    }
    return response;
  },
  async (error: AxiosError<unknown>) => {
    if (
      axios.isCancel(error) ||
      (!axios.isAxiosError(error) && isApiError(error))
    )
      return Promise.reject(error);
    const request = error.config;
    if (request && requestEpochs.get(request) !== sessionEpoch)
      return Promise.reject(new CanceledError('会话已切换'));
    if (
      error.response?.status === 401 &&
      request &&
      !/\/auth\/(login|logout|refresh)(?:\?|$)/.test(request.url || '') &&
      !request.headers['X-Auth-Retry']
    ) {
      const epoch = sessionEpoch;
      request.headers['X-Auth-Retry'] = '1';
      try {
        if (!refreshRequest || refreshRequest.epoch !== epoch) {
          // The cookie refresh endpoint shares the same environment URL in tests and production.
          refreshClient.defaults.baseURL = apiClient.defaults.baseURL;
          const promise = refreshClient
            .post<ApiResponse<{ accessToken: string }>>('/auth/refresh')
            .then((r) => {
              if (epoch !== sessionEpoch) throw new CanceledError('会话已切换');
              accessToken = r.data.data.accessToken;
            })
            .finally(() => {
              if (refreshRequest?.epoch === epoch) refreshRequest = undefined;
            });
          refreshRequest = { epoch, promise };
        }
        await refreshRequest.promise;
        return await apiClient.request(request);
      } catch (refreshError: unknown) {
        if (axios.isCancel(refreshError)) return Promise.reject(refreshError);
        if (axios.isAxiosError(refreshError)) {
          const status = refreshError.response?.status;
          if (status === 401 || status === 403) {
            if (epoch === sessionEpoch) {
              setAccessToken();
              window.dispatchEvent(new Event('finance:unauthorized'));
            }
            return Promise.reject(normalizeApiError(undefined, 401));
          }
          // A temporary network failure must not discard a valid session.
          return Promise.reject(
            normalizeApiError(
              refreshError.response?.data,
              status,
              refreshError.code,
            ),
          );
        }
        // A retried business request already passed through this interceptor.
        return Promise.reject(refreshError);
      }
    }
    if (error.response?.status === 401 && request?.headers['X-Auth-Retry']) {
      setAccessToken();
      window.dispatchEvent(new Event('finance:unauthorized'));
    }
    const journalUser = request && journalUsers.get(request);
    const status = error.response?.status;
    if (
      journalUser &&
      request &&
      status &&
      [400, 403, 404, 409, 422].includes(status) &&
      !(
        isApiError(error.response?.data) &&
        error.response.data.code === 'IDEMPOTENCY_CONFLICT'
      )
    ) {
      try {
        completeOperation(
          journalUser,
          String(request.headers['Idempotency-Key']),
        );
      } catch {
        /* Keep recoverable evidence. */
      }
    }
    const normalized = normalizeApiError(
      error.response?.data,
      error.response?.status,
      error.code,
    );
    return Promise.reject({ ...normalized, message: t(normalized.message) });
  },
);
export const authApi = {
  options: () =>
    apiClient
      .get<
        ApiResponse<{
          registrationEnabled: boolean;
          invitationActivationEnabled?: boolean;
        }>
      >('/auth/options')
      .then((r) => r.data.data),
  register: async (body: {
    email: string;
    password: string;
    displayName: string;
    language: string;
    inviteCode?: string;
  }) => {
    setAccessToken();
    await apiClient.get('/auth/csrf');
    const r = await apiClient.post<
      ApiResponse<{ user: User; accessToken: string }>
    >('/auth/register', body);
    setAccessToken(r.data.data.accessToken);
    setJournalOwner(r.data.data.user.id);
    return r.data.data.user;
  },
  me: () =>
    apiClient.get<ApiResponse<User>>('/auth/me').then((r) => {
      setJournalOwner(r.data.data.id);
      return r.data.data;
    }),
  login: (email: string, password: string) => {
    setAccessToken();
    return apiClient
      .post<ApiResponse<{ user: User; accessToken: string }>>('/auth/login', {
        email,
        password,
      })
      .then((r) => {
        setAccessToken(r.data.data.accessToken);
        setJournalOwner(r.data.data.user.id);
        return r.data.data.user;
      });
  },
  logout: () => apiClient.post('/auth/logout').then(() => setAccessToken()),
};
export interface OperationResult {
  state: 'Unknown' | 'Completed';
  key: string;
  method?: string;
  path?: string;
  completedAt?: string;
  result?: unknown;
  legacy?: boolean;
}
