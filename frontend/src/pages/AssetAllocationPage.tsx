import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ReturnComparison } from '../features/investmentReturns/ReturnComparison';
import { Alert, App, Button, Card, Drawer, Form, Input, Pagination, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { assetApi, type Allocation, type FxRate } from '../api/assetManagement';
import { investmentApi } from '../api/investments';
import { accountApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
export default function AssetAllocationPage() {
  useLocale();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [currency, setCurrency] = useState('');
  const [editor, setEditor] = useState<'fx' | 'policy'>();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['asset-allocation', date, currency],
    queryFn: () => assetApi.allocation(date, currency),
    enabled: !!date,
  });
  const fx = useQuery({
    queryKey: ['fx-rates', page],
    queryFn: () => assetApi.fx(page),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const labels: Record<string, string> = localizedLabels({
    Cash: '现金及等价物',
    Bank: '银行存款',
    TermDeposit: '定期存款',
    Stock: '股票',
    ETF: 'ETF',
    Fund: '基金',
    Bond: '债券',
    Gold: '贵金属',
    Wealth: '银行理财',
    CashManagement: '现金管理',
    Property: '房产',
    Vehicle: '车辆',
    Valuable: '贵重物品',
    Other: '其他',
    Liability: '负债',
  });
  async function submit() {
    const b = await form.validateFields();
    setBusy(true);
    try {
      const p = q.data?.policies.find((p) => p.accountId === b.accountId);
      await investmentApi.save(
        editor === 'fx' ? '/fx-valuation-rates' : '/assets/aggregation-policy',
        b,
        p?.version,
        editor === 'fx' ? 'post' : 'put',
      );
      setEditor(undefined);
      await Promise.all(
        ['asset-allocation', 'fx-rates'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (e) {
      void message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageTitle>{tr("资产配置与估值")}</PageTitle>
      <Link to="/investments/performance">{tr('投资收益分析')}</Link>
      <ReturnComparison key={`allocation-return:${date}:${currency}`} assets={[]} start={dayjs(date).startOf('year').format('YYYY-MM-DD')} end={date} currency={currency||'CNY'}/>
      <Space wrap>
        <DateInput
          aria-label={tr("估值日期")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Select
          aria-label={tr("报告币种")}
          style={{ width: 180 }}
          value={currency}
          onChange={setCurrency}
          options={[
            { value: '', label: tr("原币分开展示") },
            ...CURRENCY_CODES.map((value) => ({ value, label: value })),
          ]}
        />
        <Button
          disabled={hidden}
          onClick={() => {
            setEditor('policy');
            form.resetFields();
            form.setFieldsValue({ mode: 'Unknown' });
          }}
        >
          {tr("确认投资账户口径")}</Button>
        <Button
          disabled={hidden}
          onClick={() => {
            setEditor('fx');
            form.resetFields();
            form.setFieldsValue({
              baseCurrency: 'USD',
              targetCurrency: 'CNY',
              date,
              source: '手动录入',
            });
          }}
        >
          {tr("录入汇率")}</Button>
      </Space>
      <Alert
        type={q.data?.complete ? 'info' : 'warning'}
        message={
          q.data?.complete
            ? tr("估值覆盖完整")
            : tr("估值未覆盖 {0} 项，以下只汇总已覆盖部分", q.data?.uncovered ?? 0)
        }
        description={q.data?.scope}
      />
      {q.data?.groups.map((g) => (
        <Card key={g.currency} title={tr("{0} · 已覆盖资产", g.currency)}>
          <Space wrap>
            {tr("资产")}<Money value={g.assets} currency={g.currency} />
            {tr("负债")}<Money value={g.liabilities} currency={g.currency} />
            {tr("净资产")}<Money value={g.netWorth} currency={g.currency} />
          </Space>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="type"
            pagination={false}
            dataSource={g.allocation}
            columns={[
              {
                title: tr("资产类别"),
                dataIndex: 'type',
                render: (v) => labels[v] ?? v,
              },
              {
                title: tr("金额"),
                render: (_, r) => (
                  <Money value={r.amount} currency={g.currency} />
                ),
              },
              {
                title: tr("占已覆盖资产 %"),
                dataIndex: 'percent',
                render: (v) => (hidden ? '••••' : (v ?? '—')),
              },
            ]}
          />
        </Card>
      ))}
      <Card title={tr("估值依据与缺口")}>
        <Table<Allocation['items'][number]>
          rowKey="id"
          loading={q.isPending}
          dataSource={q.data?.items}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: tr("资产"),
              dataIndex: 'name',
              render: (value: unknown) => (
                <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
              ),
            },
            { title: tr("类型"), dataIndex: 'type', render: (v) => labels[v] ?? v },
            {
              title: tr("原币金额"),
              render: (_, r) =>
                r.originalAmount == null ? (
                  '—'
                ) : (
                  <Money value={r.originalAmount} currency={r.currency} />
                ),
            },
            {
              title: tr("报告金额"),
              render: (_, r) =>
                r.amount == null ? (
                  '未覆盖'
                ) : (
                  <Money value={r.amount} currency={r.reportCurrency} />
                ),
            },
            { title: tr("估值日期"), dataIndex: 'valuationDate' },
            {
              title: tr("汇率"),
              dataIndex: 'rate',
              render: (v) => (hidden ? '••••' : (v ?? '—')),
            },
            { title: tr("汇率日期"), dataIndex: 'rateDate' },
            { title: tr("来源"), render: (_, r) => r.rateSource ?? r.source },
            {
              title: tr("提示"),
              render: (_, r) => r.missing ?? (r.stale ? '估值超过90天' : '—'),
            },
          ]}
        />
      </Card>
      <Card title={tr("手动历史汇率（1单位基础币种 = 汇率 × 目标币种）")}>
        <Table<FxRate>
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={fx.data?.items}
          pagination={false}
          columns={[
            { title: tr("基础币种"), dataIndex: 'baseCurrency' },
            { title: tr("目标币种"), dataIndex: 'targetCurrency' },
            {
              title: tr("汇率"),
              dataIndex: 'rate',
              render: (v) => (hidden ? '••••' : v),
            },
            { title: tr("日期"), dataIndex: 'date' },
            {
              title: tr("来源"),
              dataIndex: 'source',
              render: (value: unknown) => (
                <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
              ),
            },
          ]}
        />
        <Pagination
          current={page}
          pageSize={20}
          showSizeChanger={false}
          total={fx.data?.total}
          onChange={setPage}
        />
        {fx.isError && (
          <ErrorState error={fx.error} retry={() => fx.refetch()} />
        )}
      </Card>
      <Drawer
        title={editor === 'fx' ? tr("手动历史汇率") : tr("确认投资账户余额语义")}
        open={!!editor && !hidden}
        width={480}
        onClose={() => !busy && setEditor(undefined)}
        extra={
          <Button
            type="primary"
            loading={busy}
            disabled={hidden}
            onClick={() => void submit()}
          >
            {tr("保存")}</Button>
        }
      >
        <Form form={form} layout="vertical" disabled={hidden || busy}>
          {editor === 'fx' ? (
            <>
              {['baseCurrency', 'targetCurrency'].map((name, i) => (
                <Form.Item
                  key={name}
                  name={name}
                  label={i === 0 ? tr("基础币种") : tr("目标币种")}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={CURRENCY_CODES.map((value) => ({ value }))}
                  />
                </Form.Item>
              ))}
              <Form.Item
                name="rate"
                label={tr("汇率（最多8位小数）")}
                rules={[{ required: true }]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item
                name="date"
                label={tr("生效日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" />
              </Form.Item>
              <Form.Item
                name="source"
                label={tr("来源")}
                rules={[{ required: true }]}
              >
                <Input maxLength={200} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="accountId"
                label={tr("投资账户")}
                rules={[{ required: true }]}
              >
                <Select
                  options={accounts.data
                    ?.filter((a) => a.type === 'Investment')
                    .map((a) => ({ value: a.id, label: a.name }))}
                />
              </Form.Item>
              <Form.Item name="mode" label={tr("余额语义")}>
                <Select
                  options={[
                    { value: 'Unknown', label: tr("尚未确认，标记缺口") },
                    { value: 'CashOnly', label: tr("仅现金，另加证券持仓") },
                    {
                      value: 'TotalAssets',
                      label: tr("现金与证券总资产，不再加持仓"),
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label={tr("确认依据")}
                rules={[{ required: true }]}
              >
                <Input.TextArea maxLength={2000} />
              </Form.Item>
            </>
          )}
        </Form>
      </Drawer>
    </Space>
  );
}
