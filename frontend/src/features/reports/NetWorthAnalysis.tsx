import { t as tr, useLocale } from '../../i18n';
import { Alert, Card, Table, Skeleton } from 'antd';
import { lazy, Suspense } from 'react';
import { useUI } from '../../stores/ui';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import type { ApiResponse, Currency } from '../../types';
import type { Allocation } from '../../api/assetManagement';
interface WorthAnalysis {
  consolidatedValuation?: Allocation;
  valuationChange?: {
    complete: boolean;
    uncovered: number;
    changeCovered: string;
    accountLedgerChangeCovered: string;
    nonCashAssetValueChangeCovered: string;
    positionQuantityChangeCovered: string;
    fxTranslationEffectCovered: string;
    otherAdjustmentCovered: string;
    scope: string;
  };
  currentNetWorth: string;
  openingNetWorth: string;
  netWorth: string;
  assets: string;
  liabilities: string;
  change: string;
  accounts: {
    id: string;
    name: string;
    type: string;
    balance: string;
    asset: string;
    liability: string;
  }[];
  attribution: { source: string; amount: string; explanation: string }[];
  unexplainedDifference: string;
  explanation: string;
  points: { period: string; netWorth: string }[];
}
const Chart = lazy(() => import('../../components/Chart'));
export function NetWorthAnalysis({
  start,
  end,
  currency,
}: {
  start: string;
  end: string;
  currency: Currency;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const params = { start, end, currency };
  const q = useQuery({
    queryKey: ['net-worth-attribution', params],
    queryFn: () =>
      apiClient
        .get<ApiResponse<WorthAnalysis>>('/reports/net-worth-attribution', {
          params,
        })
        .then((r) => r.data.data),
  });
  return (
    <Card title={tr("资产负债与账本变动归因")} className="mb16" loading={q.isPending}>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data && (
        <>
          {q.data.consolidatedValuation && (
            <Card title={tr("综合资产估值 · {0}", q.data.consolidatedValuation.date)}>
              <Alert
                type={
                  q.data.consolidatedValuation.complete ? 'info' : 'warning'
                }
                message={
                  q.data.consolidatedValuation.complete
                    ? tr("全部登记资产已覆盖")
                    : tr("仅汇总已覆盖部分，{0}项缺口", q.data.consolidatedValuation.uncovered)
                }
                description={q.data.consolidatedValuation.scope}
              />
              {q.data.consolidatedValuation.groups.map((g) => (
                <p key={g.currency}>
                  {tr("已覆盖资产")}<Money value={g.assets} currency={g.currency} />
                  {tr("，负债")}<Money value={g.liabilities} currency={g.currency} />
                  {tr("，净资产")}<Money value={g.netWorth} currency={g.currency} />
                </p>
              ))}
            </Card>
          )}
          {q.data.valuationChange && (
            <Card title={tr("综合估值变动归因（已覆盖部分）")}>
              <Alert
                type={q.data.valuationChange.complete ? 'info' : 'warning'}
                message={tr("估值或汇率缺口：{0} 项", q.data.valuationChange.uncovered)}
                description={q.data.valuationChange.scope}
              />
              <Table
                pagination={false}
                rowKey="label"
                dataSource={[
                  {
                    label: tr("账户账本原币变化"),
                    value: q.data.valuationChange.accountLedgerChangeCovered,
                  },
                  {
                    label: tr("证券价格及实物估值变化"),
                    value:
                      q.data.valuationChange.nonCashAssetValueChangeCovered,
                  },
                  {
                    label: tr("证券持仓数量变化"),
                    value: q.data.valuationChange.positionQuantityChangeCovered,
                  },
                  {
                    label: tr("汇率折算变化"),
                    value: q.data.valuationChange.fxTranslationEffectCovered,
                  },
                  {
                    label: tr("其他归属调整"),
                    value: q.data.valuationChange.otherAdjustmentCovered,
                  },
                  {
                    label: tr("合计变动"),
                    value: q.data.valuationChange.changeCovered,
                  },
                ]}
                columns={[
                  { title: tr("来源"), dataIndex: 'label' },
                  {
                    title: tr("金额"),
                    render: (_, r) => (
                      <Money value={r.value} currency={currency} />
                    ),
                  },
                ]}
              />
            </Card>
          )}
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={q.data.explanation}
            className="mb16"
          />
          {hidden ? (
            <div className="chart-hidden">{tr("资产负债、趋势与归因图金额已隐藏")}</div>
          ) : (
            <Suspense fallback={<Skeleton active />}>
              <Chart
                option={{
                  title: { text: tr("推算资产构成") },
                  tooltip: { trigger: 'item' },
                  series: [
                    {
                      type: 'pie',
                      radius: ['30%', '60%'],
                      data: q.data.accounts
                        .filter((x) => Number(x.asset) > 0)
                        .map((x) => ({ name: x.name, value: Number(x.asset) })),
                    },
                  ],
                }}
              />
              <Chart
                option={{
                  title: { text: tr("推算负债构成") },
                  tooltip: { trigger: 'item' },
                  series: [
                    {
                      type: 'pie',
                      radius: ['30%', '60%'],
                      data: q.data.accounts
                        .filter((x) => Number(x.liability) > 0)
                        .map((x) => ({
                          name: x.name,
                          value: Number(x.liability),
                        })),
                    },
                  ],
                }}
              />
              <Chart
                option={{
                  title: { text: tr("推算净资产趋势") },
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data: q.data.points.map((x) => x.period),
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      type: 'line',
                      data: q.data.points.map((x) => Number(x.netWorth)),
                    },
                  ],
                }}
              />
              <Chart
                option={{
                  title: { text: tr("账本净资产变动归因") },
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data: q.data.attribution.map((x) => x.source),
                    axisLabel: { rotate: 35 },
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      type: 'bar',
                      data: q.data.attribution.map((x) => Number(x.amount)),
                    },
                  ],
                }}
              />
            </Suspense>
          )}
          <Table
            rowKey="period"
            dataSource={q.data.points}
            columns={[
              { title: tr("历史月份（推算）"), dataIndex: 'period' },
              {
                title: tr("净资产"),
                dataIndex: 'netWorth',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
            ]}
          />
          <Table
            rowKey="name"
            pagination={false}
            dataSource={[
              { name: '当前净资产', value: q.data.currentNetWorth },
              { name: '推算期初净资产', value: q.data.openingNetWorth },
              { name: '推算期末资产', value: q.data.assets },
              { name: '推算期末负债', value: q.data.liabilities },
              { name: '推算期末净资产', value: q.data.netWorth },
              { name: '推算净资产变化', value: q.data.change },
              { name: '未解释差额', value: q.data.unexplainedDifference },
            ]}
            columns={[
              { title: tr("指标"), dataIndex: 'name' },
              {
                title: currency,
                dataIndex: 'value',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
            ]}
          />
          <Table
            rowKey="id"
            scroll={{ x: 650 }}
            dataSource={q.data.accounts}
            columns={[
              { title: tr("账户"), dataIndex: 'name' },
              { title: tr("类型"), dataIndex: 'type' },
              {
                title: tr("推算余额"),
                dataIndex: 'balance',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
              {
                title: tr("资产"),
                dataIndex: 'asset',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
              {
                title: tr("负债"),
                dataIndex: 'liability',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
            ]}
          />
          <Table
            rowKey="source"
            dataSource={q.data.attribution}
            columns={[
              { title: tr("账本业务类型"), dataIndex: 'source' },
              {
                title: tr("净资产变动"),
                dataIndex: 'amount',
                render: (v: string) => <Money value={v} currency={currency} />,
              },
              { title: tr("口径"), dataIndex: 'explanation' },
            ]}
          />
        </>
      )}
    </Card>
  );
}
