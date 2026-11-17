import { usePreferredCurrency } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { LoadingState } from '../components/LoadingState';
import { PageTitle } from '../components/PageTitle';
import { lazy, Suspense, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Pagination, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  assetApi,
  type CustomDefinition,
  type CustomResult,
  type CustomSaved,
} from '../api/assetManagement';
import { investmentApi } from '../api/investments';
import { advancedApi } from '../api/operations';
import { accountApi, categoryApi } from '../api/finance';
import { directoryApi } from '../api/business';
import { Money } from '../components/Money';
import { investmentDisplayAmount } from '../features/investmentReturns/displayAmount';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
const Chart = lazy(() => import('../components/Chart'));
const labels: Record<string, string> = localizedLabels({
  income: '收入',
  expense: '净支出',
  count: '交易笔数',
  average: '平均单笔净支出',
  marketValue: '投资市值',
  realized: '已实现收益',
  unrealized: '未实现收益',
  xirrPercent: '年化 XIRR %',
  totalProfit: '期间总收益',
  amount: '资产估值',
  surplus: '收支结余',
  budget: '预算额度',
  used: '预算实际净支出',
  executionPercent: '预算执行率 %',
});
export default function CustomReportsPage() {
  useLocale();
  const preferredCurrency = usePreferredCurrency();
  const [form] = Form.useForm<CustomDefinition>();
  const [result, setResult] = useState<CustomResult>();
  const [previewDefinition, setPreviewDefinition] =
    useState<CustomDefinition>();
  const [editing, setEditing] = useState<CustomSaved>();
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const theme = Form.useWatch('theme', form) || 'Ledger';
  const chartType = Form.useWatch('chartType', form) || 'table';
  const selectedMetrics = Form.useWatch('metrics', form) as
    string[] | undefined;
  const q = useQuery({
    queryKey: ['custom-reports', page],
    queryFn: () => assetApi.reports(page),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const projects = useQuery({
    queryKey: ['directory', 'projects'],
    queryFn: () => directoryApi.list('projects'),
  });
  const tags = useQuery({
    queryKey: ['directory', 'tags'],
    queryFn: () => directoryApi.list('tags'),
  });
  const metrics =
    theme === 'InvestmentReturns'
      ? ['xirrPercent', 'totalProfit']
      : theme === 'Investment'
      ? ['marketValue', 'realized', 'unrealized']
      : theme === 'Assets'
        ? ['amount']
        : theme === 'Budget'
          ? ['budget', 'used', 'executionPercent']
          : ['income', 'expense', 'surplus', 'count', 'average'];
  const visible =
    selectedMetrics?.filter((m) => metrics.includes(m)) ?? metrics;
  async function run(save: boolean) {
    let b = await form.validateFields();
    if (theme !== 'Ledger')
      b = {
        ...b,
        accountId: undefined,
        categoryId: undefined,
        projectId: undefined,
        tagId: undefined,
        merchant: undefined,
        transactionType: undefined,
        metrics,
      };
    setBusy(true);
    try {
      if (save) {
        await investmentApi.save(
          '/reports/custom' + (editing ? '/' + editing.id : ''),
          b,
          editing?.version,
          editing ? 'put' : 'post',
        );
        setEditing(undefined);
        await cache.invalidateQueries({ queryKey: ['custom-reports'] });
      } else {
        setResult(await assetApi.preview(b));
        setPreviewDefinition(b);
      }
    } catch (e) {
      void message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function value(r: CustomResult['rows'][number], m: string) {
    return r[m as keyof typeof r] ?? null;
  }
  async function exportReport(format: 'CSV' | 'Excel') {
    if (!result || !previewDefinition || hidden || busy) return;
    setBusy(true);
    try {
      const response = await investmentApi.save('/reports/custom/export', {
        definition: previewDefinition,
        format,
      });
      const job = response.data.data as { id: string; fileName: string };
      const blob = await advancedApi.download(job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      void message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const chartMetric = visible.find((m) => m !== 'count') ?? visible[0];
  const chartValues =
    result?.rows
      .filter((r) => value(r, chartMetric) != null)
      .map((r) => ({ name: r.label, value: Number(value(r, chartMetric)) })) ??
    [];
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageTitle>{tr("自定义财务报表")}</PageTitle>
      <Card title={editing ? tr("编辑：{0}", editing.name) : tr("报表模板与筛选")}>
        <Form
          form={form}
          layout="vertical"
          disabled={hidden || busy}
          initialValues={{
            name: '月度分类收支',
            start: dayjs().startOf('month').format('YYYY-MM-DD'),
            end: dayjs().format('YYYY-MM-DD'),
            currency: preferredCurrency,
            groupBy: 'category',
            theme: 'Ledger',
            sort: 'label',
            chartType: 'table',
          }}
          onValuesChange={() => setResult(undefined)}
        >
          <Space wrap>
            <Form.Item name="name" label={tr("名称")} rules={[{ required: true }]}>
              <Input maxLength={150} />
            </Form.Item>
            <Form.Item name="theme" label={tr("数据主题")}>
              <Select
                style={{ width: 180 }}
                options={[
                  { value: 'Ledger', label: tr("账本收支") },
                  { value: 'Investment', label: tr("投资持仓收益") },
                  { value: 'InvestmentReturns', label: tr('投资现金流收益率（最多20项）') },
                  { value: 'Assets', label: tr("综合资产估值") },
                  { value: 'Budget', label: tr("月度预算执行（完整月份）") },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="start"
              label={tr("开始日期")}
              rules={[{ required: true }]}
            >
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="end" label={tr("结束日期")} rules={[{ required: true }]}>
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="currency" label={tr("币种")}>
              <Select
                style={{ width: 100 }}
                options={CURRENCY_CODES.map((value) => ({ value }))}
              />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item
              name="groupBy"
              label={theme === 'Ledger' ? tr("分组") : tr("非账本主题按资产分组")}
            >
              <Select
                disabled={theme !== 'Ledger'}
                style={{ width: 170 }}
                options={[
                  { value: 'category', label: tr("分类 / 收入来源") },
                  { value: 'account', label: tr("账户") },
                  { value: 'merchant', label: tr("商户") },
                  { value: 'month', label: tr("月份") },
                  { value: 'parentCategory', label: tr("一级分类") },
                  { value: 'date', label: tr("日期") },
                  { value: 'year', label: tr("年份") },
                  { value: 'project', label: tr("项目") },
                  { value: 'tag', label: tr("标签（多标签可重复分组）") },
                  { value: 'type', label: tr("交易类型") },
                  { value: 'currency', label: tr("币种") },
                ]}
              />
            </Form.Item>
            <Form.Item name="metrics" label={tr("展示指标")}>
              <Select
                mode="multiple"
                style={{ minWidth: 250 }}
                placeholder={tr("默认显示全部主题指标")}
                options={metrics.map((value) => ({
                  value,
                  label: labels[value],
                }))}
              />
            </Form.Item>
            <Form.Item name="sort" label={tr("排序（账本）")}>
              <Select
                style={{ width: 140 }}
                disabled={theme !== 'Ledger'}
                options={[
                  { value: 'label', label: tr("名称顺序") },
                  { value: 'income', label: tr("收入降序") },
                  { value: 'expense', label: tr("支出降序") },
                ]}
              />
            </Form.Item>
            <Form.Item name="chartType" label={tr("图表")}>
              <Select
                style={{ width: 130 }}
                options={[
                  { value: 'table', label: tr("表格") },
                  { value: 'bar', label: tr("柱状图") },
                  { value: 'line', label: tr("折线图") },
                  { value: 'pie', label: tr("饼图") },
                ]}
              />
            </Form.Item>
          </Space>
          {theme === 'Ledger' && (
            <Space wrap>
              <Form.Item name="accountId" label={tr("账户筛选")}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  options={accounts.data?.map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="categoryId" label={tr("分类筛选")}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  options={categories.data?.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="projectId" label={tr("项目筛选")}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  options={projects.data?.items.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="tagId" label={tr("标签筛选")}>
                <Select
                  allowClear
                  style={{ width: 180 }}
                  options={tags.data?.items.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              </Form.Item>
              <Form.Item name="merchant" label={tr("商户（精确匹配）")}>
                <Input />
              </Form.Item>
              <Form.Item name="transactionType" label={tr("交易类型")}>
                <Select
                  allowClear
                  style={{ width: 150 }}
                  options={[
                    { value: 'Expense', label: tr("支出") },
                    { value: 'Income', label: tr("收入") },
                    { value: 'Refund', label: tr("退款") },
                    { value: 'Transfer', label: tr("转账") },
                    { value: 'InvestmentPrincipal', label: tr("投资本金") },
                  ]}
                />
              </Form.Item>
            </Space>
          )}
          <Space>
            <Button
              type="primary"
              disabled={hidden}
              loading={busy}
              onClick={() => void run(false)}
            >
              {tr("预览报表")}</Button>
            <Button
              disabled={hidden}
              loading={busy}
              onClick={() => void run(true)}
            >
              {tr("保存定义")}</Button>
            {editing && (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  form.resetFields();
                  setResult(undefined);
                }}
              >
                {tr("新建模板")}</Button>
            )}
          </Space>
        </Form>
      </Card>
      {result && (
        <Card
          title={tr("{0} 至 {1} · {2}", result.start, result.end, result.currency)}
          extra={
            <Space>
              <Button
                disabled={hidden || busy}
                onClick={() => void exportReport('CSV')}
              >
                {tr("导出 CSV")}</Button>
              <Button
                disabled={hidden || busy}
                onClick={() => void exportReport('Excel')}
              >
                {tr("导出 Excel")}</Button>
            </Space>
          }
        >
          <Alert type="info" message={result.scope} />
          {result.theme === 'Ledger' && (
            <Space wrap>
              {tr("收入")}<Money value={result.income} currency={result.currency} />
              {tr("支出")}<Money value={result.expense} currency={result.currency} />
              {tr("结余")}<Money value={result.surplus} currency={result.currency} />
              {result.inflow != null && (
                <>
                  {tr("资金流入")}{' '}
                  <Money value={result.inflow} currency={result.currency} />
                  {tr("资金流出")}{' '}
                  <Money value={result.outflow!} currency={result.currency} />
                </>
              )}
            </Space>
          )}
          {result.valuation && (
            <>
              <Alert
                type={result.valuation.complete ? 'info' : 'warning'}
                message={tr("估值覆盖缺口：{0}", result.valuation.uncovered)}
              />
              {result.valuation.groups.map((g) => (
                <p key={g.currency}>
                  {tr("资产")}<Money value={g.assets} currency={g.currency} /> {tr("负债")}{' '}
                  <Money value={g.liabilities} currency={g.currency} /> {tr("净资产")}{' '}
                  <Money value={g.netWorth} currency={g.currency} />
                </p>
              ))}
            </>
          )}
          {!hidden &&
            chartType !== 'table' &&
            (chartType === 'pie' && chartValues.some((x) => x.value < 0) ? (
              <Alert
                type="info"
                message={tr("包含负值，饼图不适用；完整数值见下表。")}
              />
            ) : (
              <Suspense fallback={<LoadingState />}>
                <Chart
                  option={
                    chartType === 'pie'
                      ? {
                          tooltip: { trigger: 'item' },
                          series: [{ type: 'pie', data: chartValues }],
                        }
                      : {
                          tooltip: { trigger: 'axis' },
                          xAxis: {
                            type: 'category',
                            data: chartValues.map((x) => x.name),
                          },
                          yAxis: { type: 'value' },
                          series: [
                            {
                              type: chartType,
                              data: chartValues.map((x) => x.value),
                              name: labels[chartMetric],
                            },
                          ],
                        }
                  }
                />
              </Suspense>
            ))}
          <Table
            rowKey="key"
            dataSource={result.rows}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 700 }}
            columns={[
              { title: tr("分组"), dataIndex: 'label' },
              ...visible.map((m) => ({
                title: labels[m],
                render: (_: unknown, r: CustomResult['rows'][number]) => {
                  const v = value(r, m);
                  return m === 'count' ? (
                    hidden ? (
                      '••••'
                    ) : (
                      v
                    )
                  ) : m === 'executionPercent' || m === 'xirrPercent' ? (
                    hidden ? (
                      '••••'
                    ) : v == null ? (
                      m === 'xirrPercent' ? '—' : '无预算分母'
                    ) : (
                      `${m === 'xirrPercent' ? Number(v).toFixed(2) : v}%`
                    )
                  ) : v == null ? (
                    '未覆盖'
                  ) : (
                    <Money value={m === 'totalProfit' ? investmentDisplayAmount(String(v)) : String(v)} currency={result.currency} />
                  );
                },
              })),
              { title: tr("提示"), dataIndex: 'missing' },
            ]}
          />
        </Card>
      )}
      <Card title={tr("已保存报表")}>
        <Table<CustomSaved>
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={q.data?.items}
          loading={q.isPending}
          pagination={false}
          columns={[
            {
              title: tr("名称"),
              dataIndex: 'name',
              render: (value: unknown) => (
                <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
              ),
            },
            { title: tr("币种"), render: (_, r) => r.definition.currency },
            {
              title: tr("操作"),
              render: (_, r) => (
                <Space>
                  <Button
                    disabled={hidden}
                    onClick={() => {
                      setEditing(r);
                      form.resetFields();
                      form.setFieldsValue(r.definition);
                      setResult(undefined);
                    }}
                  >
                    {tr("恢复定义")}</Button>
                  <Button
                    danger
                    disabled={hidden || busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await investmentApi.save(
                          `/reports/custom/${r.id}/delete`,
                          { reason: '用户删除报表定义' },
                          r.version,
                        );
                        await cache.invalidateQueries({
                          queryKey: ['custom-reports'],
                        });
                        if (editing?.id === r.id) setEditing(undefined);
                      } catch (e) {
                        void message.error((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {tr("删除定义")}</Button>
                </Space>
              ),
            },
          ]}
        />
        <Pagination
          current={page}
          pageSize={20}
          showSizeChanger={false}
          total={q.data?.total}
          onChange={setPage}
        />
        {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      </Card>
    </Space>
  );
}
