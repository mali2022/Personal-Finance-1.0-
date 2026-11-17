import { CurrencySettingsPanel } from '../components/CurrencySettingsPanel';
import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Drawer, Form, Input, InputNumber, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { investmentApi } from '../api/investments';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { CategorySelector } from '../components/Selectors';
import { useUI } from '../stores/ui';
import type { ApiResponse, Currency } from '../types';
type AnalysisData = {
  items: Record<string, unknown>[];
  summaries?: {
    year: number;
    currency: Currency;
    income: string;
    expense: string;
    count: number;
    maximumExpense?: string;
    categories?: { categoryId: string; name: string; amount: string }[];
  }[];
  [key: string]: unknown;
};
export default function StageGAnalysisPage({
  living = false,
}: {
  living?: boolean;
}) {
  useLocale();
  const [params] = useSearchParams();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [currency, setCurrency] = useCurrencyState();
  const [page, setPage] = useState(1);
  const [year, setYear] = useState<string>();
  const [categoryId, setCategoryId] = useState<string>();
  const hidden = useUI((s) => s.hidden);
  const basketId = params.get('basketId');
  const q = useQuery({
    queryKey: [
      'stage-g-analysis',
      living,
      basketId,
      date,
      currency,
      page,
      year,
      categoryId,
    ],
    enabled: !!date && (!living || !!basketId),
    queryFn: () =>
      apiClient
        .get<ApiResponse<AnalysisData>>(
          living ? '/living-cost/index' : '/reports/on-this-day',
          {
            params: living
              ? { basketId, date }
              : { date, currency, page, pageSize: 20, year, categoryId },
          },
        )
        .then((r) => r.data.data),
  });
  const title = living ? '个人真实生活成本指数' : '历史上的今日消费';
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{title}</PageTitle>
        </div>
      </div>
      <Space wrap className="mb16">
        <DateInput
          aria-label={tr("回顾日期")}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
            setYear(undefined);
          }}
        />
        {!living && (
          <Select
            value={currency}
            onChange={(value) => {
              setCurrency(value);
              setPage(1);
            }}
            options={CURRENCY_CODES.map((value) => ({
              value,
              label: value,
            }))}
          />
        )}
        {!living && (
          <Select
            aria-label={tr("历史年份")}
            allowClear
            placeholder={tr("全部历史年份")}
            value={year}
            onChange={(value) => {
              setYear(value);
              setPage(1);
            }}
            options={Array.from(
              { length: Math.max(0, dayjs(date).year() - 1900) },
              (_, i) => String(dayjs(date).year() - 1 - i),
            ).map((value) => ({ value, label: value + '年' }))}
            style={{ width: 150 }}
          />
        )}
        {living && <Link to="/analytics/living-cost">{tr("选择/管理篮子")}</Link>}
        {!living && (
          <>
            <CategorySelector
              kind="Expense"
              value={categoryId}
              onChange={(value) => {
                setCategoryId(value);
                setPage(1);
              }}
            />
            <Button
              onClick={() => {
                const today = dayjs();
                setDate(
                  today
                    .startOf('year')
                    .add(
                      Math.floor(
                        Math.random() *
                          (today.diff(today.startOf('year'), 'day') + 1),
                      ),
                      'day',
                    )
                    .format('YYYY-MM-DD'),
                );
                setYear(undefined);
                setPage(1);
              }}
            >
              {tr("随机回顾")}</Button>
          </>
        )}
      </Space>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : hidden ? (
        <Alert message={tr("隐私模式已隐藏金额和消费内容")} />
      ) : (
        <>
          {living && q.data && (
            <Card className="mb16">
              <Descriptions
                column={{ xs: 1, sm: 2 }}
                items={[
                  'baseCost',
                  'currentCost',
                  'change',
                  'index',
                  'coverage',
                  'monthOverMonthPercent',
                  'yearOverYearPercent',
                  'strategy',
                  'formula',
                ].map((key) => ({
                  key,
                  label: (
                    {
                      baseCost: '基准成本',
                      currentCost: '当前成本',
                      change: '变化额',
                      index: '完整篮子指数',
                      coverage: '覆盖率%',
                      monthOverMonthPercent: '固定篮子月度变化%',
                      yearOverYearPercent: '固定篮子年度变化%',
                      strategy: '样本匹配规则',
                      formula: '指数公式',
                    } as Record<string, string>
                  )[key],
                  children: String(q.data?.[key] ?? '缺少可比样本，暂不可计算'),
                }))}
              />
              {q.data.complete === false && (
                <Alert
                  type="warning"
                  message={tr("覆盖不足：显示的成本仅为已覆盖条目小计，不能视为完整篮子成本。")}
                />
              )}
            </Card>
          )}
          {!living &&
            q.data?.summaries?.map((s) => (
              <Card
                key={`${s.year}-${s.currency}`}
                title={tr("{0}年 · {1}", s.year, s.currency)}
                className="mb16"
              >
                <Space wrap>
                  {tr("收入")}<Money value={s.income} currency={s.currency} /> {tr("支出")}{' '}
                  <Money value={s.expense} currency={s.currency} /> {tr("记录")}{' '}
                  {s.count} {tr("条")}{s.maximumExpense && (
                    <>
                      {tr("最大单笔")}{' '}
                      <Money value={s.maximumExpense} currency={s.currency} />
                    </>
                  )}
                </Space>
                {!!s.categories?.length && (
                  <p>
                    {tr("主要分类：")}{s.categories.slice(0, 3).map((category) => (
                      <Space
                        key={category.categoryId}
                        style={{ marginRight: 12 }}
                      >
                        {category.name}
                        <Money value={category.amount} currency={s.currency} />
                      </Space>
                    ))}
                  </p>
                )}
              </Card>
            ))}
          <Card>
            <Table
              rowKey={(r) =>
                living
                  ? [r.product, r.brand, r.specification, r.unit]
                      .map(String)
                      .join('|')
                  : String(r.id)
              }
              loading={q.isPending}
              dataSource={q.data?.items || []}
              scroll={{ x: 750 }}
              pagination={
                living
                  ? false
                  : {
                      pageSize: 20,
                      current: page,
                      total: Number(q.data?.total || 0),
                      onChange: setPage,
                      showSizeChanger: false,
                    }
              }
              columns={
                living
                  ? [
                      {
                        title: tr("商品/规格"),
                        render: (_, r) =>
                          `${r.product} · ${r.brand || '未注明品牌'} · ${r.specification}`,
                      },
                      {
                        title: tr("固定数量"),
                        render: (_, r) => `${r.quantity} ${r.unit}`,
                      },
                      { title: tr("基准成本"), dataIndex: 'baseCost' },
                      { title: tr("当前成本"), dataIndex: 'currentCost' },
                      { title: tr("当前样本日期"), dataIndex: 'currentSampleDate' },
                      { title: tr("样本距目标日"), dataIndex: 'currentAgeDays' },
                      { title: tr("价格来源"), dataIndex: 'currentSource' },
                      {
                        title: tr("原消费与优惠详情"),
                        render: (_, r) =>
                          typeof r.currentSourceTransactionId === 'string' ? (
                            <Link
                              to={`/transactions/${r.currentSourceTransactionId}`}
                            >
                              {tr("查看原交易")}</Link>
                          ) : (
                            '独立价格样本'
                          ),
                      },
                      { title: tr("缺口"), dataIndex: 'missing' },
                    ]
                  : [
                      {
                        title: tr("日期"),
                        render: (_, r) =>
                          dayjs(String(r.occurredAt)).format('YYYY-MM-DD'),
                      },
                      { title: tr("资金活动类型"), dataIndex: 'type' },
                      {
                        title: tr("商户"),
                        dataIndex: 'merchant',
                        render: (value: unknown) => (
                          <Sensitive>
                            {value == null ? '—' : String(value)}
                          </Sensitive>
                        ),
                      },
                      {
                        title: tr("原币金额"),
                        render: (_, r) => (
                          <Money
                            value={String(r.amount)}
                            currency={r.currency as Currency}
                          />
                        ),
                      },
                      {
                        title: tr("原记录"),
                        render: (_, r) => (
                          <Link to={`/transactions/${r.id}`}>{tr("查看交易")}</Link>
                        ),
                      },
                    ]
              }
            />
          </Card>
          {!living && (
            <Alert
              className="mt20"
              message={String(q.data?.coverage ?? '暂无记录')}
            />
          )}
        </>
      )}
    </>
  );
}
type CurrencyRow = {
  code: Currency;
  name: string;
  internationalName: string;
  symbol: string;
  enabled: boolean;
  sortOrder: number;
  decimalPlaces: number;
  historicalUse: boolean;
  version: string;
};
export function CurrenciesPage() {
  useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow>();
  const [form] = Form.useForm();
  const q = useQuery({
    queryKey: ['currency-catalog'],
    queryFn: () =>
      apiClient
        .get<ApiResponse<CurrencyRow[]>>('/currencies')
        .then((r) => r.data.data),
  });
  async function toggle(row: CurrencyRow) {
    setBusy(true);
    try {
      await investmentApi.save(
        `/currencies/${row.code}`,
        { name: row.name, enabled: !row.enabled, sortOrder: row.sortOrder },
        row.version,
        'put',
      );
      await q.refetch();
    } catch (e) {
      message.error((e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePreference() {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      setBusy(true);
      await investmentApi.save(
        `/currencies/${editing.code}`,
        { ...values, enabled: editing.enabled },
        editing.version,
        'put',
      );
      setEditing(undefined);
      await q.refetch();
      message.success(tr("货币显示设置已保存"));
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("货币与汇率")}</PageTitle>
        </div>
      </div>
      <Space className="mb16">
        <Link to="/assets/allocation">{tr("管理历史估值汇率和多币种资产")}</Link>
        <Link to="/settings/payment-instruments">{tr("付款授权")}</Link>
      </Space>
      <CurrencySettingsPanel enabledCodes={q.data?.filter(row=>row.enabled).map(row=>row.code)} />
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card>
          <Table<CurrencyRow>
            scroll={{ x: 'max-content' }}
            rowKey="code"
            loading={q.isPending}
            pagination={false}
            dataSource={q.data}
            columns={[
              { title: tr("代码"), dataIndex: 'code' },
              {
                title: tr("名称"),
                dataIndex: 'name',
                render: (value: unknown) => (
                  <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                ),
              },
              { title: tr("符号"), dataIndex: 'symbol' },
              { title: tr("精度"), dataIndex: 'decimalPlaces' },
              { title: tr("排序"), dataIndex: 'sortOrder' },
              {
                title: tr("显示设置"),
                render: (_, row) => (
                  <Button
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue(row);
                    }}
                  >
                    {tr("编辑名称与排序")}</Button>
                ),
              },
              {
                title: tr("历史使用"),
                render: (_, r) =>
                  r.historicalUse ? '已使用（永久保留）' : '未使用',
              },
              {
                title: tr("状态"),
                render: (_, r) => (
                  <Button disabled={busy} onClick={() => toggle(r)}>
                    {r.enabled ? tr("停用新账户选择") : tr("启用")}
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
      <Drawer
        title={tr("货币显示设置")}
        open={!!editing}
        onClose={() => setEditing(undefined)}
        width="min(460px, 100vw)"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={tr("显示名称")}
            rules={[{ required: true, max: 100 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label={tr("显示顺序")}
            rules={[{ required: true }]}
          >
            <InputNumber precision={0} min={0} max={1000} />
          </Form.Item>
          <Button type="primary" loading={busy} onClick={savePreference}>
            {tr("保存显示设置")}</Button>
        </Form>
      </Drawer>
    </>
  );
}
