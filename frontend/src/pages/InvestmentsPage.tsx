import { TemplateImport } from '../components/TemplateImport';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { Alert, App, Button, Card, Drawer, Form, Input, Modal, Pagination, Space, Table, Tabs, Tag, Upload } from 'antd';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  investmentApi,
  type InvestmentAsset,
  type InvestmentTrade,
  type Position,
  type Valuation,
} from '../api/investments';
import { accountApi, categoryApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { Link } from 'react-router-dom';
import {
  parseValuationCsv,
  type ValuationImportRow,
} from '../utils/valuationCsv';
const types = [
  { value: 'Stock', get label(){return tr("股票");} },
  { value: 'ETF', label: 'ETF' },
  { value: 'Fund', get label(){return tr("公募基金");} },
  { value: 'Bond', get label(){return tr("债券");} },
  { value: 'Gold', get label(){return tr("贵金属");} },
  { value: 'CashManagement', get label(){return tr("现金管理");} },
  { value: 'Wealth', get label(){return tr("银行理财");} },
  { value: 'Other', get label(){return tr("其他投资");} },
];
const tradeTypes = [
  { value: 'Buy', get label(){return tr("买入");} },
  { value: 'Sell', get label(){return tr("卖出");} },
  { value: 'Dividend', get label(){return tr("现金分红");} },
  { value: 'Interest', get label(){return tr("利息");} },
  { value: 'Reinvest', get label(){return tr("分红再投资（原子事件）");} },
  { value: 'Fee', get label(){return tr("独立费用 / 税费");} },
  { value: 'PositionIncrease', get label(){return tr("历史持仓增加（成本登记，无现金）");} },
  { value: 'PositionDecrease', get label(){return tr("持仓减少调整（无现金，无已实现收益）");} },
];
export default function InvestmentsPage() {
  useLocale();
  const [importRows, setImportRows] = useState<ValuationImportRow[]>();
  const [importPreview, setImportPreview] = useState<unknown>();
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [tradePage, setTradePage] = useState(1);
  const [valuationPage, setValuationPage] = useState(1);
  const [selected, setSelected] = useState<InvestmentAsset>();
  const [editor, setEditor] = useState<{
    kind: 'asset' | 'trade' | 'valuation';
    asset?: InvestmentAsset;
    valuation?: Valuation;
  }>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [correction, setCorrection] = useState<{
    trade: Pick<InvestmentTrade, 'id' | 'version'>;
    pair?: boolean;
    reason: string;
    preview?: unknown;
  }>();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const overviewCurrencies = [...new Set(['CNY','USD','HKD',...(accounts.data?.filter(a=>a.type==='Investment').map(a=>a.currency) || [])])];
  const overview = useQueries({
    queries: overviewCurrencies.map((currency) => ({
      queryKey: ['investment-overview', currency],
      queryFn: () =>
        investmentApi.overview(
          currency,
          dayjs().startOf('year').format('YYYY-MM-DD'),
          dayjs().format('YYYY-MM-DD'),
        ),
      staleTime: 60000,
    })),
  });
  const q = useQuery({
    queryKey: ['investments', page],
    queryFn: () => investmentApi.positions(page),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const trades = useQuery({
    queryKey: ['investment-trades', selected?.id, tradePage],
    queryFn: () => investmentApi.trades(selected!.id, tradePage),
    enabled: !!selected,
  });
  const eventHistory = useQuery({
    queryKey: ['investment-history', selected?.id, eventPage],
    queryFn: () => investmentApi.history(selected!.id, eventPage),
    enabled: !!selected,
  });
  const valuations = useQuery({
    queryKey: ['investment-valuations', selected?.id, valuationPage],
    queryFn: () => investmentApi.valuations(selected!.id, valuationPage),
    enabled: !!selected,
  });
  const tradeType = Form.useWatch('type', form);
  const accountId = Form.useWatch('accountId', form);
  const money = (v: string | null, a: InvestmentAsset) =>
    v == null ? '暂无估值' : <Money value={v} currency={a.currency} />;
  const precise = (v: string | null) => (hidden ? '••••' : (v ?? '—'));
  function open(
    kind: 'asset' | 'trade' | 'valuation',
    asset?: InvestmentAsset,
    valuation?: Valuation,
  ) {
    setEditor({ kind, asset, valuation });
    form.resetFields();
    form.setFieldsValue(
      kind === 'asset'
        ? (asset ?? {
            type: 'Stock',
            currency: 'CNY',
            code: '',
            market: '',
            unit: '份',
            state: 'Active',
            note: '',
          })
        : kind === 'trade'
          ? {
              type: 'Buy',
              date: dayjs().format('YYYY-MM-DD'),
              settlementDate: dayjs().format('YYYY-MM-DD'),
              quantity: '0',
              price: '0',
              amount: '0',
              commission: '0',
              tax: '0',
              otherFee: '0',
              note: '',
            }
          : (valuation ?? {
              date: dayjs().format('YYYY-MM-DD'),
              source: '手动录入',
              price: '0',
            }),
    );
  }
  async function refresh() {
    await Promise.all(
      [
        'investments',
        'investment-overview',
        'investment-performance',
        'investment-trades',
        'investment-valuations',
        'investment-history',
        'accounts',
        'dashboard',
        'reports',
        'net-worth-attribution',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  }
  async function submit() {
    const value = await form.validateFields();
    setBusy(true);
    try {
      if (editor!.kind === 'asset') {
        const account = accounts.data?.find((a) => a.id === value.accountId);
        await investmentApi.save(
          `/investments/assets${editor!.asset ? '/' + editor!.asset.id : ''}`,
          { ...value, currency: account?.currency },
          editor!.asset?.version,
          editor!.asset ? 'put' : 'post',
        );
      } else if (editor!.kind === 'trade') {
        const a = q.data?.items.find(
          (p) => p.asset.id === editor!.asset!.id,
        )?.asset;
        await investmentApi.save(
          tradeType === 'Reinvest'
            ? '/investments/reinvestments'
            : '/investments/trades',
          {
            ...value,
            assetId: editor!.asset!.id,
            transactionId: value.transactionId || null,
            categoryId: value.categoryId || null,
          },
          a?.version,
        );
      } else
        await investmentApi.save(
          '/investments/valuations',
          { ...value, assetId: editor!.asset!.id },
          editor!.valuation?.version,
        );
      setEditor(undefined);
      await refresh();
      void message.success(tr("已保存"));
    } catch (e) {
      void message.error((e as Error).message || tr("保存失败"));
    } finally {
      setBusy(false);
    }
  }
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div className="page-heading investment-heading">
        <PageTitle>{tr("投资管理")}</PageTitle>
        <Upload
          accept=".csv"
          showUploadList={false}
          disabled={hidden || busy}
          beforeUpload={async (file) => {
            try {
              if (file.size > 1024 * 1024) throw new Error('文件超过1MB');
              setImportRows(parseValuationCsv(await file.text()));
              setImportPreview(undefined);
            } catch (e) {
              void message.error((e as Error).message);
            }
            return false;
          }}
        >
          <Button disabled={hidden || busy}>{tr("导入估值 CSV")}</Button>
        </Upload>
        <TemplateImport kind="assets" />
        <Link to="/investments/performance">{tr("投资收益分析")}</Link>
        <Button type="primary" disabled={hidden} onClick={() => open('asset')}>
          {tr("登记投资资产")}</Button>
      </div>
      {!accounts.isPending &&
        !accounts.data?.some((a) => a.type === 'Investment') && (
          <Alert
            type="warning"
            message={
              <span>
                {tr("请先在")}<Link to="/accounts">{tr("账户管理")}</Link>
                {tr("建立投资资金账户，余额仅代表现金。")}</span>
            }
          />
        )}
      {hidden && (
        <Alert
          type="info"
          message={tr("隐私模式已隐藏金额与数量，登记和预览暂停。")}
        />
      )}
      {overview.map((item, index) => (
        <Card
          key={index}
          title={tr("{0} · 投资总览", overviewCurrencies[index])}
          loading={item.isPending}
        >
          {item.data && (
            <>
              <Space wrap>
                {tr("已覆盖市值")}{' '}
                <Money
                  value={item.data.summary.marketValueCovered}
                  currency={item.data.currency}
                />{' '}
                {tr("剩余成本")}{' '}
                <Money
                  value={item.data.summary.remainingCost}
                  currency={item.data.currency}
                />{' '}
                {tr("今年已实现")}{' '}
                <Money
                  value={item.data.summary.realizedInPeriod}
                  currency={item.data.currency}
                />{' '}
                {tr("今年分红利息")}{' '}
                <Money
                  value={item.data.summary.incomeInPeriod}
                  currency={item.data.currency}
                />{' '}
                {tr("未实现（已覆盖）")}{' '}
                <Money
                  value={item.data.summary.unrealizedCovered}
                  currency={item.data.currency}
                />
              </Space>
              <p>
                {tr("持仓资产数：")}{hidden ? '••••' : item.data.summary.heldAssets}
                {tr("；缺少估值：")}{item.data.summary.missingValuations}
              </p>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="type"
                pagination={false}
                dataSource={item.data.summary.distribution}
                columns={[
                  {
                    title: tr("类型"),
                    dataIndex: 'type',
                    render: (v) => types.find((t) => t.value === v)?.label ?? v,
                  },
                  {
                    title: tr("市值"),
                    dataIndex: 'marketValue',
                    render: (v) => (
                      <Money value={v} currency={item.data!.currency} />
                    ),
                  },
                  {
                    title: tr("占已覆盖市值 %"),
                    dataIndex: 'percent',
                    render: (v) => (hidden ? '••••' : (v ?? '—')),
                  },
                ]}
              />
            </>
          )}
          {item.isError && (
            <ErrorState error={item.error} retry={() => item.refetch()} />
          )}
        </Card>
      ))}
      <Card title={tr("持仓与收益（按原币）")}>
        <Table<Position>
          rowKey={(r) => r.asset.id}
          loading={q.isPending}
          dataSource={q.data?.items}
          pagination={false}
          scroll={{ x: 1900 }}
          columns={[
            {
              title: tr("资产"),
              width: 180,
              render: (_, r) => (
                <Button
                  type="link"
                  onClick={() => {
                    setSelected(r.asset);
                    setTradePage(1);
                    setValuationPage(1);
                    setEventPage(1);
                  }}
                >
                  {hidden ? '••••' : r.asset.name}
                </Button>
              ),
            },
            {
              title: tr("类型 / 币种"),
              width: 130,
              render: (_, r) =>
                `${types.find((t) => t.value === r.asset.type)?.label} / ${r.asset.currency}`,
            },
            { title: tr("数量"), render: (_, r) => precise(r.quantity) },
            { title: tr("剩余成本"), render: (_, r) => money(r.cost, r.asset) },
            { title: tr("平均成本"), render: (_, r) => precise(r.averageCost) },
            { title: tr("最新单价"), render: (_, r) => precise(r.price) },
            { title: tr("市值"), render: (_, r) => money(r.marketValue, r.asset) },
            {
              title: tr("已实现价差"),
              render: (_, r) => money(r.realized, r.asset),
            },
            {
              title: tr("分红 / 利息"),
              render: (_, r) => money(r.income, r.asset),
            },
            {
              title: tr("未实现盈亏"),
              render: (_, r) => money(r.unrealized, r.asset),
            },
            {
              title: tr("估值日期"),
              dataIndex: 'valuationDate',
              render: (v) => v ?? '暂无估值',
            },
            {
              title: tr("状态"),
              render: (_, r) => (
                <Tag>{r.asset.state === 'Active' ? tr("有效") : tr("归档")}</Tag>
              ),
            },
            {
              title: tr("操作"),
              width: 260,
              render: (_, r) => (
                <Space>
                  <Button
                    disabled={hidden}
                    onClick={() => open('asset', r.asset)}
                  >
                    {tr("编辑")}</Button>
                  <Button
                    disabled={hidden || r.asset.state !== 'Active'}
                    onClick={() => open('trade', r.asset)}
                  >
                    {tr("交易")}</Button>
                  <Button
                    disabled={hidden}
                    onClick={() => open('valuation', r.asset)}
                  >
                    {tr("估值")}</Button>
                </Space>
              ),
            },
          ]}
        />
        <Pagination
          current={page}
          total={q.data?.total}
          pageSize={20}
          showSizeChanger={false}
          onChange={setPage}
        />
      </Card>
      <Drawer
        width={1000}
        title={hidden ? tr("投资持仓") : selected?.name}
        open={!!selected}
        onClose={() => setSelected(undefined)}
      >
        <p>{tr("资产 ID：")}{selected?.id}</p>
        {selected && <Link to={`/investments/performance?assetId=${encodeURIComponent(selected.id)}&currency=${encodeURIComponent(selected.currency)}`}>{tr('投资收益分析')}</Link>}
        <Tabs
          items={[
            {
              key: 'events',
              label: tr("事件与更正历史"),
              children: (
                <Table
                  scroll={{ x: 'max-content' }}
                  rowKey="id"
                  pagination={{
                    current: eventPage,
                    pageSize: 20,
                    total: eventHistory.data?.total,
                    showSizeChanger: false,
                    onChange: setEventPage,
                  }}
                  dataSource={eventHistory.data?.items}
                  columns={[
                    { title: tr("时间"), dataIndex: 'createdAt' },
                    { title: tr("事件"), dataIndex: 'kind' },
                    {
                      title: tr("说明"),
                      dataIndex: 'reason',
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr("操作"),
                      render: (_, r) =>
                        r.kind === 'Reinvestment' ? (
                          <Button
                            disabled={hidden}
                            onClick={() =>
                              setCorrection({
                                trade: { id: r.id, version: r.version },
                                pair: true,
                                reason: '',
                              })
                            }
                          >
                            {tr("成组撤销预览")}</Button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'trades',
              label: tr("投资交易"),
              children: (
                <>
                  <Table<InvestmentTrade>
                    rowKey="id"
                    dataSource={trades.data?.items}
                    loading={trades.isPending}
                    pagination={false}
                    scroll={{ x: 750 }}
                    columns={[
                      { title: tr("日期"), dataIndex: 'date' },
                      {
                        title: tr("类型"),
                        dataIndex: 'type',
                        render: (v) =>
                          tradeTypes.find((t) => t.value === v)?.label,
                      },
                      { title: tr("数量"), dataIndex: 'quantity', render: precise },
                      {
                        title: tr("成交金额"),
                        render: (_, r) => money(r.amount, selected!),
                      },
                      {
                        title: tr("佣金"),
                        render: (_, r) => money(r.commission, selected!),
                      },
                      {
                        title: tr("税费"),
                        render: (_, r) => money(r.tax, selected!),
                      },
                      {
                        title: tr("状态"),
                        dataIndex: 'state',
                        render: (v) => (v === 'Active' ? '有效' : '已撤销'),
                      },
                      {
                        title: tr("资金流水"),
                        render: (_, r) =>
                          r.transactionId ? (
                            <Link to={`/transactions/${r.transactionId}`}>
                              {tr("查看")}</Link>
                          ) : (
                            '无现金流水'
                          ),
                      },
                      {
                        title: tr("更正"),
                        render: (_, r) => (
                          <Button
                            disabled={hidden || r.state !== 'Active'}
                            onClick={() =>
                              setCorrection({ trade: r, reason: '' })
                            }
                          >
                            {tr("撤销预览")}</Button>
                        ),
                      },
                    ]}
                  />
                  <Pagination
                    current={tradePage}
                    total={trades.data?.total}
                    pageSize={20}
                    showSizeChanger={false}
                    onChange={setTradePage}
                  />
                  {trades.isError && (
                    <ErrorState
                      error={trades.error}
                      retry={() => trades.refetch()}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'valuations',
              label: tr("估值历史"),
              children: (
                <>
                  <Table<Valuation>
                    scroll={{ x: 'max-content' }}
                    rowKey="id"
                    dataSource={valuations.data?.items}
                    pagination={false}
                    columns={[
                      { title: tr("日期"), dataIndex: 'date' },
                      { title: tr("单价"), dataIndex: 'price', render: precise },
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
                        title: tr("操作"),
                        render: (_, r) => (
                          <Button
                            disabled={hidden}
                            onClick={() => open('valuation', selected, r)}
                          >
                            {tr("更正")}</Button>
                        ),
                      },
                    ]}
                  />
                  <Pagination
                    current={valuationPage}
                    total={valuations.data?.total}
                    pageSize={20}
                    showSizeChanger={false}
                    onChange={setValuationPage}
                  />
                  {valuations.isError && (
                    <ErrorState
                      error={valuations.error}
                      retry={() => valuations.refetch()}
                    />
                  )}
                </>
              ),
            },
          ]}
        />
      </Drawer>
      <Drawer
        width={480}
        title={
          editor?.kind === 'asset'
            ? tr("投资资产档案")
            : editor?.kind === 'trade'
              ? tr("登记投资交易")
              : tr("录入估值")
        }
        open={!!editor && !hidden}
        onClose={() => !busy && setEditor(undefined)}
        extra={
          <Button
            type="primary"
            disabled={hidden}
            loading={busy}
            onClick={() => void submit()}
          >
            {tr("保存")}</Button>
        }
      >
        <Form form={form} layout="vertical" disabled={hidden || busy}>
          {editor?.kind === 'asset' ? (
            <>
              <Form.Item
                name="name"
                label={tr("资产名称")}
                rules={[{ required: true }]}
              >
                <Input maxLength={150} />
              </Form.Item>
              <Form.Item
                name="accountId"
                label={tr("投资资金账户（余额仅代表现金）")}
                rules={[{ required: true }]}
              >
                <Select
                  disabled={!!editor.asset}
                  options={accounts.data
                    ?.filter(
                      (a) => a.type === 'Investment' && a.status === 'Active',
                    )
                    .map((a) => ({
                      value: a.id,
                      label: `${a.name} (${a.currency})`,
                    }))}
                />
              </Form.Item>
              <p>
                {tr("币种：")}{accounts.data?.find((a) => a.id === accountId)?.currency ??
                  tr("请选择账户")}
              </p>
              <Form.Item
                name="type"
                label={tr("资产类型")}
                rules={[{ required: true }]}
              >
                <Select disabled={!!editor.asset} options={types} />
              </Form.Item>
              <Form.Item name="market" label={tr("交易市场")}>
                <Input disabled={!!editor.asset} maxLength={80} />
              </Form.Item>
              <Form.Item name="code" label={tr("资产代码")}>
                <Input disabled={!!editor.asset} maxLength={80} />
              </Form.Item>
              <Form.Item
                name="unit"
                label={tr("交易单位")}
                rules={[{ required: true }]}
              >
                <Input maxLength={20} />
              </Form.Item>
              <Form.Item name="state" label={tr("状态")}>
                <Select
                  options={[
                    { value: 'Active', label: tr("有效") },
                    { value: 'Archived', label: tr("归档（保留历史）") },
                  ]}
                />
              </Form.Item>
            </>
          ) : editor?.kind === 'trade' ? (
            <>
              <Form.Item name="type" label={tr("交易类型")}>
                <Select options={tradeTypes} />
              </Form.Item>
              <Form.Item
                name="date"
                label={tr("交易日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" />
              </Form.Item>
              <Form.Item
                name="settlementDate"
                label={tr("结算日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" />
              </Form.Item>
              {[
                'quantity',
                'price',
                'amount',
                'commission',
                'tax',
                'otherFee',
              ].map((field, i) => (
                <Form.Item
                  key={field}
                  name={field}
                  label={
                    [
                      '数量（最多8位小数）',
                      '成交单价（最多8位小数）',
                      tradeType === 'PositionIncrease'
                        ? '取得成本（不再次过账）'
                        : '成交金额（买卖 / 减少调整填0）',
                      '佣金',
                      '税费',
                      '其他费用',
                    ][i]
                  }
                  rules={[
                    { required: true },
                    {
                      pattern:
                        field === 'quantity' || field === 'price'
                          ? /^\d{1,10}(\.\d{1,8})?$/
                          : /^\d{1,18}(\.\d{1,2})?$/,
                      message: tr("请输入精确十进制字符串"),
                    },
                  ]}
                >
                  <Input inputMode="decimal" />
                </Form.Item>
              ))}
              {['Dividend', 'Interest', 'Fee', 'Reinvest'].includes(
                tradeType,
              ) && (
                <Form.Item
                  name="categoryId"
                  label={tr("实际收入 / 费用分类")}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={categories.data
                      ?.filter(
                        (c) =>
                          c.parentId &&
                          c.status === 'Active' &&
                          c.kind ===
                            (tradeType === 'Fee' ? 'Expense' : 'Income'),
                      )
                      .map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Form.Item>
              )}
              <Form.Item name="transactionId" label={tr("可选：关联已有资金流水 ID")}>
                <Input placeholder={tr("留空时创建一笔受控资金流水")} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="date"
                label={tr("估值日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" disabled={!!editor?.valuation} />
              </Form.Item>
              <Form.Item
                name="price"
                label={tr("单位价格（最多8位小数）")}
                rules={[
                  { required: true },
                  {
                    pattern: /^\d{1,10}(\.\d{1,8})?$/,
                    message: tr("价格格式无效"),
                  },
                ]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item
                name="source"
                label={tr("估值来源 / 依据")}
                rules={[{ required: true }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              {editor?.valuation && (
                <Form.Item
                  name="reason"
                  label={tr("更正原因")}
                  rules={[{ required: true }]}
                >
                  <Input.TextArea maxLength={2000} />
                </Form.Item>
              )}
            </>
          )}
          {editor?.kind !== 'valuation' && (
            <Form.Item name="note" label={tr("备注")}>
              <Input.TextArea maxLength={2000} />
            </Form.Item>
          )}
        </Form>
      </Drawer>
      <Modal
        title={tr("估值文件预览")}
        open={!!importRows && !hidden}
        onCancel={() => {
          setImportRows(undefined);
          setImportPreview(undefined);
        }}
        footer={
          <Space>
            <Button
              disabled={hidden || busy || !importRows}
              onClick={async () => {
                setBusy(true);
                try {
                  setImportPreview(
                    await investmentApi.preview(
                      '/investments/valuations/import-preview',
                      { items: importRows },
                    ),
                  );
                } catch (e) {
                  void message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("验证预览")}</Button>
            <Button
              type="primary"
              disabled={hidden || busy || !importPreview}
              onClick={async () => {
                setBusy(true);
                try {
                  await investmentApi.save('/investments/valuations/import', {
                    items: importRows,
                  });
                  setImportRows(undefined);
                  setImportPreview(undefined);
                  await refresh();
                  void message.success(tr("已导入估值"));
                } catch (e) {
                  void message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("确认导入")}</Button>
          </Space>
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey={(r) => r.assetId + ':' + r.date}
          dataSource={importRows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: tr("资产ID"), dataIndex: 'assetId' },
            { title: tr("日期"), dataIndex: 'date' },
            {
              title: tr("价格"),
              dataIndex: 'price',
              render: (v) => (hidden ? '••••' : v),
            },
            {
              title: tr("来源"),
              dataIndex: 'source',
              render: (value: unknown) => (
                <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
              ),
            },
          ]}
        />
        {importPreview != null && (
          <Alert type="success" message={tr("文件验证通过，可确认导入")} />
        )}
      </Modal>
      <Modal
        title={tr("受控撤销与历史重算")}
        open={!!correction && !hidden}
        onCancel={() => setCorrection(undefined)}
        footer={
          <Space>
            <Button
              disabled={hidden || busy || !correction?.reason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const preview = await investmentApi.preview(
                    `/investments/${correction!.pair ? 'reinvestments' : 'trades'}/${correction!.trade.id}/correction-preview`,
                    { reason: correction!.reason },
                    correction!.trade.version,
                  );
                  setCorrection({ ...correction!, preview });
                } catch (e) {
                  void message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("计算预览")}</Button>
            <Button
              danger
              disabled={hidden || busy || !correction?.preview}
              onClick={async () => {
                setBusy(true);
                try {
                  await investmentApi.save(
                    `/investments/${correction!.pair ? 'reinvestments' : 'trades'}/${correction!.trade.id}/correct`,
                    { reason: correction!.reason },
                    correction!.trade.version,
                  );
                  setCorrection(undefined);
                  await refresh();
                } catch (e) {
                  void message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("确认撤销")}</Button>
          </Space>
        }
      >
        <Input.TextArea
          disabled={hidden}
          value={correction?.reason}
          onChange={(e) =>
            setCorrection({
              ...correction!,
              reason: e.target.value,
              preview: undefined,
            })
          }
          placeholder={tr("填写更正原因")}
        />
        {!hidden && correction?.preview != null && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(correction.preview, null, 2)}
          </pre>
        )}
      </Modal>
    </Space>
  );
}
