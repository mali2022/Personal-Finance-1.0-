import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TimeAssetsPage from '../pages/TimeAssetsPage';
import {
  csvCell,
  parseTimePaste,
  timeApi,
  type TimeReport,
} from '../features/timeAssets/api';
import { useUI } from '../stores/ui';
import fixture from './fixtures/time-assets.json';
vi.mock('../components/Chart', () => ({
  default: () => <div>Time chart</div>,
}));
vi.mock('../features/timeAssets/api', async (original) => ({
  ...(await original<typeof import('../features/timeAssets/api')>()),
  timeApi: {
    catalog: vi.fn(),
    report: vi.fn(),
    write: vi.fn(),
    analyze: vi.fn(),
  },
}));
beforeEach(() => {
  useUI.setState({ language: 'zh-CN', hidden: false });
  vi.mocked(timeApi.catalog).mockResolvedValue({
    categories: ['Work', 'Learning'],
    timers: [],
    valuations: [],
    templates: [],
    projects: [],
  });
  vi.mocked(timeApi.report).mockResolvedValue(fixture as TimeReport);
  vi.mocked(timeApi.write).mockResolvedValue({ id: 'saved' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(path = '') {
  return render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={['/time-assets' + path]}>
          <TimeAssetsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
describe('Time assets', () => {
  it('validates spreadsheet backfill and attaches explicit Shanghai offsets', () => {
    expect(
      parseTimePaste(
        '阅读\t学习\t2026-10-18 09:00\t2026-10-18 09:30\t第一章',
      )[0],
    ).toEqual({
      title: '阅读',
      category: 'Learning',
      start: '2026-10-18T09:00:00+08:00',
      end: '2026-10-18T09:30:00+08:00',
      note: '第一章',
    });
    expect(() => parseTimePaste('bad\tLearning\tinvalid\tinvalid')).toThrow();
    expect(() =>
      parseTimePaste('bad\tLearning\t2026-10-18 10:00\t2026-10-18 09:00'),
    ).toThrow();
  });
  it('states coverage denominators and never labels unknown time as inefficient', async () => {
    show();
    expect(await screen.findByText('覆盖率 / %')).toBeVisible();
    expect(screen.getByText('覆盖率 / %').parentElement).toHaveTextContent(
      '8.33',
    );
  });
  it('searches activity titles and notes', async () => {
    show('/activities');
    expect(await screen.findByText('Read a book')).toBeVisible();
    fireEvent.change(screen.getByLabelText('搜索时间流水'), {
      target: { value: 'missing' },
    });
    expect(screen.queryByText('Read a book')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜索时间流水'), {
      target: { value: 'Chapter' },
    });
    expect(screen.getByText('Read a book')).toBeVisible();
  });
  it('edits activities using explicit Shanghai timestamps and optimistic versions', async () => {
    show('/activities');
    await screen.findByText('Read a book');
    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }));
    await waitFor(() =>
      expect(screen.getByDisplayValue('2026-10-18 09:00:00')).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: /OK|确 定|确定/ }));
    await waitFor(() =>
      expect(timeApi.write).toHaveBeenCalledWith(
        '/activities/11111111-1111-1111-1111-111111111111',
        expect.objectContaining({
          start: '2026-10-18T09:00:00+08:00',
          end: '2026-10-18T10:00:00+08:00',
        }),
        '1',
        true,
      ),
    );
  }, 15000);
  it('displays over-budget use and the full budget-period denominator', async () => {
    show('/budgets');
    expect(await screen.findByText('60 / 30')).toBeVisible();
    expect(screen.getByText('200%')).toBeVisible();
  });
  it('requires per-request time-summary consent before invoking AI', async () => {
    show('/ai');
    const button = await screen.findByRole('button', { name: '生成解释' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    expect(timeApi.analyze).not.toHaveBeenCalled();
  });
  it('disables sensitive exports in privacy mode', async () => {
    useUI.setState({ hidden: true });
    show('/reports');
    expect(
      await screen.findByRole('button', { name: '导出完整报告 JSON' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出流水 CSV' })).toBeDisabled();
  });
  it('supports English navigation and safe CSV cells', async () => {
    useUI.setState({ language: 'en' });
    show('/valuation');
    expect(await screen.findByText('Time valuation & history')).toBeVisible();
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell('Read "book"')).toBe('"Read ""book"""');
  });
});
