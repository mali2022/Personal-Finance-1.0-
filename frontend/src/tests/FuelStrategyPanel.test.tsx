import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import FuelStrategyPanel from '../features/fuel/FuelStrategyPanel';
import { strategyApi } from '../features/fuel/strategy';
import type { FuelStrategy } from '../features/fuel/strategy';
vi.mock('../features/fuel/strategy', () => ({
  strategyApi: {
    list: vi.fn(),
    preview: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));
const scenario: FuelStrategy = {
  id: 's',
  version: '3',
  input: {
    name: 'Station B',
    currency: 'CNY',
    litres: 40,
    baselinePrice: 8,
    alternativePrice: 7.5,
    coupon: 10,
    pointsValue: 5,
    extraDistance: 10,
    consumption: 8,
  },
  result: {
    baselineCost: 320,
    alternativeCost: 285,
    detourLitres: 0.8,
    detourCost: 6,
    netSaving: 29,
    ruleVersion: '1.0',
  },
};
const economyScenario: FuelStrategy = {
  ...scenario,
  id: 'economy',
  input: {
    ...scenario.input,
    name: 'Fuel saving plan',
    mode: 'Economy',
    monthlyDistance: 1000,
    annualDistance: 15000,
    targetConsumption: 6,
    years: 5,
  },
  result: {
    baselineCost: 640,
    alternativeCost: 480,
    detourCost: 0,
    detourLitres: 0,
    netSaving: 160,
    ruleVersion: 'economy-1.0',
    economy: {
      annualBaselineCost: 9600,
      annualTargetCost: 7200,
      annualSaving: 2400,
      totalSaving: 12000,
      sensitivity: [
        {
          priceFactor: 0.8,
          fuelPrice: 6.4,
          monthlySaving: 128,
          annualSaving: 1920,
          totalSaving: 9600,
        },
        {
          priceFactor: 1,
          fuelPrice: 8,
          monthlySaving: 160,
          annualSaving: 2400,
          totalSaving: 12000,
        },
      ],
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(strategyApi.list).mockResolvedValue([scenario]);
  vi.mocked(strategyApi.preview).mockResolvedValue(scenario.result);
  vi.mocked(strategyApi.save).mockResolvedValue({} as never);
  vi.mocked(strategyApi.remove).mockResolvedValue({} as never);
});
function show(hidden = false, economy = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <App>
      <QueryClientProvider client={cache}>
        <FuelStrategyPanel hidden={hidden} english={false} economy={economy} />
      </QueryClientProvider>
    </App>,
  );
  return { view, cache };
}
it('edits an existing scenario with its version and previews actual backend results', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑方案' }));
  expect(await screen.findByText('预计净节省 29 CNY')).toBeVisible();
  expect(strategyApi.preview).toHaveBeenLastCalledWith(scenario.input);
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() =>
    expect(strategyApi.save).toHaveBeenCalledWith(scenario.input, scenario),
  );
});
it('copies without reusing the original id and allows cancelling without saving', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '复制方案' }));
  expect(await screen.findByText('预计净节省 29 CNY')).toBeVisible();
  expect(screen.getByLabelText('方案名称')).toHaveValue('Station B 副本');
  fireEvent.click(screen.getByRole('button', { name: '保存方案' }));
  await waitFor(() =>
    expect(strategyApi.save).toHaveBeenCalledWith(
      { ...scenario.input, name: 'Station B 副本' },
      undefined,
    ),
  );
});
it('keeps invalid or failed previews from being saved', async () => {
  vi.mocked(strategyApi.preview).mockRejectedValue(
    new Error('Discount exceeds cost'),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑方案' }));
  expect(await screen.findByText('Discount exceeds cost')).toBeVisible();
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
  expect(strategyApi.save).not.toHaveBeenCalled();
});
it('does not request private scenario data in privacy mode', () => {
  show(true);
  expect(strategyApi.list).not.toHaveBeenCalled();
  expect(strategyApi.preview).not.toHaveBeenCalled();
  expect(screen.queryByText('Station B')).toBeNull();
});
it('deletes only the selected version after confirmation', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '删除方案' }));
  expect(strategyApi.remove).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: /^OK$/ }));
  await waitFor(() =>
    expect(strategyApi.remove).toHaveBeenCalledWith(scenario),
  );
});
it('keeps edits when a save fails and allows retry', async () => {
  vi.mocked(strategyApi.save).mockRejectedValueOnce(
    new Error('Network unavailable'),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: '编辑方案' }));
  await screen.findByText('预计净节省 29 CNY');
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(await screen.findByText('Network unavailable')).toBeVisible();
  expect(screen.getByLabelText('方案名称')).toHaveValue('Station B');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '保存修改' })).not.toHaveClass(
      'ant-btn-loading',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() => expect(strategyApi.save).toHaveBeenCalledTimes(2));
});
it('edits economy assumptions and shows server-calculated multi-year results separately from detours', async () => {
  vi.mocked(strategyApi.list).mockResolvedValue([scenario, economyScenario]);
  vi.mocked(strategyApi.preview).mockResolvedValue(economyScenario.result);
  show(false, true);
  expect(await screen.findByText('Fuel saving plan')).toBeVisible();
  expect(screen.queryByText('Station B')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '编辑方案' }));
  expect(await screen.findByText('预计每月节省 160 CNY')).toBeVisible();
  expect(screen.getByText(/2400 \/ 12000 CNY/)).toBeVisible();
  expect(screen.getByLabelText('每年行驶里程 km')).toHaveValue(
    '15,000.0'.replaceAll(',', ''),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() =>
    expect(strategyApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'Economy',
        annualDistance: 15000,
        monthlyDistance: 1000,
        targetConsumption: 6,
        years: 5,
      }),
      economyScenario,
    ),
  );
});
it('keeps economy scenarios out of the detour comparison', async () => {
  vi.mocked(strategyApi.list).mockResolvedValue([scenario, economyScenario]);
  show();
  expect(await screen.findByText('Station B')).toBeVisible();
  expect(screen.queryByText('Fuel saving plan')).toBeNull();
});
