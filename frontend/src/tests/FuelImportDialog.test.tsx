import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import FuelImportDialog from '../features/fuel/FuelImportDialog';
import { fuelImportApi } from '../features/fuel/import';
vi.mock('../features/fuel/import', async (original) => ({
  ...(await original<typeof import('../features/fuel/import')>()),
  fuelImportApi: { preview: vi.fn(), confirm: vi.fn() },
}));
const csv =
  'Date,Vehicle ID,Litres,Amount,Currency,Full tank\n2026-01-01,car,20,160,CNY,Unknown';
const vehicles = [
  { id: 'car', version: '1', name: 'Car', plate: '', fuelType: 'Petrol' },
];
const onClose = vi.fn(),
  onImported = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  onImported.mockResolvedValue(undefined);
  vi.mocked(fuelImportApi.preview).mockResolvedValue({
    rows: [{ row: 2, status: 'READY', reason: null, duplicateIds: [] }],
    ready: 1,
    duplicates: 0,
    errors: 0,
  });
  vi.mocked(fuelImportApi.confirm).mockResolvedValue({
    imported: 1,
    skippedDuplicates: 0,
    recordIds: ['new'],
  });
});
async function show() {
  const view = render(
    <App>
      <FuelImportDialog
        open
        onClose={onClose}
        onImported={onImported}
        vehicles={vehicles}
        english={false}
        hidden={false}
      />
    </App>,
  );
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  return view;
}
async function preview() {
  fireEvent.change(await screen.findByLabelText('加油CSV内容'), {
    target: { value: csv },
  });
  fireEvent.click(screen.getByRole('button', { name: '解析并预览' }));
  await screen.findByText('可导入 1，疑似重复 0，错误 0');
}
it('requires preview and explicit confirmation before writing', async () => {
  await show();
  expect(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  ).toBeDisabled();
  await preview();
  expect(fuelImportApi.confirm).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  );
  await waitFor(() => expect(fuelImportApi.confirm).toHaveBeenCalledTimes(1));
  expect(fuelImportApi.confirm).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        vehicleId: 'car',
        tankStatus: 'Unknown',
        odometer: null,
      }),
    ]),
    expect.any(String),
  );
  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
});
it('invalidates preview after text changes and never writes erroneous CSV', async () => {
  await show();
  await preview();
  fireEvent.change(screen.getByLabelText('加油CSV内容'), {
    target: { value: csv.replace(',20,', ',-20,') },
  });
  expect(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '解析并预览' }));
  expect(await screen.findByText(/litres数值或精度无效/)).toBeVisible();
  expect(fuelImportApi.confirm).not.toHaveBeenCalled();
  expect(fuelImportApi.preview).toHaveBeenCalledTimes(1);
});
it('retains the same batch and idempotency key when an uncertain request is retried', async () => {
  vi.mocked(fuelImportApi.confirm).mockRejectedValueOnce(
    new Error('Network result unknown'),
  );
  await show();
  await preview();
  fireEvent.click(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  );
  expect(await screen.findByText('Network result unknown')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  );
  await waitFor(() => expect(fuelImportApi.confirm).toHaveBeenCalledTimes(2));
  expect(vi.mocked(fuelImportApi.confirm).mock.calls[0]).toEqual(
    vi.mocked(fuelImportApi.confirm).mock.calls[1],
  );
});
it('shows server duplicate findings and does not enable an all-duplicate batch', async () => {
  vi.mocked(fuelImportApi.preview).mockResolvedValue({
    rows: [
      {
        row: 2,
        status: 'DUPLICATE',
        reason: 'Existing fill',
        duplicateIds: ['existing-id'],
      },
    ],
    ready: 0,
    duplicates: 1,
    errors: 0,
  });
  await show();
  fireEvent.change(await screen.findByLabelText('加油CSV内容'), {
    target: { value: csv },
  });
  fireEvent.click(screen.getByRole('button', { name: '解析并预览' }));
  expect(await screen.findByText('可导入 0，疑似重复 1，错误 0')).toBeVisible();
  expect(
    screen.getByRole('button', { name: '确认导入有效行并跳过重复' }),
  ).toBeDisabled();
  expect(fuelImportApi.confirm).not.toHaveBeenCalled();
});
it('invalidates a previous preview if a replacement file exceeds the size limit',async()=>{
 await show();await preview();
 const file=new File(['x'],'large.csv',{type:'text/csv'});Object.defineProperty(file,'size',{value:1024*1024+1});
 fireEvent.change(screen.getByLabelText('选择加油CSV文件'),{target:{files:[file]}});
 expect(await screen.findByText('文件最大1MB')).toBeVisible();
 expect(screen.getByRole('button',{name:'确认导入有效行并跳过重复'})).toBeDisabled();
 expect(fuelImportApi.confirm).not.toHaveBeenCalled();
});
