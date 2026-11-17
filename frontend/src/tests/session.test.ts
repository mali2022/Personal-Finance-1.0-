import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient, authApi, setAccessToken } from '../api/client';
const server = setupServer();
const ok = (data: unknown) => HttpResponse.json({ data });
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => setAccessToken('expired'));
afterEach(() => {
  server.resetHandlers();
  setAccessToken();
});
afterAll(() => server.close());
describe('会话与 HTTP 边界', () => {
  it('同时过期的请求只刷新一次，使用新令牌各自重试', async () => {
    let refreshes = 0;
    server.use(
      http.get('/api/probe/:id', ({ request, params }) =>
        request.headers.get('Authorization') === 'Bearer renewed'
          ? ok(params.id)
          : HttpResponse.json({}, { status: 401 }),
      ),
      http.post('/api/auth/refresh', async () => {
        refreshes++;
        await delay(30);
        return ok({ accessToken: 'renewed' });
      }),
    );
    const [first, second] = await Promise.all([
      apiClient.get('/probe/a'),
      apiClient.get('/probe/b'),
    ]);
    expect(first.data.data).toBe('a');
    expect(second.data.data).toBe('b');
    expect(refreshes).toBe(1);
  });
  it('刷新后的 /auth/me 能恢复内存令牌丢失的登录会话', async () => {
    setAccessToken();
    server.use(
      http.get('/api/auth/me', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer recovered'
          ? ok({
              id: 'u2',
              displayName: '新用户',
              email: 'u@example.com',
              permissions: [],
            })
          : HttpResponse.json({}, { status: 401 }),
      ),
      http.post('/api/auth/refresh', () => ok({ accessToken: 'recovered' })),
    );
    expect((await authApi.me()).id).toBe('u2');
  });
  it('刷新网络失败保留会话，不发退出事件', async () => {
    const expired = vi.fn();
    window.addEventListener('finance:unauthorized', expired);
    try {
      server.use(
        http.get('/api/probe', () => HttpResponse.json({}, { status: 401 })),
        http.post('/api/auth/refresh', () => HttpResponse.error()),
      );
      await expect(apiClient.get('/probe')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
      expect(expired).not.toHaveBeenCalled();
      server.use(
        http.get('/api/token', ({ request }) =>
          ok(request.headers.get('Authorization')),
        ),
      );
      expect((await apiClient.get('/token')).data.data).toBe('Bearer expired');
    } finally {
      window.removeEventListener('finance:unauthorized', expired);
    }
  });
  it('刷新凭据失效通知清理会话且不再发送旧令牌', async () => {
    const expired = vi.fn();
    window.addEventListener('finance:unauthorized', expired);
    try {
      server.use(
        http.get('/api/probe', () => HttpResponse.json({}, { status: 401 })),
        http.post('/api/auth/refresh', () =>
          HttpResponse.json({}, { status: 401 }),
        ),
        http.get('/api/token', ({ request }) =>
          ok(request.headers.get('Authorization')),
        ),
      );
      await expect(apiClient.get('/probe')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      expect(expired).toHaveBeenCalledOnce();
      expect((await apiClient.get('/token')).data.data).toBeNull();
    } finally {
      window.removeEventListener('finance:unauthorized', expired);
    }
  });
  it('切换会话后迟到的刷新不能覆盖新用户令牌', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refreshing = false;
    server.use(
      http.get('/api/probe', () => HttpResponse.json({}, { status: 401 })),
      http.post('/api/auth/refresh', async () => {
        refreshing = true;
        await gate;
        return ok({ accessToken: 'old-user' });
      }),
      http.get('/api/token', ({ request }) =>
        ok(request.headers.get('Authorization')),
      ),
    );
    const pending = apiClient.get('/probe').catch((e: unknown) => e);
    await vi.waitFor(() => expect(refreshing).toBe(true));
    setAccessToken('new-user');
    release();
    expect(await pending).toMatchObject({ code: 'ERR_CANCELED' });
    expect((await apiClient.get('/token')).data.data).toBe('Bearer new-user');
  });
  it('缺失接口与缺失业务记录使用不同提示', async () => {
    server.use(
      http.get(
        '/api/missing-endpoint',
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get('/api/missing-record', () =>
        HttpResponse.json(
          { message: '投资资产不存在', code: 'NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );
    await expect(apiClient.get('/missing-endpoint')).rejects.toMatchObject({
      code: 'ENDPOINT_UNAVAILABLE',
      message: '当前后端未提供此功能，请检查前后端版本是否一致。',
    });
    await expect(apiClient.get('/missing-record')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '投资资产不存在',
    });
  });
  it('非结构化服务器错误显示中文，409 保留详细校验信息', async () => {
    server.use(
      http.get(
        '/api/failure',
        () =>
          new HttpResponse('<html>server traceback</html>', { status: 500 }),
      ),
      http.get('/api/conflict', () =>
        HttpResponse.json(
          {
            message: '记录已更新',
            code: 'VERSION_CONFLICT',
            details: { version: ['重新加载'] },
            traceId: 'trace-1',
          },
          { status: 409 },
        ),
      ),
    );
    await expect(apiClient.get('/failure')).rejects.toMatchObject({
      message: '服务暂时不可用，请稍后重试。',
      code: 'HTTP_500',
    });
    await expect(apiClient.get('/conflict')).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { version: ['重新加载'] },
      traceId: 'trace-1',
    });
  });
});
