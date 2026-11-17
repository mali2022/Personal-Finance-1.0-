import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetReturnPanel } from '../features/investmentReturns/AssetReturnPanel';
import type { AssetReturn } from '../features/investmentReturns/AssetReturnPanel';
import { apiClient } from '../api/client';
import { useUI } from '../stores/ui';
import { saveBlob } from '../utils/download';
import { cashFlowChartOption } from '../features/investmentReturns/ReturnCashFlowChart';
vi.mock('../api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../components/Chart', () => ({ default: () => <div>Cash-flow chart</div> }));
vi.mock('../utils/download', () => ({ saveBlob: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(status: string, rate: number | null, amounts?: AssetReturn['amounts']) {
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { id: 'a', name: '测试资产', currency: 'CNY', start: '2025-01-01', end: '2026-01-01', amounts, xirr: { status, rate, method: 'XIRR-Actual365', roots: [] }, cashFlows: [{ date: '2025-01-01', amount: '-1000', type: 'Buy', sourceId: 'trade-1' }] } } });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssetReturnPanel assetId="a" start="2025-01-01" end="2026-01-01" currency="CNY" /></QueryClientProvider>);
}
it('shows server annualized return and traceable cash flows', async () => {
  show('Success', .1);
  expect(await screen.findByText('10.00%')).toBeInTheDocument();
  fireEvent.click(screen.getByText('查看计算现金流'));
  expect(await screen.findByText('trade-1')).toBeInTheDocument();
  expect(apiClient.get).toHaveBeenCalledWith('/investments/assets/a/returns', expect.objectContaining({ params: { start: '2025-01-01', end: '2026-01-01', currency: 'CNY' } }));
  fireEvent.click(screen.getByText('导出计算明细 JSON'));
  expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'investment-return-2025-01-01-2026-01-01.json');
});
it('distinguishes actual flows, boundary valuations and missing values in charts', () => {
  const option = cashFlowChartOption([
    { date: '2025-01-01', amount: '-100', type: 'Buy', sourceId: 'buy' },
    { date: '2026-01-01', amount: '110', type: 'ClosingValue', sourceId: 'value' },
    { date: '2025-06-01', amount: null, type: 'Dividend', sourceId: 'dividend' },
  ], false);
  expect(option.series[0].data).toEqual([-100, null, null]);
  expect(option.series[1].data).toEqual([null, 110, null]);
});
it('shows missing valuation instead of zero', async () => {
  show('ValuationMissing', null);
  expect(await screen.findByText('缺少期初前一日或期末估值')).toBeInTheDocument();
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument();
});
it('does not choose a rate for multiple roots', async () => {
  show('MultipleRoots', null);
  expect(await screen.findByText('存在多个收益率解，结果不唯一')).toBeInTheDocument();
});
it('explains missing historical FX without displaying a zero return', async () => {
  show('ExchangeRateMissing', null);
  expect(await screen.findByText('缺少现金流日期的直接历史汇率')).toBeInTheDocument();
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument();
});
it('keeps original attribution available when report-currency rates are missing', async () => {
  show('ExchangeRateMissing', null, { status: 'Success', reconciled: true, originalCurrency: 'CNY', totalProfit: '237', reportTotalProfit: null, netRealized: '68', unrealizedChange: '114', netDividends: '45', netInterest: '10', includedFees: '23' });
  expect(await screen.findByText('已包含费用（勿重复扣除）：')).toBeInTheDocument();
  expect(screen.getByText('总收益（报告币种）：缺少汇率')).toBeInTheDocument();
  expect(screen.getByText('原币净归因与总收益一致。')).toBeInTheDocument();
});
it('requests the selected reporting currency when it changes', async () => {
  useUI.setState({ hidden: false, language: 'en' });
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { id: 'a', name: 'Asset', currency: 'USD', start: '2025-01-01', end: '2026-01-01', xirr: { status: 'ExchangeRateMissing', rate: null, method: 'XIRR-Actual365', roots: [] }, cashFlows: [] } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const panel = (currency: 'CNY' | 'USD') => <QueryClientProvider client={client}><AssetReturnPanel assetId="a" start="2025-01-01" end="2026-01-01" currency={currency} /></QueryClientProvider>;
  const view = render(panel('CNY'));
  await screen.findByText('Exact-date direct historical exchange rate is missing');
  view.rerender(panel('USD'));
  await vi.waitFor(() => expect(apiClient.get).toHaveBeenLastCalledWith('/investments/assets/a/returns', expect.objectContaining({ params: { start: '2025-01-01', end: '2026-01-01', currency: 'USD' } })));
});
