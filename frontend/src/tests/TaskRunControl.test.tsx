import { beforeEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { App } from 'antd';
import { TaskRunControl } from '../features/reconciliation/TaskRunControl';
import { smartApi, type Task } from '../features/reconciliation/api';
import { useUI } from '../stores/ui';
vi.mock('../features/reconciliation/api', () => ({
  smartApi: { stepTaskCompact: vi.fn() },
}));
const task: Task = {
  id: 'task',
  state: 'Running',
  startsAt: '2026-10-01T00:00:00+08:00',
  endsAt: '2026-10-26T23:59:59+08:00',
  processed: 0,
  total: 21,
  failed: 0,
  version: '1',
};
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ language: 'zh-CN' });
});
function show() {
  const progress = vi.fn();
  const running = vi.fn();
  const finished = vi.fn(async () => {});
  render(
    <App>
      <TaskRunControl
        task={task}
        disabled={false}
        onRunningChange={running}
        onProgress={progress}
        onFinished={finished}
      />
    </App>,
  );
  return { progress, running, finished };
}
it('runs serial bounded suggestion steps using each returned version', async () => {
  vi.mocked(smartApi.stepTaskCompact)
    .mockResolvedValueOnce({ ...task, processed: 20, version: '2' })
    .mockResolvedValueOnce({
      ...task,
      state: 'Completed',
      processed: 21,
      version: '3',
    });
  const callbacks = show();
  fireEvent.click(screen.getByRole('button', { name: '连续生成建议' }));
  await waitFor(() => expect(callbacks.finished).toHaveBeenCalledOnce());
  expect(smartApi.stepTaskCompact).toHaveBeenCalledTimes(2);
  expect(smartApi.stepTaskCompact).toHaveBeenNthCalledWith(
    1,
    'task',
    '1',
    expect.any(String),
  );
  expect(smartApi.stepTaskCompact).toHaveBeenNthCalledWith(
    2,
    'task',
    '2',
    expect.any(String),
  );
  expect(callbacks.progress).toHaveBeenLastCalledWith(
    expect.objectContaining({ processed: 21, state: 'Completed' }),
  );
  expect(callbacks.running.mock.calls).toEqual([[true], [false]]);
});
it('pauses after the in-flight committed step and starts no further request', async () => {
  let resolve!: (value: Task) => void;
  vi.mocked(smartApi.stepTaskCompact).mockImplementationOnce(
    () =>
      new Promise<Task>((r) => {
        resolve = r;
      }),
  );
  const callbacks = show();
  fireEvent.click(screen.getByRole('button', { name: '连续生成建议' }));
  fireEvent.click(await screen.findByRole('button', { name: '暂停建议任务' }));
  await act(async () => resolve({ ...task, processed: 20, version: '2' }));
  await waitFor(() => expect(callbacks.finished).toHaveBeenCalledOnce());
  expect(smartApi.stepTaskCompact).toHaveBeenCalledOnce();
  expect(callbacks.progress).toHaveBeenLastCalledWith(
    expect.objectContaining({ processed: 20, version: '2' }),
  );
  expect(callbacks.running.mock.calls).toEqual([[true], [false]]);
});
