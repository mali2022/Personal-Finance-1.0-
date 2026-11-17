import { localizedLabels } from '../i18n';
import { t as tr } from '../i18n';
import type { ApiError } from '../types';

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'code' in value &&
    typeof value.code === 'string'
  );
}

/** Do not render server HTML, stack traces or transport error text as product copy. */
export function normalizeApiError(
  body: unknown,
  status?: number,
  transportCode?: string,
): ApiError {
  const defaults: Record<number, string> = localizedLabels({
    400: '请求内容有误，请检查填写信息。',
    401: '登录已过期，请重新登录。',
    403: '没有权限执行此操作。',
    404: '记录不存在或已被移除。',
    409: '数据已发生变化，请刷新后重试。',
    422: '信息校验未通过，请检查填写内容。',
    429: '操作太频繁，请稍后重试。',
    500: '服务暂时不可用，请稍后重试。',
  });
  const error = isApiError(body) ? body : undefined;
  if (status === 404 && !error) {
    return {
      message: tr('当前后端未提供此功能，请检查前后端版本是否一致。'),
      code: 'ENDPOINT_UNAVAILABLE',
    };
  }
  return {
    message: tr(
      status && status >= 500
        ? defaults[500]
        : error?.message ||
            (status ? defaults[status] : undefined) ||
            (transportCode === 'ECONNABORTED'
              ? '请求超时，请重试。'
              : '网络连接失败，请检查网络后重试。'),
    ),
    code:
      status === 401
        ? 'UNAUTHORIZED'
        : error?.code || (status ? `HTTP_${status}` : 'NETWORK_ERROR'),
    details: error?.details,
    traceId: error?.traceId,
  };
}
