import { usePreferredCurrency } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { App, Button, Card, Checkbox, Drawer, Form, Input, Pagination, Space, Table, Tag } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  assetApi,
  type ManagedAsset,
  type PhysicalValuation,
} from '../api/assetManagement';
import { investmentApi } from '../api/investments';
import { accountApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import PhysicalAssetsPage from './PhysicalAssetsPage';
const assetTypes = [
  { value: 'Property', get label(){return tr("房产");} },
  { value: 'Vehicle', get label(){return tr("车辆");} },
  { value: 'Valuable', get label(){return tr("贵重物品");} },
  { value: 'Other', get label(){return tr("其他资产");} },
];
export default function ManagedAssetsPage({ deposits = false }: { deposits?: boolean }) {
  return deposits ? <ManagedAssetsLegacy deposits /> : <PhysicalAssetsPage />;
}
function ManagedAssetsLegacy({
  deposits = false,
}: {
  deposits?: boolean;
}) {
  useLocale();
  const preferredCurrency = usePreferredCurrency();
  const hidden = useUI((s) => s.hidden);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<ManagedAsset>();
  const [historyPage, setHistoryPage] = useState(1);
  const [editor, setEditor] = useState<{
    kind: 'asset' | 'valuation' | 'settlement';
    asset?: ManagedAsset;
  }>();
  const [preview, setPreview] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const existingPrincipal = Form.useWatch(
    'balanceAlreadyIncludesPrincipal',
    form,
  );
  const settlementState = Form.useWatch('state', form);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const path = deposits ? '/term-deposits' : '/physical-assets';
  const q = useQuery({
    queryKey: ['managed-assets', deposits, page],
    queryFn: () => assetApi.list(deposits, page),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const valuations = useQuery({
    queryKey: ['physical-valuations', history?.id, historyPage],
    queryFn: () => assetApi.valuations(history!.id, historyPage),
    enabled: !!history,
  });
  function open(
    kind: 'asset' | 'valuation' | 'settlement',
    asset?: ManagedAsset,
  ) {
    setEditor({ kind, asset });
    setPreview(undefined);
    form.resetFields();
    form.setFieldsValue(
      kind === 'asset'
        ? asset
          ? {
              ...asset,
              balanceAlreadyIncludesPrincipal:
                (deposits && !asset.fundingTransactionId) ||
                (!deposits && !!asset.accountId),
            }
          : {
              type: deposits ? 'TermDeposit' : 'Property',
              currency: preferredCurrency,
              cost: '0',
              acquiredDate: dayjs().format('YYYY-MM-DD'),
              annualRate: '0',
              dayCount: 'Actual365',
              maturityAction: 'Manual',
              state: 'Active',
              institution: '',
              note: '',
            }
        : kind === 'valuation'
          ? {
              date: dayjs().format('YYYY-MM-DD'),
              amount: '0',
              source: '手动估值',
            }
          : { actualInterest: '0', state: 'Matured', reason: '' },
    );
  }
  async function submit(previewOnly = false) {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (editor!.kind === 'asset')
        await investmentApi.save(
          path + (editor!.asset ? '/' + editor!.asset.id : ''),
          {
            ...values,
            accountId: values.accountId || null,
            liabilityAccountId: values.liabilityAccountId || null,
            fundingTransactionId: values.balanceAlreadyIncludesPrincipal
              ? null
              : values.fundingTransactionId || null,
            maturityDate: values.maturityDate || null,
          },
          editor!.asset?.version,
          editor!.asset ? 'put' : 'post',
        );
      else if (editor!.kind === 'valuation')
        await investmentApi.save(
          `/physical-assets/${editor!.asset!.id}/valuations`,
          values,
          editor!.asset!.version,
        );
      else if (previewOnly) {
        setPreview(
          await investmentApi.preview(
            `/term-deposits/${editor!.asset!.id}/settlement-preview`,
            {
              ...values,
              interestTransactionId: values.interestTransactionId || null,
            },
            editor!.asset!.version,
          ),
        );
        return;
      } else
        await investmentApi.save(
          `/term-deposits/${editor!.asset!.id}/settle`,
          {
            ...values,
            interestTransactionId: values.interestTransactionId || null,
          },
          editor!.asset!.version,
        );
      setEditor(undefined);
      await Promise.all(
        ['managed-assets', 'physical-valuations', 'asset-allocation'].map(
          (key) => cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      void message.success(tr("已保存"));
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
      <div className="page-heading">
        <PageTitle>{deposits ? tr("定期存款") : tr("实物资产")}</PageTitle>
        <Button type="primary" disabled={hidden} onClick={() => open('asset')}>
          {tr("登记")}{deposits ? tr("存款") : tr("资产")}
        </Button>
      </div>
      <Card>
        <Table<ManagedAsset>
          rowKey="id"
          loading={q.isPending}
          dataSource={q.data?.items}
          pagination={false}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: tr("名称"),
              dataIndex: 'name',
              render: (v: string) => (hidden ? '••••' : v),
            },
            { title: tr("币种"), dataIndex: 'currency' },
            {
              title: deposits ? tr("本金") : tr("取得成本"),
              render: (_, r) => <Money value={r.cost} currency={r.currency} />,
            },
            { title: tr("取得 / 起息日期"), dataIndex: 'acquiredDate' },
            ...(deposits
              ? [
                  { title: tr("到期日期"), dataIndex: 'maturityDate' },
                  {
                    title: tr("年利率 %"),
                    render: (_: unknown, r: ManagedAsset) =>
                      hidden ? '••••' : r.annualRate,
                  },
                  {
                    title: tr("预计利息"),
                    render: (_: unknown, r: ManagedAsset) =>
                      r.expectedInterest == null ? (
                        '—'
                      ) : (
                        <Money
                          value={r.expectedInterest}
                          currency={r.currency}
                        />
                      ),
                  },
                  {
                    title: tr("提醒"),
                    render: (_: unknown, r: ManagedAsset) =>
                      r.due ? <Tag color="orange">{tr("即将 / 已经到期")}</Tag> : '—',
                  },
                ]
              : []),
            {
              title: deposits ? tr("已收利息") : tr("当前估值 / 净值"),
              render: (_: unknown, r: ManagedAsset) =>
                deposits ? (
                  r.actualInterest == null ? (
                    '尚未结算'
                  ) : (
                    <Money value={r.actualInterest} currency={r.currency} />
                  )
                ) : r.currentValue == null ? (
                  '暂无估值'
                ) : (
                  <>
                    <Money value={r.currentValue} currency={r.currency} /> /{' '}
                    <Money value={r.netValue!} currency={r.currency} />
                    <p>
                      {r.valuationDate} · {r.valuationSource}
                    </p>
                  </>
                ),
            },
            {
              title: tr("状态"),
              dataIndex: 'state',
              render: (v) =>
                ({
                  Active: '持有中',
                  Archived: '归档',
                  Matured: '正常到期',
                  EarlyWithdrawn: '提前支取',
                })[v as string] ?? v,
            },
            {
              title: tr("操作"),
              render: (_, r) => (
                <Space>
                  <Button disabled={hidden} onClick={() => open('asset', r)}>
                    {tr("编辑")}</Button>
                  {deposits ? (
                    <Button
                      disabled={hidden || r.state !== 'Active'}
                      onClick={() => open('settlement', r)}
                    >
                      {tr("核对结算")}</Button>
                  ) : (
                    <>
                      <Button
                        disabled={hidden}
                        onClick={() => open('valuation', r)}
                      >
                        {tr("估值")}</Button>
                      <Button
                        onClick={() => {
                          setHistory(r);
                          setHistoryPage(1);
                        }}
                      >
                        {tr("历史")}</Button>
                    </>
                  )}
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
        title={
          editor?.kind === 'asset'
            ? tr("资产档案")
            : editor?.kind === 'valuation'
              ? tr("登记实物估值")
              : tr("核对存款结算")
        }
        open={!!editor && !hidden}
        width={480}
        onClose={() => !busy && setEditor(undefined)}
        extra={
          <Space>
            {editor?.kind === 'settlement' && (
              <Button
                disabled={hidden || busy}
                onClick={() => void submit(true)}
              >
                {tr("预览")}</Button>
            )}
            <Button
              type="primary"
              loading={busy}
              disabled={hidden || (editor?.kind === 'settlement' && !preview)}
              onClick={() => void submit()}
            >
              {tr("确认保存")}</Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          disabled={hidden || busy}
          onValuesChange={() => setPreview(undefined)}
        >
          {editor?.kind === 'asset' ? (
            <>
              <Form.Item name="name" label={tr("名称")} rules={[{ required: true }]}>
                <Input maxLength={150} />
              </Form.Item>
              <Form.Item name="type" label={tr("类型")}>
                <Select
                  disabled={!!editor.asset || deposits}
                  options={
                    deposits
                      ? [{ value: 'TermDeposit', label: tr("定期存款 / 大额存单") }]
                      : assetTypes
                  }
                />
              </Form.Item>
              <Form.Item name="currency" label={tr("币种")}>
                <Select
                  disabled={!!editor.asset}
                  options={CURRENCY_CODES.map((value) => ({ value }))}
                />
              </Form.Item>
              <Form.Item
                name="cost"
                label={deposits ? tr("本金") : tr("取得成本（含购置费用）")}
                rules={[
                  { required: true },
                  {
                    pattern: /^\d{1,18}(\.\d{1,2})?$/,
                    message: tr("最多两位小数"),
                  },
                ]}
              >
                <Input disabled={!!editor.asset} inputMode="decimal" />
              </Form.Item>
              <Form.Item
                name="acquiredDate"
                label={deposits ? tr("起息日期") : tr("取得日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" disabled={!!editor.asset} />
              </Form.Item>
              {deposits ? (
                <>
                  <Form.Item
                    name="accountId"
                    label={tr("专用存款资金账户")}
                    rules={[{ required: true }]}
                  >
                    <Select
                      disabled={!!editor.asset}
                      options={accounts.data
                        ?.filter((a) => a.type === 'Bank')
                        .map((a) => ({
                          value: a.id,
                          label: `${a.name} (${a.currency})`,
                        }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="balanceAlreadyIncludesPrincipal"
                    valuePropName="checked"
                  >
                    <Checkbox disabled={!!editor.asset}>
                      {tr("现有账户余额已包含本金，无原转入流水")}</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="fundingTransactionId"
                    label={tr("原本金转入流水 ID")}
                    rules={[{ required: !existingPrincipal }]}
                  >
                    <Input disabled={!!editor.asset} />
                  </Form.Item>
                  <Form.Item name="institution" label={tr("银行 / 机构")}>
                    <Input maxLength={150} />
                  </Form.Item>
                  <Form.Item
                    name="maturityDate"
                    label={tr("到期日期")}
                    rules={[{ required: true }]}
                  >
                    <DateInput type="date" />
                  </Form.Item>
                  <Form.Item
                    name="annualRate"
                    label={tr("年利率（百分数，最多8位小数）")}
                    rules={[{ required: true }]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item name="dayCount" label={tr("计息规则")}>
                    <Select
                      options={[
                        { value: 'Actual365', label: tr("实际天数 / 365") },
                        { value: 'Actual360', label: tr("实际天数 / 360") },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="maturityAction" label={tr("到期处理（只提醒）")}>
                    <Select
                      options={[
                        { value: 'Manual', label: tr("手动结算") },
                        { value: 'Renew', label: tr("提醒续存（另登记新存款）") },
                      ]}
                    />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    name="accountId"
                    label={tr("已有实物资产账户（可选，避免重复计入）")}
                  >
                    <Select
                      allowClear
                      disabled={!!editor.asset}
                      options={accounts.data
                        ?.filter((a) => a.type === 'Other')
                        .map((a) => ({
                          value: a.id,
                          label: `${a.name} (${a.currency})`,
                        }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="balanceAlreadyIncludesPrincipal"
                    valuePropName="checked"
                  >
                    <Checkbox disabled={!!editor.asset}>
                      {tr("此已有账户余额只代表本项实物资产，汇总以本项估值为准")}</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="liabilityAccountId"
                    label={tr("关联已登记负债账户（可选）")}
                  >
                    <Select
                      allowClear
                      options={accounts.data
                        ?.filter((a) => ['Payable', 'Other'].includes(a.type))
                        .map((a) => ({
                          value: a.id,
                          label: `${a.name} (${a.currency})`,
                        }))}
                    />
                  </Form.Item>
                </>
              )}
              <Form.Item name="state" label={tr("状态")}>
                <Select
                  options={[
                    { value: 'Active', label: tr("持有中") },
                    { value: 'Archived', label: tr("归档，保留历史") },
                  ]}
                />
              </Form.Item>
              <Form.Item name="note" label={tr("备注")}>
                <Input.TextArea maxLength={2000} />
              </Form.Item>
            </>
          ) : editor?.kind === 'valuation' ? (
            <>
              <Form.Item
                name="date"
                label={tr("估值日期")}
                rules={[{ required: true }]}
              >
                <DateInput type="date" />
              </Form.Item>
              <Form.Item
                name="amount"
                label={tr("当前估值")}
                rules={[{ required: true }]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item
                name="source"
                label={tr("估值依据")}
                rules={[{ required: true }]}
              >
                <Input maxLength={200} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="transactionId"
                label={tr("本金转回流水 ID")}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="interestTransactionId"
                label={tr("实际利息收入流水 ID")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="actualInterest"
                label={tr("实际利息")}
                rules={[{ required: true }]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="state" label={tr("结算方式")}>
                <Select
                  options={[
                    { value: 'Matured', label: tr("正常到期") },
                    {
                      value: 'EarlyWithdrawn',
                      label: tr("提前支取（按实际利息）"),
                    },
                  ]}
                />
              </Form.Item>
              {settlementState === 'EarlyWithdrawn' && (
                <Form.Item
                  name="earlyAnnualRate"
                  label={tr("银行约定提前支取年利率（重算预计值）")}
                  rules={[{ required: true }]}
                >
                  <Input inputMode="decimal" />
                </Form.Item>
              )}
              <Form.Item
                name="reason"
                label={tr("结算说明")}
                rules={[{ required: true }]}
              >
                <Input.TextArea />
              </Form.Item>
            </>
          )}
        </Form>
        {!hidden && preview != null && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </Drawer>
      <Drawer
        open={!!history}
        title={tr("{0} · 估值历史", history?.name)}
        width={650}
        onClose={() => setHistory(undefined)}
      >
        <Table<PhysicalValuation>
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={valuations.data?.items}
          pagination={false}
          columns={[
            { title: tr("日期"), dataIndex: 'date' },
            {
              title: tr("估值"),
              render: (_, r) => (
                <Money value={r.amount} currency={history?.currency} />
              ),
            },
            {
              title: tr("依据"),
              dataIndex: 'source',
              render: (value: unknown) => (
                <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
              ),
            },
          ]}
        />
        <Pagination
          current={historyPage}
          total={valuations.data?.total}
          pageSize={20}
          showSizeChanger={false}
          onChange={setHistoryPage}
        />
        {valuations.isError && (
          <ErrorState
            error={valuations.error}
            retry={() => valuations.refetch()}
          />
        )}
      </Drawer>
    </Space>
  );
}
