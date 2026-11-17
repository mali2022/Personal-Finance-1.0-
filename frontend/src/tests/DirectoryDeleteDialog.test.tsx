import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectoryDeleteDialog } from '../components/DirectoryDeleteDialog';
import { deletionApi } from '../api/deletion';
import { useUI } from '../stores/ui';
vi.mock('../api/deletion', () => ({
  deletionApi: { directoryPreview: vi.fn(), directories: vi.fn() },
}));

function show(all = false) {
  const close = vi.fn(),
    completed = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <App>
        <DirectoryDeleteDialog
          kind="projects"
          request={{ items: all ? [] : [{ id: 'unused', version: '4' }], all }}
          onClose={close}
          onCompleted={completed}
        />
      </App>
    </QueryClientProvider>,
  );
  return { close, completed };
}
beforeEach(() => {
  vi.resetAllMocks();
  useUI.setState({ language: 'zh-CN', hidden: false });
});
describe('目录删除确认', () => {
  it('全部删除先预览所有记录，确认仅提交预览快照与版本', async () => {
    vi.mocked(deletionApi.directoryPreview).mockResolvedValue({
      total: 2,
      allowed: 1,
      blocked: 1,
      items: [
        { id: 'unused', version: '4', name: '未用项目', allowed: true },
        { id: 'used', version: '9', name: '已用项目', allowed: false },
      ],
    });
    vi.mocked(deletionApi.directories).mockResolvedValue({
      deleted: 1,
      skipped: [{ id: 'used', version: '9', name: '已用项目', allowed: false }],
    });
    const callbacks = show(true);
    await screen.findByText('共 2 条，可删除 1 条，被引用 1 条');
    expect(deletionApi.directoryPreview).toHaveBeenCalledWith('projects', {
      items: [],
      all: true,
    });
    expect(deletionApi.directories).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(callbacks.completed).toHaveBeenCalledOnce());
    expect(deletionApi.directories).toHaveBeenCalledWith(
      'projects',
      [
        { id: 'unused', version: '4' },
        { id: 'used', version: '9' },
      ],
      expect.any(String),
    );
    expect(callbacks.close).toHaveBeenCalledOnce();
  });
  it('全部被引用时禁止确认删除，取消不会提交', async () => {
    vi.mocked(deletionApi.directoryPreview).mockResolvedValue({
      total: 1,
      allowed: 0,
      blocked: 1,
      items: [{ id: 'used', version: '1', name: '已用项目', allowed: false }],
    });
    const callbacks = show();
    await screen.findByText('共 1 条，可删除 0 条，被引用 1 条');
    expect(screen.getByRole('button', { name: '确认删除' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));
    expect(callbacks.close).toHaveBeenCalledOnce();
    expect(deletionApi.directories).not.toHaveBeenCalled();
  });
  it('删除请求未完成时禁止关闭或重复提交', async () => {
    vi.mocked(deletionApi.directoryPreview).mockResolvedValue({
      total: 1,
      allowed: 1,
      blocked: 0,
      items: [{ id: 'unused', version: '4', name: '未用项目', allowed: true }],
    });
    vi.mocked(deletionApi.directories).mockImplementation(
      () => new Promise(() => {}),
    );
    const callbacks = show();
    await screen.findByText('共 1 条，可删除 1 条，被引用 0 条');
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /取\s*消/ })).toBeDisabled(),
    );
    expect(callbacks.close).not.toHaveBeenCalled();
    expect(deletionApi.directories).toHaveBeenCalledOnce();
  });
});
