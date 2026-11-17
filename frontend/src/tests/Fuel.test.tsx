import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import FuelPage from '../pages/FuelPage';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { fuelApi, fuelCsv } from '../features/fuel/api';
import { fuelBulkApi } from '../features/fuel/bulk';
import type { FuelReport, Vehicle } from '../features/fuel/api';
import { useUI } from '../stores/ui';
import { activeNavigation } from '../design/navigation';
vi.mock('../components/Chart', () => ({
  default: () => <div>Fuel chart</div>,
}));
vi.mock('../features/fuel/bulk', () => ({
  fuelBulkApi: { apply: vi.fn(), trash: vi.fn() },
}));
vi.mock('../features/fuel/strategy', () => ({
  strategyApi: {
    list: vi.fn().mockResolvedValue([]),
    preview: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../features/fuel/api', async (original) => ({
  ...(await original<typeof import('../features/fuel/api')>()),
  fuelApi: {
    vehicles: vi.fn(),
    report: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));
const vehicles: Vehicle[] = [
  {
    id: 'car',
    version: '1',
    name: 'Private car',
    plate: 'TEST123',
    fuelType: 'Petrol',
  },
];
const fixture: FuelReport = {
  records: [
    {
      id: 'fill',
      version: '3',
      vehicleId: 'car',
      date: '2026-01-10',
      odometer: 1500,
      litres: 30,
      amount: 210,
      currency: 'CNY',
      fullTank: true,
      tankStatus: 'Full',
      fuelGrade: 'Petrol95',
      missedFill: false,
      station: 'Private station',
      note: 'Private note',
      unitPrice: 7,
      interval: { distance: 500, litres: 50, litresPer100Km: 10 },
    },
  ],
  summary: {
    count: 1,
    litres: 30,
    amount: 210,
    currency: 'CNY',
    otherCurrencyCount: 0,
    completedIntervals: 1,
    distance: 500,
    consumedLitres: 50,
    litresPer100Km: 10,
  },
  monthly: [{ month: '2026-01', litres: 30, amount: 210 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(fuelApi.vehicles).mockResolvedValue(vehicles);
  vi.mocked(fuelApi.report).mockResolvedValue(fixture);
  vi.mocked(fuelApi.save).mockResolvedValue({} as never);
  vi.mocked(fuelBulkApi.apply).mockResolvedValue({
    count: 2,
    action: 'Delete',
  });
  vi.mocked(fuelBulkApi.trash).mockResolvedValue({
    records: [],
    total: 0,
    limit: 200,
  });
});
afterEach(cleanup);
function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="fuel-location">{location.search}</output>
      <button onClick={() => navigate(-1)}>Back test</button>
      <button onClick={() => navigate(1)}>Forward test</button>
    </>
  );
}
function show(entry = '/analytics/fuel?tab=records') {
  return render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={[entry]}>
          <FuelPage />
          <NavigationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
it('belongs to Analysis and reports and shows full-tank denominators', async () => {
  expect(activeNavigation('/analytics/fuel')?.group).toBe('analysis');
  show();
  fireEvent.click(screen.getByRole('tab', { name: '总览仪表盘' }));
  expect(await screen.findByText('加权平均油耗')).toBeVisible();
  expect(screen.getByText(/首次加满仅建立基线/)).toBeVisible();
  expect(screen.getByText(/不自动创建支出/)).toBeVisible();
  expect(screen.queryByText('Private station · Private note')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '加油记录' }));
  expect(
    await screen.findByText('Private station · Private note'),
  ).toBeVisible();
});
it('hides private vehicle, station, notes and charts and disables export', async () => {
  useUI.setState({ hidden: true });
  show();
  await screen.findByRole('tab', { name: '加油记录' });
  expect(screen.queryByText('Private car')).toBeNull();
  expect(screen.queryByText('Private station · Private note')).toBeNull();
  expect(screen.queryByText('Fuel chart')).toBeNull();
  expect(screen.getByRole('button', { name: '导出 CSV' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '导入历史 CSV' })).toBeDisabled();
});
it('adds a vehicle through the persistent API', async () => {
  show();
  await screen.findByRole('tab', { name: '车辆档案' });
  fireEvent.click(screen.getByRole('button', { name: '添加车辆' }));
  fireEvent.change(await screen.findByLabelText('车辆名称'), {
    target: { value: 'New car' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'vehicles',
      expect.objectContaining({
        name: 'New car',
        plate: '',
        fuelType: 'Petrol',
        energyType: 'Unknown',
        status: 'Active',
      }),
      undefined,
      expect.any(String),
    ),
  );
});
it('uses the opened record version when editing a fill', async () => {
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: /^编\s*辑$/ }));
  fireEvent.click(await screen.findByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'records',
      expect.objectContaining({
        vehicleId: 'car',
        date: '2026-01-10',
        odometer: 1500,
        fuelGrade: 'Petrol95',
        fullTank: true,
        tankStatus: 'Full',
      }),
      expect.objectContaining({ id: 'fill', version: '3' }),
      expect.any(String),
    ),
  );
});
it('provides English UI and distinguishes missing consumption from zero', async () => {
  useUI.setState({ language: 'en' });
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    records: [],
    monthly: [],
    summary: {
      ...fixture.summary,
      litresPer100Km: null,
      completedIntervals: 0,
    },
  });
  show();
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
  expect(await screen.findByText('Weighted consumption')).toBeVisible();
  expect(screen.getByText('Vehicle energy center')).toBeVisible();
  expect(
    within(
      screen
        .getByText('Weighted consumption')
        .closest('.ant-card') as HTMLElement,
    ).getByText('—'),
  ).toBeVisible();
});
it('CSV escapes formula injection, embedded quotes and newlines', () => {
  const csv = fuelCsv(
    [{ ...fixture.records[0], station: ' =SUM(1,2)', note: 'hello\n"quote"' }],
    vehicles,
  );
  expect(csv).toContain('"\' =SUM(1,2)"');
  expect(csv).toContain('"hello\n""quote"""');
});
it('keeps the delete dialog and record when deletion fails and shows the error', async () => {
  vi.mocked(fuelApi.remove).mockRejectedValueOnce(
    new Error('Deletion unavailable'),
  );
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: /^删\s*除$/ }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: /^OK$/ }));
  expect(await screen.findByText('Deletion unavailable')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(screen.getByText('Private station · Private note')).toBeVisible();
  expect(fuelApi.remove).toHaveBeenCalledWith(
    'records',
    expect.objectContaining({ id: 'fill', version: '3' }),
  );
});
it('saves a historical fill without inventing an odometer and preserves the open record version', async () => {
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    records: [{ ...fixture.records[0], odometer: null, interval: null }],
  });
  show();
  await screen.findByText('未记录');
  fireEvent.click(screen.getByRole('button', { name: /^编\s*辑$/ }));
  expect(
    await screen.findByRole('checkbox', { name: '历史补录（里程可留空）' }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'records',
      expect.objectContaining({
        odometer: null,
        historicalBackfill: true,
        date: '2026-01-10',
        litres: 30,
        amount: 210,
      }),
      expect.objectContaining({ id: 'fill', version: '3' }),
      expect.any(String),
    ),
  );
});
it('requires odometer for a regular fill even when editing a historical record', async () => {
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    records: [{ ...fixture.records[0], odometer: null, interval: null }],
  });
  show();
  await screen.findByText('未记录');
  fireEvent.click(screen.getByRole('button', { name: /^编\s*辑$/ }));
  fireEvent.click(
    await screen.findByRole('checkbox', { name: '历史补录（里程可留空）' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText('最近加油请填写累计里程')).toBeVisible();
  expect(fuelApi.save).not.toHaveBeenCalled();
});
it('does not allow a current fill to omit its odometer by selecting backfill', async () => {
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: '记录加油' }));
  fireEvent.click(
    await screen.findByRole('checkbox', { name: '历史补录（里程可留空）' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(
    await screen.findByText('无里程的历史补录日期须早于今天'),
  ).toBeVisible();
  expect(fuelApi.save).not.toHaveBeenCalled();
});
it('exports a missing odometer as an empty CSV cell and retains a real zero reading', () => {
  const csv = fuelCsv(
    [
      { ...fixture.records[0], odometer: null },
      { ...fixture.records[0], id: 'zero', odometer: 0 },
    ],
    vehicles,
  );
  expect(csv.split('\r\n')[1]).toContain('"Private car","","30"');
  expect(csv.split('\r\n')[2]).toContain('"Private car","0","30"');
});
it('recalculates litres from the entered amount and unit price and saves provenance', async () => {
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: /^编\s*辑$/ }));
  fireEvent.click(
    await screen.findByRole('radio', { name: '按金额和单价计算' }),
  );
  fireEvent.change(await screen.findByLabelText('每升单价（所选币种/L）'), {
    target: { value: '8' },
  });
  fireEvent.change(screen.getByLabelText('实付金额'), {
    target: { value: '200' },
  });
  await waitFor(() =>
    expect(screen.getByLabelText('加油量（L）')).toHaveValue('25.000'),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'records',
      expect.objectContaining({
        amount: 200,
        enteredUnitPrice: 8,
        litres: 25,
        quantitySource: 'Calculated',
      }),
      expect.objectContaining({ id: 'fill', version: '3' }),
      expect.any(String),
    ),
  );
});
it('expands backend evidence and hides it in privacy mode', async () => {
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    records: [
      {
        ...fixture.records[0],
        assessment: {
          recordId: 'fill',
          status: 'VALID',
          reason: 'FULL_TO_FULL',
          start: {
            id: 'earlier-baseline',
            date: '2025-12-31',
            odometer: 1000,
            litres: 40,
            tankStatus: 'Full',
          },
          end: {
            id: 'fill',
            date: '2026-01-10',
            odometer: 1500,
            litres: 30,
            tankStatus: 'Full',
          },
          participatingRecords: [
            {
              id: 'fill',
              date: '2026-01-10',
              odometer: 1500,
              litres: 50,
              tankStatus: 'Full',
            },
          ],
          litres: 50,
          distance: 500,
          litresPer100Km: 10,
          ruleVersion: '2.0',
          calculatedAt: '2026-10-30T00:00:00Z',
        },
      },
    ],
  });
  const view = show();
  await screen.findByText('Private station · Private note');
  const expand = view.container.querySelector(
    'button.ant-table-row-expand-icon',
  );
  expect(expand).not.toBeNull();
  fireEvent.click(expand!);
  expect(
    await screen.findByText('50 L ÷ 500 km × 100 = 10 L/100km'),
  ).toBeVisible();
  expect(screen.getByText(/2025-12-31.*earlier-baseline/)).toBeVisible();
  useUI.setState({ hidden: true });
  await waitFor(() =>
    expect(
      screen.queryByText('50 L ÷ 500 km × 100 = 10 L/100km'),
    ).not.toBeInTheDocument(),
  );
});
it('restores URL filters across tabs and browser history without refetching', async () => {
  show(
    '/analytics/fuel?tab=records&vehicle=car&currency=USD&from=2026-01-01&to=2026-10-30',
  );
  await screen.findByText('Private station · Private note');
  const calls = vi.mocked(fuelApi.report).mock.calls.length;
  expect(fuelApi.report).toHaveBeenLastCalledWith({
    vehicleId: 'car',
    currency: 'USD',
    from: '2026-01-01',
    to: '2026-10-30',
  });
  fireEvent.click(screen.getByRole('tab', { name: '车辆档案' }));
  expect(await screen.findByText('车辆管理')).toBeVisible();
  expect(screen.queryByText('Private station · Private note')).toBeNull();
  expect(screen.getByTestId('fuel-location').textContent).toContain(
    'tab=vehicles',
  );
  expect(screen.getByTestId('fuel-location').textContent).toContain(
    'currency=USD',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back test' }));
  expect(
    await screen.findByText('Private station · Private note'),
  ).toBeVisible();
  expect(screen.getByTestId('fuel-location').textContent).toContain(
    'tab=records',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Forward test' }));
  expect(await screen.findByText('车辆管理')).toBeVisible();
  expect(vi.mocked(fuelApi.report).mock.calls.length).toBe(calls);
  fireEvent.click(screen.getByRole('tab', { name: '油耗分析' }));
  expect(await screen.findByText('区间计算与数据质量')).toBeVisible();
  expect(screen.getByText('加权平均油耗')).toBeVisible();
});
it('opens the prices workspace with real report groups and retains grade in CSV', async () => {
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    stationPrices: [
      {
        station: 'PRIVATE STATION',
        vehicleId: 'car',
        fuelGrade: 'Petrol95',
        currency: 'CNY',
        count: 1,
        litres: 30,
        amount: 210,
        weightedUnitPrice: 7,
        minimumUnitPrice: 7,
        maximumUnitPrice: 7,
        estimatedQuantityCount: 0,
        recordIds: ['fill'],
        trend: [{ date: '2026-01-10', unitPrice: 7 }],
      },
    ],
  });
  show('/analytics/fuel?tab=prices');
  expect(await screen.findByText('PRIVATE STATION')).toBeVisible();
  expect(screen.getByRole('tab', { name: '油价与加油站' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(fuelCsv(fixture.records, vehicles)).toContain('"Petrol95"');
});
it('edits vehicle profile fields while preserving original purchase date and currency', async () => {
  const vehicle: Vehicle = {
    ...vehicles[0],
    brand: 'Old brand',
    model: 'Model A',
    energyType: 'Hybrid',
    status: 'Active',
    tankCapacity: 55,
    purchaseDate: '2020-01-02',
    purchaseAmount: 100000,
    purchaseCurrency: 'USD',
    initialOdometer: 0,
    currentOdometer: 5000,
    latestRecordedOdometer: 6000,
    annualDistance: 12000,
    note: 'Profile note',
  };
  vi.mocked(fuelApi.vehicles).mockResolvedValue([vehicle]);
  show('/analytics/fuel?tab=vehicles');
  fireEvent.click(await screen.findByRole('button', { name: '编辑车辆' }));
  fireEvent.change(await screen.findByLabelText('品牌'), {
    target: { value: 'New brand' },
  });
  expect(screen.getByLabelText('原始购置金额')).toHaveValue('100000.00');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'vehicles',
      expect.objectContaining({
        brand: 'New brand',
        model: 'Model A',
        purchaseDate: '2020-01-02',
        purchaseAmount: 100000,
        purchaseCurrency: 'USD',
        status: 'Active',
        energyType: 'Hybrid',
        note: 'Profile note',
      }),
      expect.objectContaining({ id: 'car', version: '1' }),
      expect.any(String),
    ),
  );
});
it('archives and restores a vehicle without deleting history and disables new fills while archived', async () => {
  const active: Vehicle = { ...vehicles[0], status: 'Active' };
  const archived: Vehicle = { ...active, status: 'Archived', version: '2' };
  vi.mocked(fuelApi.vehicles)
    .mockResolvedValueOnce([active])
    .mockResolvedValue([archived]);
  show('/analytics/fuel?tab=vehicles&vehicle=car');
  fireEvent.click(await screen.findByRole('button', { name: '归档车辆' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'vehicles',
      expect.objectContaining({ status: 'Archived' }),
      active,
    ),
  );
  expect(await screen.findByRole('button', { name: '恢复车辆' })).toBeVisible();
  expect(screen.getByRole('button', { name: '记录加油' })).toBeDisabled();
  expect(fuelApi.remove).not.toHaveBeenCalled();
  vi.mocked(fuelApi.vehicles).mockResolvedValue([{ ...active, version: '3' }]);
  fireEvent.click(screen.getByRole('button', { name: '恢复车辆' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'vehicles',
      expect.objectContaining({ status: 'Active' }),
      archived,
    ),
  );
  expect(await screen.findByRole('button', { name: '归档车辆' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '查看记录' }));
  expect(
    await screen.findByText('Private station · Private note'),
  ).toBeVisible();
});
it('hides expanded vehicle profile data in privacy mode', async () => {
  useUI.setState({ hidden: true });
  vi.mocked(fuelApi.vehicles).mockResolvedValue([
    {
      ...vehicles[0],
      brand: 'Secret brand',
      model: 'Secret model',
      note: 'Secret profile',
      purchaseAmount: 123456,
      purchaseCurrency: 'USD',
      currentOdometer: 9999,
    },
  ]);
  show('/analytics/fuel?tab=vehicles');
  await screen.findByText('车辆管理');
  expect(
    screen.queryByText(/Secret brand|Secret model|Secret profile|123456|9999/),
  ).toBeNull();
  expect(screen.queryByText('Private car')).toBeNull();
});
it('keeps profile edits after failed archive and never calls deletion', async () => {
  vi.mocked(fuelApi.vehicles).mockResolvedValue([
    { ...vehicles[0], status: 'Active' },
  ]);
  vi.mocked(fuelApi.save).mockRejectedValueOnce(
    new Error('Archive unavailable'),
  );
  show('/analytics/fuel?tab=vehicles');
  fireEvent.click(await screen.findByRole('button', { name: '归档车辆' }));
  expect(await screen.findByText('Archive unavailable')).toBeVisible();
  expect(screen.getByRole('button', { name: '归档车辆' })).toBeVisible();
  expect(fuelApi.remove).not.toHaveBeenCalled();
});
it('shows live tank-capacity risk without preventing an explained historical save', async () => {
  vi.mocked(fuelApi.vehicles).mockResolvedValue([
    { ...vehicles[0], tankCapacity: 20 },
  ]);
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: /^编\s*辑$/ }));
  await waitFor(() =>
    expect(screen.getByText(/加油量超过车辆档案油箱容量/)).toBeVisible(),
  );
  fireEvent.change(screen.getByLabelText('备注（选填）'), {
    target: { value: 'Extra fuel container' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(fuelApi.save).toHaveBeenCalledWith(
      'records',
      expect.objectContaining({ litres: 30, note: 'Extra fuel container' }),
      expect.objectContaining({ id: 'fill' }),
      expect.any(String),
    ),
  );
});
it('restores record search from URL and clears it without refetching report statistics', async () => {
  const other = {
    ...fixture.records[0],
    id: 'other',
    station: 'Other station',
    note: 'Other note',
    currency: 'USD',
  };
  vi.mocked(fuelApi.report).mockResolvedValue({
    ...fixture,
    records: [fixture.records[0], other],
  });
  show(
    '/analytics/fuel?tab=analysis&q=Other&recordCurrency=USD&tank=Full&recordSort=amount-asc',
  );
  expect(await screen.findByText('Other station · Other note')).toBeVisible();
  expect(screen.queryByText('Private station · Private note')).toBeNull();
  expect(screen.getByText('加权平均油耗')).toBeVisible();
  const calls = vi.mocked(fuelApi.report).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '清除记录筛选' }));
  expect(
    await screen.findByText('Private station · Private note'),
  ).toBeVisible();
  expect(screen.getByTestId('fuel-location').textContent).not.toContain(
    'recordCurrency',
  );
  expect(vi.mocked(fuelApi.report).mock.calls.length).toBe(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Back test' }));
  await waitFor(() =>
    expect(screen.queryByText('Private station · Private note')).toBeNull(),
  );
  expect(screen.getByLabelText('搜索加油记录')).toHaveValue('Other');
});
it('debounces search and exports every matching row in list order', async () => {
  const create = vi.fn((_blob: Blob) => 'blob:fuel-export');
  const revoke = vi.fn();
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  try {
    const other = {
      ...fixture.records[0],
      id: 'other',
      station: 'Other station',
      note: 'Other note',
    };
    vi.mocked(fuelApi.report).mockResolvedValue({
      ...fixture,
      records: [fixture.records[0], other],
    });
    show();
    await screen.findByText('Other station · Other note');
    fireEvent.change(screen.getByLabelText('搜索加油记录'), {
      target: { value: 'Other' },
    });
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.queryByText('Private station · Private note')).toBeNull(),
    );
    expect(screen.getByTestId('fuel-location').textContent).toContain(
      'q=Other',
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(create.mock.calls[0][0]);
    });
    expect(content).toContain('Other station');
    expect(content).not.toContain('Private station');
    expect(content.split('\r\n')).toHaveLength(2);
    await waitFor(
      () => expect(revoke).toHaveBeenCalledWith('blob:fuel-export'),
      { timeout: 2000 },
    );
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
it('resets pagination when search narrows a later page', async () => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    ...fixture.records[0],
    id: `row-${index}`,
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    station: `Unique station ${index}`,
    note: '',
  }));
  vi.mocked(fuelApi.report).mockResolvedValue({ ...fixture, records });
  show();
  await screen.findByText('Unique station 11');
  fireEvent.click(screen.getByTitle('2'));
  expect(await screen.findByText('Unique station 0')).toBeVisible();
  fireEvent.change(screen.getByLabelText('搜索加油记录'), {
    target: { value: 'Unique station 11' },
  });
  expect(await screen.findByText('Unique station 11')).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByText('Unique station 0')).toBeNull(),
  );
  expect(screen.getByTitle('1')).toHaveClass('ant-pagination-item-active');
});
it('opens the fuel CSV importer and closes without submitting data', async () => {
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: '导入历史 CSV' }));
  expect(
    await screen.findByRole('button', { name: '确认导入有效行并跳过重复' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('加油CSV内容')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '关闭（不导入）' }));
  expect(fuelApi.save).not.toHaveBeenCalled();
});
it('preserves row selection across pages and submits only explicitly selected versions', async () => {
  const records = Array.from({ length: 12 }, (_, i) => ({
    ...fixture.records[0],
    id: `row-${i}`,
    version: String(i + 1),
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  }));
  vi.mocked(fuelApi.report).mockResolvedValue({ ...fixture, records });
  const view = show();
  await screen.findByText(
    '显示 12 / 12 条。记录筛选和排序只影响下方列表及导出，不改变顶端车辆与日期范围的统计口径。金额与单价排序按原币分组，缺失值置后。',
  );
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="row-11"] input[type="checkbox"]',
    )!,
  );
  fireEvent.click(screen.getByTitle('2'));
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="row-0"] input[type="checkbox"]',
    )!,
  );
  expect(screen.getByText('已选 2 条（最多200条）')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '批量移入回收站' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() =>
    expect(fuelBulkApi.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Delete',
        targets: expect.arrayContaining([
          { id: 'row-11', version: '12' },
          { id: 'row-0', version: '1' },
        ]),
      }),
      expect.any(String),
    ),
  );
  expect(vi.mocked(fuelBulkApi.apply).mock.calls[0][0].targets).toHaveLength(2);
});
it('loads recoverable trash separately and restores selected original records', async () => {
  vi.mocked(fuelBulkApi.trash).mockResolvedValue({
    records: [
      {
        ...fixture.records[0],
        id: 'trashed-fill',
        version: '4',
        station: 'Trashed station',
      },
    ],
    total: 1,
    limit: 200,
  });
  const view = show('/analytics/fuel?tab=records&trash=1');
  expect(await screen.findByText('Trashed station')).toBeVisible();
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="trashed-fill"] input[type="checkbox"]',
    )!,
  );
  fireEvent.click(screen.getByRole('button', { name: '批量恢复' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() =>
    expect(fuelBulkApi.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Restore',
        targets: [{ id: 'trashed-fill', version: '4' }],
      }),
      expect.any(String),
    ),
  );
});
it('clears batch selection when the record filter scope changes', async () => {
  const view = show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="fill"] input[type="checkbox"]',
    )!,
  );
  expect(screen.getByText('已选 1 条（最多200条）')).toBeVisible();
  fireEvent.change(screen.getByLabelText('搜索加油记录'), {
    target: { value: 'no matching record' },
  });
  await waitFor(() =>
    expect(screen.getByText('已选 0 条（最多200条）')).toBeVisible(),
  );
  expect(screen.getByRole('button', { name: '批量移入回收站' })).toBeDisabled();
  expect(fuelBulkApi.apply).not.toHaveBeenCalled();
});

it('keeps an unsaved new-fill draft on cancel and restores it without posting', async () => {
  show();
  await screen.findByText('Private station · Private note');
  fireEvent.click(screen.getByRole('button', { name: '记录加油' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(screen.getByLabelText('加油站（选填）')).toHaveValue(
    'Private station',
  );
  fireEvent.change(screen.getByLabelText('备注（选填）'), {
    target: { value: 'Unsaved fuel draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^取\s*消$/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: '恢复未保存草稿' }),
  );
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(screen.getByLabelText('备注（选填）')).toHaveValue(
    'Unsaved fuel draft',
  );
  expect(fuelApi.save).not.toHaveBeenCalled();
});
