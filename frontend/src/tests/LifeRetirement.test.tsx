import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LifeRetirementPanel from '../features/planning/LifeRetirementPanel';
import { apiClient } from '../api/client';
import type { LifeInput } from '../api/lifeSimulator';
vi.mock('../api/client', () => ({ apiClient: { post: vi.fn() } }));
const baseline: LifeInput = {
  name: 'Retirement fixture',
  start: '2026-10-28',
  months: 120,
  currency: 'CNY',
  cash: 10000,
  investments: 10000,
  otherAssets: 1000000,
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
  unscheduledDebt: 0,
  loans: [],
  events: [],
  goals: [],
  assumptionSource: 'Test assumptions',
  snapshotId: 'snapshot',
};
beforeEach(() => vi.clearAllMocks());
it('requests a computed retirement plan and only applies it explicitly', async () => {
  const onApply = vi.fn();
  const input = {
    ...baseline,
    months: 480,
    investmentDrawdownFrom: '2041-10-28',
  };
  vi.mocked(apiClient.post).mockResolvedValue({
    data: {
      data: {
        input,
        result: { modelVersion: 'life-monthly-3', firstShortfall: null },
        retirementDate: '2041-10-28',
        endExclusive: '2066-10-28',
        financialAssetsAtRetirement: 20000,
        targetRetirementAssets: 100000,
        additionalCapitalToday: 80000,
        additionalMonthlySaving: 500,
        financialAssetsDepleted: null,
        limitations: ['TEST_ASSUMPTIONS'],
      },
    },
  });
  render(<LifeRetirementPanel input={baseline} onApply={onApply} />);
  fireEvent.click(screen.getByText('预览退休规划'));
  await screen.findByText('TEST_ASSUMPTIONS');
  expect(onApply).not.toHaveBeenCalled();
  expect(apiClient.post).toHaveBeenCalledWith(
    '/life-simulator/retirement-preview',
    expect.objectContaining({
      baseline,
      currentAge: 45,
      retirementAge: 60,
      endAge: 85,
    }),
    expect.any(Object),
  );
  fireEvent.click(screen.getByText('应用退休计划到情景（审核后计算归档）'));
  expect(onApply).toHaveBeenCalledWith(input);
  fireEvent.change(screen.getByLabelText('退休每月生活支出'), {
    target: { value: '6000' },
  });
  expect(
    screen.queryByText('应用退休计划到情景（审核后计算归档）'),
  ).not.toBeInTheDocument();
});
it('cancels its request without changing a scenario or ledger', async () => {
  const onApply = vi.fn();
  let signal: AbortSignal | undefined;
  vi.mocked(apiClient.post).mockImplementation(
    (_url, _data, config) =>
      new Promise((_resolve, reject) => {
        signal = config?.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new Error('cancelled')));
      }),
  );
  render(<LifeRetirementPanel input={baseline} onApply={onApply} />);
  fireEvent.click(screen.getByText('预览退休规划'));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
  fireEvent.click(screen.getByText('取消退休测算'));
  await screen.findByText('cancelled');
  expect(signal?.aborted).toBe(true);
  expect(onApply).not.toHaveBeenCalled();
});
