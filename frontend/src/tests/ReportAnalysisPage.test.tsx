import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import { expect, it, vi } from 'vitest';
import ReportAnalysisPage from '../pages/ReportAnalysisPage';
import { reportAnalysisSections } from '../features/reports/sections';
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'GBP' }));
vi.mock('../features/ai/copilotContext', () => ({
  useCopilotPageContext: vi.fn(),
}));
vi.mock('../features/reports/FinancialReview', () => ({
  FinancialReview: (p: unknown) => (
    <div data-testid="comparison">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/PeriodReview', () => ({
  PeriodReview: (p: unknown) => (
    <div data-testid="periods">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/ExpenseStructure', () => ({
  ExpenseStructure: (p: unknown) => (
    <div data-testid="structure">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/NetWorthAnalysis', () => ({
  NetWorthAnalysis: (p: unknown) => (
    <div data-testid="net-worth">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/MetricCenter', () => ({
  MetricCenter: (p: unknown) => (
    <div data-testid="metrics">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/DebtPressure', () => ({
  DebtPressure: (p: unknown) => (
    <div data-testid="debt-pressure">{JSON.stringify(p)}</div>
  ),
}));
vi.mock('../features/reports/FinancialHealth', () => ({
  FinancialHealth: (p: unknown) => (
    <div data-testid="health">{JSON.stringify(p)}</div>
  ),
}));
it.each(reportAnalysisSections)(
  'renders only $title at its direct route with currency filters',
  async (section) => {
    render(
      <MemoryRouter
        initialEntries={[
          section.path + '?currency=EUR&start=2026-01-01&end=2026-02-28',
        ]}
      >
        <App>
          <ReportAnalysisPage section={section.id} />
        </App>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: section.title })).toBeVisible();
    const content = await screen.findByTestId(section.id);
    expect(content.textContent).toContain('"currency":"EUR"');
    if (!['periods', 'debt-pressure'].includes(section.id))
      expect(content.textContent).toContain(
        '"start":"2026-01-01","end":"2026-02-28"',
      );
    for (const other of reportAnalysisSections.filter(
      (s) => s.id !== section.id,
    ))
      expect(screen.queryByTestId(other.id)).not.toBeInTheDocument();
  },
);
it('uses the saved currency and valid defaults for malformed filters', async () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/reports/health?currency=BAD&start=2026-02-30&end=nope',
      ]}
    >
      <App>
        <ReportAnalysisPage section="health" />
      </App>
    </MemoryRouter>,
  );
  const content = await screen.findByTestId('health');
  expect(content.textContent).toContain('"currency":"GBP"');
  expect(content.textContent).not.toContain('2026-02-30');
  expect(content.textContent).not.toContain('Invalid');
});
