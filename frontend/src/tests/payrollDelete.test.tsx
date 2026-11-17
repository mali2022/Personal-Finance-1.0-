import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { PayrollDeleteButton } from '../features/payroll/DeleteButton';
const write = vi.hoisted(() => vi.fn());
vi.mock('../features/payroll/api', () => ({ payrollApi: { write } }));
beforeEach(() => {
  write.mockReset();
});
const setup = (resource: 'slips' | 'plans' | 'contributions') => {
  const cache = new QueryClient();
  const invalidate = vi.spyOn(cache, 'invalidateQueries');
  const deleted = vi.fn();
  render(
    <QueryClientProvider client={cache}>
      <App>
        <PayrollDeleteButton
          resource={resource}
          row={{ id: 'item-1', version: '7' }}
          onDeleted={deleted}
        />
      </App>
    </QueryClientProvider>,
  );
  return { invalidate, deleted };
};
it.each(['slips', 'plans', 'contributions'] as const)(
  'requires confirmation and deletes %s with the displayed version',
  async (resource) => {
    write.mockResolvedValue({ deleted: true });
    const { deleted, invalidate } = setup(resource);
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(deleted).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith(
      `/${resource}/item-1`,
      {},
      '7',
      'delete',
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payroll-center'] });
  },
);
it('cancel keeps the record without a request', async () => {
  const { deleted } = setup('slips');
  fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
  fireEvent.click(await screen.findByRole('button', { name: /取\s*消/ }));
  expect(write).not.toHaveBeenCalled();
  expect(deleted).not.toHaveBeenCalled();
});
it('shows a blocked deletion and keeps the record', async () => {
  write.mockRejectedValue(new Error('请先解除到账关联'));
  const { deleted, invalidate } = setup('slips');
  fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
  fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
  await screen.findByText('请先解除到账关联');
  expect(deleted).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});
