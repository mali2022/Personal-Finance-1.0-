import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportPanel } from '../features/reports/ExportPanel';
import { advancedApi } from '../api/operations';
import { apiClient } from '../api/client';
import { saveBlob } from '../utils/download';

vi.mock('../components/Selectors', () => ({
  AccountSelector: () => null,
  CategorySelector: () => null,
}));
vi.mock('../utils/download', () => ({ saveBlob: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function setup() {
  return render(
    <App>
      <QueryClientProvider client={new QueryClient()}>
        <ExportPanel />
      </QueryClientProvider>
    </App>,
  );
}
const job = (id: string, total: number) => ({
  data: { data: { id, state: 'Ready', fileName: `${id}.csv`, total } },
});

describe('导出独立请求与真实响应契约', () => {
  it('下载失败保留原 key，完成后相同筛选发起新导出并显示后端 total', async () => {
    const create = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(job('first', 12))
      .mockResolvedValueOnce(job('first', 12))
      .mockResolvedValueOnce(job('fresh', 13));
    vi.spyOn(advancedApi, 'download')
      .mockRejectedValueOnce({ message: '下载中断' })
      .mockResolvedValue(new Blob(['csv']));
    setup();
    const button = screen.getByRole('button', { name: '导出 CSV' });
    fireEvent.click(button);
    await screen.findByText('下载中断');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('已导出 12 笔交易');
    expect(screen.getByText('上次导出12 笔')).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('已导出 13 笔交易');
    const keys = create.mock.calls.map(
      (call) => call[2]?.headers?.['Idempotency-Key'],
    );
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(saveBlob).toHaveBeenCalledTimes(2);
  });

  it('创建失败重试保留 key，零笔及旧版 count 响应均正确归一化', async () => {
    const create = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce({ message: '创建超时' })
      .mockResolvedValueOnce(job('empty', 0));
    vi.spyOn(advancedApi, 'download').mockResolvedValue(new Blob());
    setup();
    const button = screen.getByRole('button', { name: '导出 CSV' });
    fireEvent.click(button);
    await screen.findByText('创建超时');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('已导出 0 笔交易');
    expect(create.mock.calls[0][2]?.headers?.['Idempotency-Key']).toBe(
      create.mock.calls[1][2]?.headers?.['Idempotency-Key'],
    );
    create.mockResolvedValueOnce({
      data: {
        data: {
          id: 'legacy',
          state: 'Ready',
          fileName: 'legacy.csv',
          count: 7,
        },
      },
    });
    expect((await advancedApi.export('CSV', {}, 'legacy-key')).count).toBe(7);
  });
});
