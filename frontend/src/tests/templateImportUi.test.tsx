import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { TemplateImport } from '../components/TemplateImport';
const post = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({ apiClient: { post } }));
vi.mock('../api/finance', () => ({
  accountApi: { list: vi.fn() },
  categoryApi: { list: vi.fn() },
}));
beforeEach(() => {
  post.mockReset();
});
it('previews without writing, submits once and retains individual success/failure results', async () => {
  post.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('模拟失败'));
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <TemplateImport kind="merchants" />
      </App>
    </QueryClientProvider>,
  );
  const file = new File([''], 'merchants.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: async () =>
      'name,currency,status,categoryId\n商户一,CNY,Active,\n商户二,CNY,Active,',
  });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  const confirm = await screen.findByRole('button', { name: /确认导入 2 行/ });
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await screen.findByText('成功');
  await screen.findByText(/未确认成功：模拟失败/);
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0][0]).toBe('/directory/merchants');
  expect(post.mock.calls[0][2].headers['Idempotency-Key']).not.toBe(
    post.mock.calls[1][2].headers['Idempotency-Key'],
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /确认导入 0 行/ }),
    ).toBeDisabled(),
  );
});
