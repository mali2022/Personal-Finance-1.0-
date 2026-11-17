import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DatePicker, DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedPair } from '../i18n';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { lazy, Suspense, useState } from 'react';
import { App, Alert, Button, Card, Drawer, Form, Input, InputNumber, Radio, Space, Table, Tabs } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';
import { promotionsApi } from '../api/promotions';
import type { Benefit, Cashback, TransferDraft } from '../api/promotions';
import type { ApiError } from '../types';
import { useUI } from '../stores/ui';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { promotionTypes } from '../features/transactions/PromotionFields';
import { accountLabels } from '../constants/mappings';
import type { AccountType } from '../types';
import { decimal, minor } from '../utils/finance';
const Chart = lazy(() => import('../components/Chart'));
const states: Record<string, string> = localizedLabels({
  Available: '可使用',
  Returned: '已退回',
  Active: '启用',
  NotStarted: '未生效',
  Used: '已使用',
  Expired: '已过期',
  Paused: '已暂停',
  Void: '已作废',
  Pending: '待到账',
  Settled: '已到账',
  PartiallyRecovered: '部分追回',
  Recovered: '已全额追回',
  Revoked: '已撤销',
});
export default function BenefitsPage() {
  useLocale();
  const [search] = useSearchParams();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [form] = Form.useForm();
  const [settleForm] = Form.useForm();
  const [cashForm] = Form.useForm();
  const [recoveryForm] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const [recovering, setRecovering] = useState<Cashback>();
  const [confirmingDraft, setConfirmingDraft] = useState<TransferDraft>();
  const [draftForm] = Form.useForm();
  const [draftOpen, setDraftOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Benefit>();
  const [settling, setSettling] = useState<Cashback>();
  const [creatingCash, setCreatingCash] = useState(false);
  const [historyId, setHistoryId] = useState<string>();
  const [cashHistory, setCashHistory] = useState<Cashback>();
  const [filter, setFilter] = useState<string>();
  const [cashSearch, setCashSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [platform, setPlatform] = useState<string>();
  const [currency, setCurrency] = useCurrencyState();
  const [trendMode, setTrendMode] = useState<'month' | 'year'>('month');
  const hidden = useUI((s) => s.hidden);
  const [reportRange, setReportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const benefits = useQuery({
    queryKey: ['promotions'],
    queryFn: promotionsApi.list,
  });
  const drafts = useQuery({
    queryKey: ['promotionDrafts'],
    queryFn: promotionsApi.drafts,
  });
  const cashbacks = useQuery({
    queryKey: ['cashbacks'],
    queryFn: promotionsApi.cashbacks,
  });
  const history = useQuery({
    queryKey: ['promotionHistory', historyId],
    queryFn: () => promotionsApi.history(historyId!),
    enabled: !!historyId,
  });
  const recoveries = useQuery({
    queryKey: ['cashbackRecoveries', cashHistory?.id],
    queryFn: () => promotionsApi.recoveries(cashHistory!.id),
    enabled: !!cashHistory,
  });
  const report = useQuery({
    queryKey: [
      'promotionReport',
      currency,
      reportRange[0].format('YYYY-MM-DD'),
      reportRange[1].format('YYYY-MM-DD'),
    ],
    queryFn: () =>
      promotionsApi.report({
        start: reportRange[0].format('YYYY-MM-DD'),
        end: reportRange[1].format('YYYY-MM-DD'),
        currency,
      }),
  });
  const refresh = () => {
    for (const key of [
      'promotions',
      'promotionDrafts',
      'cashbacks',
      'cashbackRecoveries',
      'promotionReport',
      'promotionHistory',
      'accounts',
      'transactions',
      'transactionPromotions',
      'reports',
      'dashboard',
    ])
      void cache.invalidateQueries({ queryKey: [key] });
  };
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      message.success(tr("已保存"));
      refresh();
      setDrawer(false);
      setCreatingCash(false);
      setSettling(undefined);
      setRecovering(undefined);
      setConfirmingDraft(undefined);
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const edit = (b?: Benefit) => {
    setEditing(b);
    form.resetFields();
    form.setFieldsValue(
      b
        ? {
            ...b,
            claimedAt: b.claimedAt?.slice(0, 10),
            startsAt: b.startsAt.slice(0, 10),
            expiresAt: b.expiresAt.slice(0, 10),
            state: ['Paused', 'Void'].includes(b.state) ? b.state : 'Active',
          }
        : {
            type: 'MerchantCoupon',
            mode: 'Single',
            currency: 'CNY',
            faceValue: '0',
            minimumAmount: '0',
            quantity: 1,
            state: 'Active',
            startsAt: dayjs().format('YYYY-MM-DD'),
            expiresAt: dayjs().add(30, 'day').format('YYYY-MM-DD'),
          },
    );
    setDrawer(true);
  };
  const rows = benefits.data || [];
  const trends = report.data?.trend || [];
  const annual = new Map<
    string,
    {
      month: string;
      directSavings: string;
      feeSavings: string;
      pointValue: string;
    }
  >();
  for (const row of trends) {
    const year = row.month.slice(0, 4),
      previous = annual.get(year);
    annual.set(year, {
      month: year,
      directSavings: decimal(
        minor(row.directSavings) + minor(previous?.directSavings || '0'),
      ),
      feeSavings: decimal(
        minor(row.feeSavings) + minor(previous?.feeSavings || '0'),
      ),
      pointValue: decimal(
        minor(row.pointValue) + minor(previous?.pointValue || '0'),
      ),
    });
  }
  const trendRows = (
    trendMode === 'month' ? [...trends] : [...annual.values()]
  ).sort((a, b) => a.month.localeCompare(b.month));
  return (
    <>
      <PageTitle>{tr("优惠与权益")}</PageTitle>
      <Button
        onClick={() => {
          draftForm.resetFields();
          setDraftOpen(true);
        }}
      >
        {tr("第三方转账补贴草稿")}</Button>
      <Space wrap style={{ margin: '16px 0' }}>
        <Card size="small" title={tr("可用优惠券")}>
          {rows.filter((b) => b.state === 'Available').length}
        </Card>
        <Card size="small" title={tr("7日内到期")}>
          {
            rows.filter(
              (b) =>
                b.state === 'Available' &&
                dayjs(b.expiresAt).diff(dayjs(), 'day') <= 7,
            ).length
          }
        </Card>
        <Card size="small" title={tr("所选期间直接优惠")}>
          <Money
            value={report.data?.directSavings || '0'}
            currency={report.data?.currency || 'CNY'}
          />
        </Card>
        <Card size="small" title={tr("所选期间到账返现")}>
          <Money
            value={report.data?.netCashback || '0'}
            currency={report.data?.currency || 'CNY'}
          />
        </Card>
      </Space>
      <Tabs
        defaultActiveKey={
          ['drafts', 'cashback', 'reports'].includes(search.get('tab') || '')
            ? search.get('tab')!
            : 'benefits'
        }
        items={[
          {
            key: 'redpacket',
            label: tr("红包业务性质"),
            children: (
              <>
                <Space wrap>
                  <Button onClick={() => useUI.getState().openEntry('Income')}>
                    {tr("收到赠与现金红包")}</Button>
                  <Button onClick={() => useUI.getState().openEntry('Expense')}>
                    {tr("发出赠与现金红包")}</Button>
                  <Button
                    onClick={() => useUI.getState().openEntry('Transfer')}
                  >
                    {tr("本人钱包互转")}</Button>
                  <Link to="/loans">{tr("借贷归还结算")}</Link>
                  <Link to="/reimbursements">{tr("报销与代付结算")}</Link>
                  <Button onClick={() => useUI.getState().openEntry('Expense')}>
                    {tr("消费使用优惠红包")}</Button>
                </Space>
              </>
            ),
          },
          {
            key: 'benefits',
            label: tr("优惠券与消费权益"),
            children: (
              <>
                <Space wrap>
                  <Button type="primary" onClick={() => edit()}>
                    {tr("新建权益")}</Button>
                  <Select
                    aria-label={tr("状态筛选")}
                    allowClear
                    placeholder={tr("状态")}
                    style={{ width: 130 }}
                    value={filter}
                    onChange={setFilter}
                    options={Object.entries(states).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                  <Select
                    aria-label={tr("平台筛选")}
                    allowClear
                    placeholder={tr("平台")}
                    style={{ width: 160 }}
                    value={platform}
                    onChange={setPlatform}
                    options={[...new Set(rows.map((b) => b.platform))].map(
                      (value) => ({ value, label: value }),
                    )}
                  />
                </Space>
                {benefits.isError ? (
                  <ErrorState
                    error={benefits.error}
                    retry={() => benefits.refetch()}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    scroll={{ x: 800 }}
                    loading={benefits.isPending}
                    dataSource={rows.filter(
                      (b) =>
                        (!filter || b.state === filter) &&
                        (!platform || b.platform === platform),
                    )}
                    columns={[
                      {
                        title: tr("名称"),
                        dataIndex: 'name',
                        render: (value: unknown) => (
                          <Sensitive>
                            {value == null ? '—' : String(value)}
                          </Sensitive>
                        ),
                      },
                      { title: tr("平台"), dataIndex: 'platform' },
                      {
                        title: tr("状态"),
                        dataIndex: 'state',
                        render: (s) => states[s] || s,
                      },
                      {
                        title: tr("面额 / 剩余权益"),
                        render: (_, b) =>
                          b.discountRate ? (
                            <span>
                              {b.discountRate}{tr("% 支付比例")}{b.maximumDiscount && (
                                <>
                                  {tr("，优惠上限")}{' '}
                                  <Money
                                    value={b.maximumDiscount}
                                    currency={b.currency}
                                  />
                                </>
                              )}
                            </span>
                          ) : (
                            <Money
                              value={
                                b.mode === 'Balance'
                                  ? b.remainingValue
                                  : b.faceValue
                              }
                              currency={b.currency}
                            />
                          ),
                      },
                      { title: tr("数量"), dataIndex: 'quantity' },
                      {
                        title: tr("到期"),
                        render: (_, b) =>
                          dayjs(b.expiresAt).format('YYYY-MM-DD'),
                      },
                      {
                        title: tr("操作"),
                        render: (_, b) => (
                          <Space>
                            <Button onClick={() => edit(b)}>{tr("编辑")}</Button>
                            <Button onClick={() => setHistoryId(b.id)}>
                              {tr("历史")}</Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: 'cashback',
            label: tr("返现"),
            children: (
              <>
                <Button
                  onClick={() => {
                    cashForm.resetFields();
                    setCreatingCash(true);
                  }}
                >
                  {tr("登记待返现")}</Button>
                <Input
                  aria-label={tr("返现来源搜索")}
                  placeholder={tr("搜索返现来源")}
                  value={cashSearch}
                  onChange={(e) => setCashSearch(e.target.value)}
                  style={{ width: 220, margin: 8 }}
                />
                {cashbacks.isError && (
                  <ErrorState
                    error={cashbacks.error}
                    retry={() => cashbacks.refetch()}
                  />
                )}
                <Table
                  rowKey="id"
                  scroll={{ x: 700 }}
                  loading={cashbacks.isPending}
                  dataSource={cashbacks.data?.filter((b) =>
                    b.source.includes(cashSearch),
                  )}
                  columns={[
                    {
                      title: tr("原消费"),
                      render: (_, b) => (
                        <Link to={`/transactions/${b.transactionId}`}>
                          {tr("查看交易")}</Link>
                      ),
                    },
                    {
                      title: tr("来源"),
                      dataIndex: 'source',
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr("金额"),
                      render: (_, b) => (
                        <Money value={b.amount} currency={b.currency} />
                      ),
                    },
                    {
                      title: tr("已追回"),
                      render: (_, b) => (
                        <Money
                          value={b.recoveredAmount || '0'}
                          currency={b.currency}
                        />
                      ),
                    },
                    {
                      title: tr("核算方式"),
                      render: (_, b) =>
                        b.treatment === 'PriceAdjustment'
                          ? '冲减净消费'
                          : '独立奖励收入',
                    },
                    {
                      title: tr("状态"),
                      dataIndex: 'state',
                      render: (s) => states[s],
                    },
                    {
                      title: tr("操作"),
                      render: (_, b) =>
                        b.state === 'Pending' ? (
                          <Space>
                            <Button
                              onClick={() => {
                                settleForm.resetFields();
                                setSettling(b);
                              }}
                            >
                              {tr("确认到账")}</Button>
                            <Button
                              onClick={() =>
                                mutation.mutate(() => promotionsApi.revoke(b))
                              }
                            >
                              {tr("撤销权益")}</Button>
                          </Space>
                        ) : b.settlementTransactionId ? (
                          <Space wrap>
                            <Link
                              to={`/transactions/${b.settlementTransactionId}`}
                            >
                              {tr("到账流水")}</Link>
                            <Button onClick={() => setCashHistory(b)}>
                              {tr("追回历史")}</Button>
                            {b.state === 'Settled' && (
                              <Button
                                onClick={() =>
                                  modal.confirm({
                                    title: tr("撤销错误登记的到账流水"),
                                    content:
                                      tr("实际扣回资金请使用登记实际追回。此操作撤销原到账记录。"),
                                    onOk: () =>
                                      promotionsApi.revoke(b).then(refresh),
                                  })
                                }
                              >
                                {tr("撤销错误到账")}</Button>
                            )}
                            {['Settled', 'PartiallyRecovered'].includes(
                              b.state,
                            ) && (
                              <Button
                                onClick={() => {
                                  recoveryForm.resetFields();
                                  recoveryForm.setFieldsValue({
                                    occurredAt: dayjs()
                                      .add(1, 'second')
                                      .format('YYYY-MM-DDTHH:mm:ss'),
                                    amount: b.remainingAmount,
                                  });
                                  setRecovering(b);
                                }}
                              >
                                {tr("登记实际追回")}</Button>
                            )}
                          </Space>
                        ) : null,
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'drafts',
            label: tr("转账补贴草稿"),
            children: drafts.isError ? (
              <ErrorState error={drafts.error} retry={() => drafts.refetch()} />
            ) : (
              <>
                <Input
                  aria-label={tr("补贴来源搜索")}
                  placeholder={tr("搜索补贴来源")}
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  style={{ width: 220, marginBottom: 8 }}
                />
                <Table
                  rowKey="id"
                  loading={drafts.isPending}
                  dataSource={drafts.data?.filter((d) =>
                    d.source.includes(draftSearch),
                  )}
                  scroll={{ x: 700 }}
                  columns={[
                    {
                      title: tr("补贴来源"),
                      dataIndex: 'source',
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr("实际扣款"),
                      render: (_, d) => (
                        <Money value={d.paidAmount} currency={d.currency} />
                      ),
                    },
                    {
                      title: tr("实际到账"),
                      render: (_, d) => (
                        <Money value={d.receivedAmount} currency={d.currency} />
                      ),
                    },
                    {
                      title: tr("第三方补贴"),
                      render: (_, d) => (
                        <Money value={d.subsidyAmount} currency={d.currency} />
                      ),
                    },
                    {
                      title: tr("状态"),
                      render: (_, d) =>
                        d.state === 'Posted'
                          ? '已过账'
                          : d.state === 'Revoked'
                            ? '已撤销'
                            : '待确认',
                    },
                    {
                      title: tr("操作"),
                      render: (_, d) => (
                        <Space wrap>
                          {d.state === 'PendingConfirmation' ? (
                            <Button
                              onClick={() => {
                                confirmForm.resetFields();
                                setConfirmingDraft(d);
                              }}
                            >
                              {tr("确认补贴并过账")}</Button>
                          ) : d.transferTransactionId ? (
                            <Link
                              to={`/transactions/${d.transferTransactionId}`}
                            >
                              {tr("查看转账")}</Link>
                          ) : null}
                          {d.state !== 'Revoked' && (
                            <Button
                              onClick={() =>
                                modal.confirm({
                                  title: tr("撤销补贴复合业务"),
                                  content:
                                    tr("已过账的本金转账和补贴收入将一起撤销。"),
                                  onOk: () =>
                                    promotionsApi.revokeDraft(d).then(refresh),
                                })
                              }
                            >
                              {tr("撤销业务")}</Button>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'reports',
            label: tr("优惠分析"),
            children: (
              <>
                <DatePicker.RangePicker
                  allowClear={false}
                  value={reportRange}
                  onChange={(v) => {
                    if (v?.[0] && v[1]) setReportRange([v[0], v[1]]);
                  }}
                  presets={[
                    {
                      label: tr("本月"),
                      value: [dayjs().startOf('month'), dayjs().endOf('month')],
                    },
                    {
                      label: tr("今年"),
                      value: [dayjs().startOf('year'), dayjs().endOf('year')],
                    },
                    {
                      label: tr("近五年"),
                      value: [
                        dayjs().subtract(4, 'year').startOf('year'),
                        dayjs().endOf('year'),
                      ],
                    },
                  ]}
                />
                <Select
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCY_CODES.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
                <p>
                  {tr("所选期间仅统计已登记优惠的交易；立减、手续费减免、赠送权益、积分抵扣及到账返现分别展示。优惠前金额不替代正式净消费；退款继续按到账日冲减账本费用；待返现为当前尚未兑现权益。")}</p>
                {report.isError && (
                  <ErrorState
                    error={report.error}
                    retry={() => report.refetch()}
                  />
                )}
                <Space wrap>
                  {[
                    ['手续费节省', report.data?.feeSavings],
                    ['优惠前参考金额', report.data?.originalReference],
                    ['对应实际付款', report.data?.actualPayment],
                    ['赠送权益抵扣', report.data?.giftCreditUsed],
                    ['积分抵扣', report.data?.pointValue],
                    ['待返现', report.data?.pendingCashback],
                    ['到账返现（追回前）', report.data?.settledCashback],
                    ['已实际追回', report.data?.recoveredCashback],
                    ['返现净到账', report.data?.netCashback],
                  ].map(([label, value]) => (
                    <Card key={label} size="small" title={label}>
                      <Money
                        value={value || '0'}
                        currency={report.data?.currency || 'CNY'}
                      />
                    </Card>
                  ))}
                </Space>
                <Card
                  title={tr("优惠趋势")}
                  size="small"
                  style={{ margin: '16px 0' }}
                >
                  <p>{tr("趋势仅涵盖所选期间；点击柱形可下钻对应月份或年份。")}</p>
                  <Radio.Group
                    aria-label={tr("优惠趋势周期")}
                    value={trendMode}
                    onChange={(e) => setTrendMode(e.target.value)}
                    options={[
                      { label: tr("按月"), value: 'month' },
                      { label: tr("按年"), value: 'year' },
                    ]}
                  />
                  {hidden ? (
                    <p>{tr("隐私模式下隐藏金额趋势。")}</p>
                  ) : (
                    <Suspense fallback={<p>{tr("加载趋势…")}</p>}>
                      <Chart
                        option={{
                          tooltip: { trigger: 'axis' },
                          legend: {
                            data: [tr("直接抵价"), tr("手续费减免"), tr("积分抵扣")],
                          },
                          grid: { left: 60, right: 20, bottom: 35, top: 45 },
                          xAxis: {
                            type: 'category',
                            data: trendRows.map((r) => r.month),
                          },
                          yAxis: { type: 'value' },
                          series: [
                            ['直接抵价', 'directSavings'],
                            ['手续费减免', 'feeSavings'],
                            ['积分抵扣', 'pointValue'],
                          ].map(([name, key]) => ({
                            name,
                            type: 'bar',
                            data: trendRows.map((r) =>
                              Number(
                                r[
                                  key as
                                    | 'directSavings'
                                    | 'feeSavings'
                                    | 'pointValue'
                                ],
                              ),
                            ),
                          })),
                        }}
                        onClick={(name) => {
                          const date = dayjs(
                            trendMode === 'month'
                              ? name + '-01'
                              : name + '-01-01',
                          );
                          setReportRange([
                            date.startOf(trendMode),
                            date.endOf(trendMode),
                          ]);
                        }}
                      />
                    </Suspense>
                  )}
                  <Table
                    rowKey="month"
                    size="small"
                    scroll={{ x: 500 }}
                    dataSource={trendRows}
                    columns={[
                      {
                        title: trendMode === 'month' ? tr("月份") : tr("年份"),
                        dataIndex: 'month',
                      },
                      ...[
                        ['直接抵价', 'directSavings'],
                        ['手续费减免', 'feeSavings'],
                        ['积分抵扣', 'pointValue'],
                      ].map(([title, key]) => ({
                        title,
                        render: (
                          _: unknown,
                          row: (typeof trendRows)[number],
                        ) => (
                          <Money
                            value={
                              row[
                                key as
                                  'directSavings' | 'feeSavings' | 'pointValue'
                              ]
                            }
                            currency={currency as string}
                          />
                        ),
                      })),
                    ]}
                  />
                </Card>
                <Table
                  scroll={{ x: 'max-content' }}
                  rowKey={(_, i) => String(i)}
                  dataSource={report.data?.details}
                  columns={[
                    {
                      title: tr("月份"),
                      dataIndex: 'month',
                      filters: [
                        ...new Set(report.data?.details.map((x) => x.month)),
                      ].map((value) => ({ text: value, value })),
                      onFilter: (value, row) => row.month === value,
                    },
                    {
                      title: tr("平台"),
                      dataIndex: 'source',
                      filters: [
                        ...new Set(report.data?.details.map((x) => x.source)),
                      ].map((value) => ({ text: value || tr("未填写"), value })),
                      onFilter: (value, row) => row.source === value,
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr("商户"),
                      dataIndex: 'merchant',
                      filters: [
                        ...new Set(
                          report.data?.details.map((x) => x.merchant || ''),
                        ),
                      ].map((value) => ({ text: value || tr("未填写"), value })),
                      onFilter: (value, row) => (row.merchant || '') === value,
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr("优惠类型"),
                      dataIndex: 'type',
                      filters: [
                        ...promotionTypes,
                        localizedPair('FeeWaiver','手续费减免'),
                      ].map(([value, text]) => ({ text, value })),
                      onFilter: (value, row) => row.type === value,
                      render: (type) =>
                        promotionTypes.find(([value]) => value === type)?.[1] ||
                        '手续费减免',
                    },
                    {
                      title: tr("金额"),
                      render: (_, line) => (
                        <Money
                          value={line.amount}
                          currency={report.data?.currency || 'CNY'}
                        />
                      ),
                    },
                    {
                      title: tr("交易"),
                      render: (_, line) => (
                        <Link to={`/transactions/${line.transactionId}`}>
                          {tr("查看原交易")}</Link>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      {drawer && (
        <Drawer
          title={editing ? tr("编辑权益") : tr("新建权益")}
          open={drawer}
          onClose={() => setDrawer(false)}
          width="min(520px,100vw)"
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={(v) =>
              mutation.mutate(() =>
                promotionsApi.save(
                  {
                    ...v,
                    platform: v.platform || '',
                    merchant: v.merchant || '',
                    rules: v.rules || '',
                    note: v.note || '',
                    claimedAt: v.claimedAt
                      ? `${v.claimedAt}T00:00:00+08:00`
                      : undefined,
                    startsAt: `${v.startsAt}T00:00:00+08:00`,
                    expiresAt: `${v.expiresAt}T23:59:59+08:00`,
                  },
                  editing,
                ),
              )
            }
          >
            {['name', 'platform', 'merchant'].map((name, i) => (
              <Form.Item
                key={name}
                name={name}
                label={['名称', '平台', '限制商户（为空不限）'][i]}
                rules={name === 'name' ? [{ required: true }] : []}
              >
                <Input />
              </Form.Item>
            ))}
            <Form.Item name="type" label={tr("权益类型")}>
              <Select
                disabled={!!editing}
                options={[...promotionTypes, localizedPair('FeeWaiver','手续费券')].map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
            <Form.Item name="mode" label={tr("库存模式")}>
              <Select
                disabled={!!editing}
                options={[
                  { value: 'Single', label: tr("按张使用") },
                  { value: 'Reusable', label: tr("可重复使用") },
                  { value: 'Balance', label: tr("有余额的非现金权益") },
                ]}
              />
            </Form.Item>
            <Form.Item name="currency" label={tr("币种")}>
              <Select
                disabled={!!editing}
                options={CURRENCY_CODES.map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
            <Form.Item name="faceValue" label={tr("面额 / 初始赠送权益")}>
              <Input disabled={!!editing} inputMode="decimal" />
            </Form.Item>
            <Form.Item name="minimumAmount" label={tr("最低使用金额")}>
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="discountRate"
              label={tr("折扣后支付比例（%，85 表示八五折）")}
            >
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item name="maximumDiscount" label={tr("最高优惠金额（为空不限）")}>
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item name="claimedAt" label={tr("领取日期")}>
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="paymentMethod" label={tr("适用支付方式")}>
              <Select
                allowClear
                options={[
                  'Cash',
                  'Bank',
                  'CreditCard',
                  'Alipay',
                  'WeChat',
                  'StoredValue',
                  'Other',
                ].map((value) => ({
                  value,
                  label: accountLabels[value as AccountType],
                }))}
              />
            </Form.Item>
            <Form.Item name="quantity" label={tr("数量")}>
              <InputNumber disabled={!!editing} min={1} />
            </Form.Item>
            <Form.Item name="accountId" label={tr("适用付款账户")}>
              <AccountSelector />
            </Form.Item>
            <Form.Item name="startsAt" label={tr("生效日期")}>
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="expiresAt" label={tr("到期日期")}>
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="state" label={tr("状态")}>
              <Select
                options={['Active', 'Paused', 'Void'].map((value) => ({
                  value,
                  label: states[value],
                }))}
              />
            </Form.Item>
            <Form.Item name="rules" label={tr("平台规则")}>
              <Input.TextArea />
            </Form.Item>
            <Form.Item name="note" label={tr("备注")}>
              <Input.TextArea />
            </Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              loading={mutation.isPending}
            >
              {tr("保存")}</Button>
          </Form>
        </Drawer>
      )}
      <Drawer
        title={tr("使用历史")}
        open={!!historyId}
        onClose={() => setHistoryId(undefined)}
        width="min(600px,100vw)"
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={history.data}
          columns={[
            {
              title: tr("使用时间"),
              dataIndex: 'createdAt',
              render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
            { title: tr("状态"), dataIndex: 'state' },
            {
              title: tr("金额"),
              render: (_, h) => (
                <Money
                  value={h.amount}
                  currency={
                    rows.find((b) => b.id === historyId)?.currency || 'CNY'
                  }
                />
              ),
            },
            {
              title: tr("退款返券"),
              render: (_, h) =>
                h.state === 'Used' ? (
                  <Button
                    onClick={() => {
                      let refundId = '';
                      modal.confirm({
                        title: tr("确认平台实际返还权益"),
                        content: (
                          <Input
                            placeholder={tr("关联现金退款交易ID")}
                            onChange={(e) => {
                              refundId = e.target.value;
                            }}
                          />
                        ),
                        onOk: () =>
                          promotionsApi
                            .returnBenefit(h.id, h.version, refundId)
                            .then(refresh),
                      });
                    }}
                  >
                    {tr("返还权益")}</Button>
                ) : (
                  h.state
                ),
            },
            {
              title: tr("交易"),
              render: (_, h) => (
                <Link to={`/transactions/${h.transactionId}`}>{tr("关联交易")}</Link>
              ),
            },
          ]}
        />
      </Drawer>
      <Drawer
        title={tr("第三方转账补贴草稿")}
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
      >
        <Form
          form={draftForm}
          layout="vertical"
          onFinish={(v) =>
            mutation.mutate(() =>
              promotionsApi
                .transferDraft({ ...v, occurredAt: new Date().toISOString() })
                .then((r) => {
                  setDraftOpen(false);
                  return r;
                }),
            )
          }
        >
          <Form.Item
            name="accountId"
            label={tr("付款账户")}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          <Form.Item
            name="toAccountId"
            label={tr("收款账户")}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          {[
            localizedPair('paidAmount','实际扣款'),
            localizedPair('receivedAmount','实际到账'),
            localizedPair('subsidyAmount','第三方补贴'),
            localizedPair('source','补贴来源'),
            localizedPair('evidence','实际业务凭据'),
          ].map(([name, label]) => (
            <Form.Item
              key={name}
              name={name}
              label={label}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          ))}
          <Button htmlType="submit" loading={mutation.isPending}>
            {tr("保存待确认草稿")}</Button>
        </Form>
      </Drawer>
      <Drawer
        title={tr("待返现")}
        open={creatingCash}
        onClose={() => setCreatingCash(false)}
      >
        <Form
          form={cashForm}
          layout="vertical"
          onFinish={(v) =>
            mutation.mutate(() => promotionsApi.createCashback(v))
          }
        >
          <Form.Item
            name="transactionId"
            label={tr("原消费交易ID")}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr("预计金额")}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="source" label={tr("来源")} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="treatment"
            label={tr("统计方式")}
            initialValue="PriceAdjustment"
          >
            <Select
              options={[
                { value: 'PriceAdjustment', label: tr("价格调整，冲减净消费") },
                { value: 'RewardIncome', label: tr("独立活动奖励收入") },
              ]}
            />
          </Form.Item>
          <Button htmlType="submit" loading={mutation.isPending}>
            {tr("保存待兑现权益")}</Button>
        </Form>
      </Drawer>
      <Drawer
        title={tr("确认实际返现到账")}
        open={!!settling}
        onClose={() => setSettling(undefined)}
      >
        <Form
          form={settleForm}
          layout="vertical"
          onFinish={(v) =>
            mutation.mutate(() =>
              promotionsApi.settle(settling!, {
                ...v,
                occurredAt: new Date().toISOString(),
              }),
            )
          }
        >
          <Form.Item
            name="accountId"
            label={tr("实际到账账户")}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          {settling?.treatment === 'RewardIncome' && (
            <Form.Item
              name="categoryId"
              label={tr("奖励收入分类")}
              rules={[{ required: true }]}
            >
              <CategorySelector kind="Income" />
            </Form.Item>
          )}
          <Button htmlType="submit" type="primary" loading={mutation.isPending}>
            {tr("确认到账并记账")}</Button>
        </Form>
      </Drawer>
      {cashHistory && (
        <Drawer
          title={tr("返现追回历史")}
          open
          onClose={() => setCashHistory(undefined)}
          width="min(600px,100vw)"
        >
          {recoveries.isError ? (
            <ErrorState
              error={recoveries.error}
              retry={() => recoveries.refetch()}
            />
          ) : (
            <Table
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={recoveries.data}
              loading={recoveries.isPending}
              columns={[
                {
                  title: tr("金额"),
                  render: (_, r) => (
                    <Money value={r.amount} currency={cashHistory.currency} />
                  ),
                },
                {
                  title: tr("原因"),
                  dataIndex: 'reason',
                  render: (value: unknown) => (
                    <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                  ),
                },
                {
                  title: tr("状态"),
                  render: (_, r) => (r.state === 'Active' ? '有效' : '已撤销'),
                },
                {
                  title: tr("操作"),
                  render: (_, r) => (
                    <Space>
                      <Link to={`/transactions/${r.transactionId}`}>{tr("流水")}</Link>
                      {r.state === 'Active' && (
                        <Button
                          onClick={() =>
                            modal.confirm({
                              title: tr("撤销错误登记的追回"),
                              content:
                                tr("若后续退款已使用恢复额度，系统会拒绝撤销。"),
                              onOk: () =>
                                promotionsApi
                                  .revokeRecovery(r.id, r.version)
                                  .then(refresh),
                            })
                          }
                        >
                          {tr("撤销错误追回")}</Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Drawer>
      )}
      {recovering && (
        <Drawer
          title={tr("登记实际返现追回")}
          open
          onClose={() => setRecovering(undefined)}
          width="min(520px,100vw)"
        >
          <Alert
            message={
              recovering.treatment === 'PriceAdjustment'
                ? tr("仅登记实际扣回的资金，恢复对应净消费；不会改写原返现到账日。")
                : tr("实际扣回资金冲减奖励收入，不新增消费。")
            }
          />
          <Form
            form={recoveryForm}
            layout="vertical"
            onFinish={(v) =>
              mutation.mutate(() =>
                promotionsApi.recover(recovering, {
                  ...v,
                  occurredAt: new Date(v.occurredAt).toISOString(),
                }),
              )
            }
          >
            <Form.Item
              name="accountId"
              label={tr("实际扣回账户")}
              rules={[{ required: true }]}
            >
              <AccountSelector />
            </Form.Item>
            <Form.Item
              name="amount"
              label={tr("本次实际追回金额")}
              rules={[{ required: true }]}
            >
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="occurredAt"
              label={tr("实际追回时间")}
              rules={[{ required: true }]}
            >
              <DateInput type="datetime-local" step={1} />
            </Form.Item>
            <Form.Item
              name="reason"
              label={tr("追回原因与凭据")}
              rules={[{ required: true }]}
            >
              <Input.TextArea />
            </Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              loading={mutation.isPending}
            >
              {tr("确认实际追回并记账")}</Button>
          </Form>
        </Drawer>
      )}
      {confirmingDraft && (
        <Drawer
          title={tr("确认第三方补贴业务")}
          open
          onClose={() => setConfirmingDraft(undefined)}
          width="min(520px,100vw)"
        >
          <p>{tr("来源：")}{confirmingDraft.source}</p>
          <p>{tr("凭据：")}{confirmingDraft.evidence}</p>
          <Space wrap>
            {tr("扣款")}{' '}
            <Money
              value={confirmingDraft.paidAmount}
              currency={confirmingDraft.currency}
            />{' '}
            {tr("到账")}{' '}
            <Money
              value={confirmingDraft.receivedAmount}
              currency={confirmingDraft.currency}
            />{' '}
            {tr("补贴")}{' '}
            <Money
              value={confirmingDraft.subsidyAmount}
              currency={confirmingDraft.currency}
            />
          </Space>
          <Form
            form={confirmForm}
            layout="vertical"
            onFinish={(v) =>
              mutation.mutate(() =>
                promotionsApi.confirmDraft(confirmingDraft, v.categoryId),
              )
            }
          >
            <Form.Item
              name="categoryId"
              label={tr("已确认的活动奖励收入分类")}
              rules={[{ required: true }]}
            >
              <CategorySelector kind="Income" />
            </Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              loading={mutation.isPending}
            >
              {tr("确认奖励性质并过账")}</Button>
          </Form>
        </Drawer>
      )}
    </>
  );
}
