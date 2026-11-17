import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { Alert, Button, Calendar, Card, Space, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { planningApi } from '../api/planning';
import { AccountSelector } from '../components/Selectors';
import { ErrorState } from '../components/Feedback';
import { Money } from '../components/Money';
import { planningLabels, type CalendarEvent } from '../features/planning/types';
import { formatDate } from '../utils/finance';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
const labels: Record<string, string> = {
  ...planningLabels,
  Planned: '未来计划',
  Overdue: '逾期待确认',
};
export default function CalendarPage() {
  useLocale();
  const [date, setDate] = useState(dayjs());
  const [view, setView] = useState(() =>
    matchMedia('(max-width: 760px)').matches ? 'list' : 'month',
  );
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState<string>();
  const [type, setType] = useState<string>();
  const [state, setState] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>();
  const [transactionId, setTransactionId] = useState<string>();
  const start =
    range?.[0].startOf('day') ||
    (view === 'week' ? date.startOf('week') : date.startOf('month'));
  const end =
    range?.[1].add(1, 'day').startOf('day') ||
    (view === 'week'
      ? start.add(7, 'day')
      : date.add(1, 'month').startOf('month'));
  const q = useQuery({
    queryKey: [
      'calendarEvents',
      start.toISOString(),
      end.toISOString(),
      page,
      accountId,
      type,
      state,
    ],
    queryFn: () =>
      planningApi.calendar({
        start: start.toISOString(),
        end: end.toISOString(),
        page,
        accountId,
        type,
        state,
      }),
    refetchInterval: 60000,
  });
  const event = (e: CalendarEvent) => (
    <div key={e.id} style={{ marginBottom: 6 }}>
      <Tag>{labels[e.state] || e.state}</Tag>
      <span>
        <Sensitive>{e.name}</Sensitive>{' '}
      </span>
      <Money value={e.amount} currency={e.currency} />
      {e.transactionId ? (
        <Button
          type="link"
          size="small"
          onClick={() => setTransactionId(e.transactionId)}
        >
          {tr("查看交易")}</Button>
      ) : (
        <Link
          to={
            e.source === 'Festival' ? '/festivals' : e.source === 'CreditCard'
              ? '/accounts/' + e.accountId
              : '/recurring'
          }
        >
          {e.source === 'Festival' ? '查看节日计划' : e.source === 'CreditCard' ? tr("查看信用卡") : tr("待确认管理")}
        </Link>
      )}
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("财务日历")}</PageTitle>
        </div>
        <Link to="/recurring">
          <Button type="primary">{tr("管理周期交易")}</Button>
        </Link>
      </div>
      <Space wrap className="mb16">
        <Select
          aria-label={tr("日历视图")}
          value={view}
          onChange={(v) => {
            setView(v);
            setRange(undefined);
            setPage(1);
          }}
          options={[
            { value: 'month', label: tr("月视图") },
            { value: 'week', label: tr("周视图") },
            { value: 'list', label: tr("列表视图") },
          ]}
        />
        <DatePicker
          value={date}
          onChange={(v) => {
            if (v) {
              setDate(v);
              setRange(undefined);
              setPage(1);
            }
          }}
          picker={view === 'week' ? 'week' : 'month'}
        />
        <DatePicker.RangePicker
          value={range}
          onChange={(v) => {
            setRange(v?.[0] && v[1] ? [v[0], v[1]] : undefined);
            setPage(1);
          }}
        />
        <AccountSelector
          id="calendar-account"
          value={accountId}
          onChange={(v) => {
            setAccountId(v);
            setPage(1);
          }}
        />
        <Button
          onClick={() => {
            setAccountId(undefined);
            setType(undefined);
            setState(undefined);
            setPage(1);
          }}
        >
          {tr("重置筛选")}</Button>
        <Select
          aria-label={tr("交易类型")}
          placeholder={tr("全部类型")}
          allowClear
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { value: 'Expense', label: tr("支出") },
            { value: 'Income', label: tr("收入") },
            { value: 'Transfer', label: tr("转账") },
            { value: 'CreditCardPayment', label: tr("信用卡还款提醒") },
          ]}
        />
        <Select
          aria-label={tr("日历事件状态")}
          placeholder={tr("全部状态")}
          allowClear
          value={state}
          onChange={(v) => {
            setState(v);
            setPage(1);
          }}
          options={[
            'Planned',
            'Overdue',
            'Pending',
            'Failed',
            'Posted',
            'Skipped',
            'Cancelled',
            'Revoked',
          ].map((value) => ({ value, label: labels[value] }))}
        />
      </Space>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          {(q.data?.total || 0) > 100 && (
            <Alert
              type="warning"
              className="mb16"
              message={tr("事件较多，日历仅展示当前页的100项。请使用下方分页或缩小筛选范围查看其他事件。")}
            />
          )}
          {view === 'month' && !range && (
            <Card>
              <Calendar
                value={date}
                onPanelChange={(v) => {
                  setDate(v);
                  setPage(1);
                }}
                cellRender={(d, info) =>
                  info.type === 'date' ? (
                    <div style={{ maxHeight: 110, overflowY: 'auto' }}>
                      {q.data?.items
                        .filter((e) => dayjs(e.at).isSame(d, 'day'))
                        .map(event)}
                    </div>
                  ) : (
                    info.originNode
                  )
                }
              />
            </Card>
          )}
          {view === 'week' && !range && (
            <div className="summary-grid">
              {Array.from({ length: 7 }, (_, i) => start.add(i, 'day')).map(
                (d) => (
                  <Card
                    key={d.toISOString()}
                    title={d.format(tr('M月D日'))}
                    size="small"
                    styles={{ body: { maxHeight: 280, overflowY: 'auto' } }}
                  >
                    {q.data?.items
                      .filter((e) => dayjs(e.at).isSame(d, 'day'))
                      .map(event)}
                    {!q.data?.items.some((e) => dayjs(e.at).isSame(d, 'day')) &&
                      tr("暂无事件")}
                  </Card>
                ),
              )}
            </div>
          )}
          <Table<CalendarEvent>
            className="mt20"
            rowKey="id"
            loading={q.isPending}
            dataSource={q.data?.items}
            locale={{ emptyText: tr("所选范围暂无财务计划或执行实例") }}
            scroll={{ x: 780 }}
            pagination={{
              current: page,
              pageSize: 100,
              total: q.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              { title: tr("时间"), render: (_, e) => formatDate(e.at, true, true) },
              {
                title: tr("事项"),
                dataIndex: 'name',
                render: (value: unknown) => (
                  <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                ),
              },
              {
                title: tr("来源"),
                render: (_, e) =>
                  e.source === 'Subscription'
                    ? '订阅'
                    : e.source === 'Festival' ? '/festivals' : e.source === 'CreditCard'
                      ? '信用卡账期'
                      : '周期交易',
              },
              {
                title: tr("金额"),
                render: (_, e) => (
                  <Money value={e.amount} currency={e.currency} type={e.type} />
                ),
              },
              { title: tr("状态"), render: (_, e) => <Tag>{labels[e.state]}</Tag> },
              {
                title: tr("操作"),
                render: (_, e) =>
                  e.transactionId ? (
                    <Button onClick={() => setTransactionId(e.transactionId)}>
                      {tr("关联交易")}</Button>
                  ) : (
                    <Link
                      to={
                        e.source === 'Festival' ? '/festivals' : e.source === 'CreditCard'
                          ? '/accounts/' + e.accountId
                          : '/recurring'
                      }
                    >
                      {e.source === 'Festival' ? '/festivals' : e.source === 'CreditCard'
                        ? tr("查看信用卡")
                        : tr("查看待确认实例")}
                    </Link>
                  ),
              },
            ]}
          />
        </>
      )}
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </>
  );
}

