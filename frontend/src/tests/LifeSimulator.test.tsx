import { beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import LifeSimulatorPage from '../pages/LifeSimulatorPage';
import {
  lifeApi,
  type LifeInput,
  type LifeSnapshot,
} from '../api/lifeSimulator';
import { applyLifePreset } from '../features/planning/lifePresets';
import { useUI } from '../stores/ui';
vi.mock('../api/lifeSimulator', () => ({
  lifeApi: {
    snapshot: vi.fn(),
    list: vi.fn(),
    calculate: vi.fn(),
    save: vi.fn(),
    scenario: vi.fn(),
    run: vi.fn(),
    compare: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../components/Chart', () => ({
  default: () => <div role="img" aria-label="computed chart" />,
}));
const input: LifeInput = {
  name: 'Baseline',
  start: '2026-10-27',
  months: 120,
  currency: 'CNY',
  cash: 10000,
  investments: 0,
  otherAssets: 0,
  restrictedAssets: 0,
  monthlyIncome: 8000,
  monthlyExpense: 5000,
  incomeGrowth: 0,
  expenseGrowth: 0,
  inflation: 0,
  investmentReturn: 0,
  cashReturn: 0,
  otherReturn: 0,
  reserveFloor: 0,
  loans: [],
  events: [],
  goals: [],
  assumptionSource: 'Explicit test assumptions',
  snapshotId: 'snapshot',
  unscheduledDebt: 0,
};
const snapshot: LifeSnapshot = {
  capturedAt: '2026-10-27T12:00:00+08:00',
  scope: 'Personal only',
  allocation: { complete: true, uncovered: 0 },
  suggested: input,
  missing: ['CONFIRM_FUTURE_NET_INCOME_AND_EXPENSE'],
};
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ language: 'zh-CN', hidden: false });
  vi.mocked(lifeApi.list).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  vi.mocked(lifeApi.snapshot).mockResolvedValue({ id: 'snapshot', snapshot });
  vi.mocked(lifeApi.save).mockResolvedValue({ id: 'scenario', version: '1' });
});
function show() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App>
          <LifeSimulatorPage />
        </App>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
it('reads an explicit baseline and requires review before calculation', async () => {
  show();
  fireEvent.click(screen.getByText('读取并冻结财务基准'));
  expect(await screen.findByText('确认未来税后收入与费用')).toBeInTheDocument();
  expect(screen.getByText('执行模拟并归档').closest('button')).toBeDisabled();
  fireEvent.click(
    screen.getByText('我已审核未来收入、费用、资产分类和贷款假设'),
  );
  expect(
    screen.getByText('执行模拟并归档').closest('button'),
  ).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText('预计每月税后收入'), {
    target: { value: '9000' },
  });
  expect(screen.getByText('执行模拟并归档').closest('button')).toBeDisabled();
});
it('adds a housing event set and saves isolated input', async () => {
  show();
  fireEvent.click(screen.getByText('读取并冻结财务基准'));
  await screen.findByLabelText('预计每月税后收入');
  fireEvent.click(screen.getByText('添加决策到时间线'));
  expect(screen.getAllByLabelText('事件名称')).toHaveLength(2);
  fireEvent.click(screen.getByText('保存情景'));
  await waitFor(() =>
    expect(lifeApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        loans: expect.arrayContaining([
          expect.objectContaining({ principal: 800000 }),
        ]),
        events: expect.arrayContaining([
          expect.objectContaining({ type: 'BuyAsset', amount: 1000000 }),
        ]),
      }),
      undefined,
      undefined,
    ),
  );
});
it('shows a failed baseline read without inventing results', async () => {
  vi.mocked(lifeApi.snapshot).mockRejectedValue(
    new Error('Baseline unavailable'),
  );
  show();
  fireEvent.click(screen.getByText('读取并冻结财务基准'));
  expect(
    (await screen.findAllByText('Baseline unavailable')).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText('执行模拟并归档')).not.toBeInTheDocument();
});
it('housing preset creates one loan, one borrowing and one asset purchase', () => {
  const b = applyLifePreset(
    input,
    'housing',
    1000000,
    360,
    3,
    input.start,
    20,
    'EqualPayment',
  );
  expect(b.loans).toHaveLength(1);
  expect(b.events.map((x) => x.type)).toEqual(['Borrow', 'BuyAsset']);
  expect(b.loans[0].principal).toBe(800000);
  expect(b.loans[0].firstPayment).toBe('2026-11-27');
});
it('unemployment restores income at the actual calendar month', () => {
  const b = applyLifePreset(
    input,
    'unemployment',
    1000,
    6,
    0,
    '2026-10-31',
    0,
    'EqualPayment',
  );
  expect(b.events[1].date).toBe('2027-04-30');
  expect(b.events[1].amount).toBe(8000);
});
it('retirement changes income and expenses without spending home equity', () => {
  const b = applyLifePreset(
    input,
    'retirement',
    2000,
    1,
    0,
    input.start,
    5000,
    'EqualPayment',
  );
  expect(b.events.map((x) => [x.type, x.amount])).toEqual([
    ['IncomeChange', 2000],
    ['ExpenseChange', 5000],
  ]);
  expect(b.restrictedAssets).toBe(input.restrictedAssets);
});
it('prepayment requires a simulated loan', () => {
  expect(() =>
    applyLifePreset(
      input,
      'repayment',
      10000,
      1,
      0,
      input.start,
      0,
      'EqualPayment',
    ),
  ).toThrow();
});
it('keeps an in-flight result out of the current view after assumptions change', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof lifeApi.calculate>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof lifeApi.calculate>>>(
    (done) => {
      resolve = done;
    },
  );
  vi.mocked(lifeApi.calculate).mockReturnValue(pending);
  show();
  fireEvent.click(screen.getByText('读取并冻结财务基准'));
  await screen.findByLabelText('预计每月税后收入');
  fireEvent.click(
    screen.getByText('我已审核未来收入、费用、资产分类和贷款假设'),
  );
  fireEvent.click(screen.getByText('执行模拟并归档'));
  await waitFor(() => expect(lifeApi.calculate).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('预计每月税后收入'), {
    target: { value: '9000' },
  });
  await act(async () =>
    resolve({
      id: 'run',
      calculatedAt: '2026-10-28T00:00:00+08:00',
      result: {
        modelVersion: 'life-monthly-2',
        fingerprint: 'test',
        priceBase: input.start,
        currency: 'CNY',
        months: [],
        firstShortfall: null,
        minimumCash: 0,
        finalNetWorth: 0,
        totalIncome: 0,
        totalExpense: 0,
        totalInterest: 0,
        goals: [],
        warnings: [],
      },
    }),
  );
  expect(screen.queryByText('财务决策报告')).not.toBeInTheDocument();
  expect(screen.getByLabelText('预计每月税后收入')).toHaveValue('9000');
});
