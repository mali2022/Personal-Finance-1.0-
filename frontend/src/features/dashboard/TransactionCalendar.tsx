import { useCurrencyState } from '../../hooks/useCurrency';
import { CURRENCY_CODES } from '../../constants/currencies';
import { useState } from 'react';
import { Button, Card, Empty, Pagination, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { transactionApi, reportApi } from '../../api/finance';
import { Select } from '../../components/TouchSelect';
import { useUI } from '../../stores/ui';
import { t as tr, useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { transactionDisplayLabel } from '../../constants/mappings';
import type { Transaction } from '../../types';

export function transactionDay(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export async function loadCalendarMonth(month: string) {
  const items: Transaction[] = [];
  for (let page = 1; ; page++) {
    const result = await transactionApi.list({
      start: `${month}-01T00:00:00+08:00`,
      end: `${dayjs(month).endOf('month').format('YYYY-MM-DD')}T23:59:59.999+08:00`,
      page,
      pageSize: 100,
      sort: 'occurredAt:desc',
    });
    items.push(...result.items);
    if (page * result.pageSize >= result.total || !result.items.length) break;
  }
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
export function TransactionCalendar({
  month,
  onDetail,
}: {
  month: string;
  onDetail: (transaction: Transaction) => void;
}) {
  const language = useLocale();
  const hidden = useUI((s) => s.hidden);
  const [currency, setCurrency] = useCurrencyState();
  const today = transactionDay(new Date().toISOString());
  const [selection, setSelection] = useState(today);
  const selected = selection.startsWith(month) ? selection : `${month}-01`;
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['transactions', 'dashboard-calendar', month],
    queryFn: () => loadCalendarMonth(month),
  });
  const totals = useQuery({
    queryKey: ['reports', 'dashboard-calendar', month, currency],
    queryFn: () =>
      reportApi.get({
        start: `${month}-01`,
        end: dayjs(month).endOf('month').format('YYYY-MM-DD'),
        granularity: 'day',
        currency,
      }),
  });
  const points = new Map(totals.data?.points.map((p) => [p.period, p]));
  const compact = (amount: string) =>
    hidden
      ? '••••'
      : new Intl.NumberFormat(language, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(Number(amount));
  const groups = new Map<string, Transaction[]>();
  for (const item of q.data || []) {
    const key = transactionDay(item.occurredAt);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const first = dayjs(`${month}-01`);
  const offset = (first.day() + 6) % 7;
  const rows = groups.get(selected) || [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 5)));
  return (
    <Card
      className="dashboard-panel dashboard-calendar-panel"
      title={
        <div className="dashboard-panel-heading">
          <strong>{tr('交易日历')}</strong>
        </div>
      }
      extra={
        <Select
          aria-label={tr('日历统计币种')}
          value={currency}
          onChange={setCurrency}
          options={CURRENCY_CODES.map((value) => ({
            value,
            label: value,
          }))}
        />
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Spin spinning={q.isPending}>
          <div className="dashboard-calendar-layout">
            <div>
              <div className="dashboard-calendar-week" aria-hidden="true">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <span key={day}>{tr(`周${day}`)}</span>
                ))}
              </div>
              <div
                className="dashboard-calendar-days"
                role="group"
                aria-label={tr('选择交易日期')}
              >
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`blank-${i}`} />
                ))}
                {Array.from({ length: first.daysInMonth() }, (_, i) => {
                  const date = first.date(i + 1).format('YYYY-MM-DD');
                  const count = groups.get(date)?.length || 0;
                  const point = points.get(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-label={`${date}${q.isPending ? '' : ` · ${tr('{0}笔交易', count)}`}`}
                      aria-pressed={selected === date}
                      aria-current={date === today ? 'date' : undefined}
                      className={selected === date ? 'is-selected' : ''}
                      onClick={() => {
                        setSelection(date);
                        setPage(1);
                      }}
                    >
                      <strong>{i + 1}</strong>
                      <small>
                        {q.isPending ? '…' : count ? tr('{0}笔', count) : '·'}
                      </small>
                      {!totals.isError && !totals.isPending && (
                        <span className="dashboard-calendar-cell-totals">
                          <span className="calendar-income">
                            {tr('收')} {compact(point?.income || '0.00')}
                          </span>
                          <span className="calendar-expense">
                            {tr('支')} {compact(point?.expense || '0.00')}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <section
              className="dashboard-calendar-detail"
              aria-label={tr('当日交易')}
            >
              <div className="dashboard-calendar-detail-title">
                <strong>{selected}</strong>
                <span>
                  {q.isPending ? tr('加载中') : tr('{0}笔交易', rows.length)}
                </span>
              </div>
              {totals.isError ? (
                <ErrorState
                  error={totals.error}
                  retry={() => totals.refetch()}
                />
              ) : totals.isPending ? (
                <Spin size="small" />
              ) : (
                <div className="dashboard-calendar-day-totals">
                  <div>
                    <span>{tr('当日总收入')}</span>
                    <strong>
                      <Money
                        value={points.get(selected)?.income || '0.00'}
                        currency={currency}
                      />
                    </strong>
                  </div>
                  <div>
                    <span>{tr('当日总支出')}</span>
                    <strong>
                      <Money
                        value={points.get(selected)?.expense || '0.00'}
                        currency={currency}
                      />
                    </strong>
                  </div>
                </div>
              )}
              {!q.isPending && !rows.length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={tr('当天暂无交易')}
                />
              ) : (
                rows
                  .slice((currentPage - 1) * 5, currentPage * 5)
                  .map((item) => (
                    <Button
                      key={item.id}
                      type="text"
                      className="dashboard-calendar-transaction"
                      onClick={() => onDetail(item)}
                    >
                      <span>
                        <Sensitive>
                          {item.merchant ||
                            item.note ||
                            transactionDisplayLabel(item)}
                        </Sensitive>
                        <small>{transactionDisplayLabel(item)}</small>
                      </span>
                      <Money
                        value={item.amount}
                        currency={item.currency}
                        type={item.type}
                        adjustmentDirection={item.adjustmentDirection}
                      />
                    </Button>
                  ))
              )}
              {rows.length > 5 && (
                <Pagination
                  size="small"
                  simple
                  current={currentPage}
                  pageSize={5}
                  total={rows.length}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              )}
            </section>
          </div>
        </Spin>
      )}
    </Card>
  );
}
