import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssetReturnPanel } from '../features/investmentReturns/AssetReturnPanel';
import { PeriodicReturnPanel } from '../features/investmentReturns/PeriodicReturnPanel';
import { investmentDisplayAmount } from '../features/investmentReturns/displayAmount';
import { ReturnComparison } from '../features/investmentReturns/ReturnComparison';
import { BoundaryReturnPanel } from '../features/investmentReturns/BoundaryReturnPanel';
import { Alert, Button, Card, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import type { ApiResponse, Currency } from '../types';
interface Performance {
  scope: string;
  assets: {
    id: string;
    name: string;
    realizedInPeriod: string;
    incomeInPeriod: string;
    feesInPeriod: string;
    unrealized: string | null;
  }[];
  points: {
    month: string;
    realized: string;
    income: string;
    fees: string;
    investmentCashFlow: string;
    unrealizedCovered: string;
    missingValuations: number;
  }[];
}
export default function InvestmentPerformancePage() {
  const [parameters] = useSearchParams();
  const language = useLocale();
  const [start, setStart] = useState(
    dayjs().startOf('year').format('YYYY-MM-DD'),
  );
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'));
  const [currency, setCurrency] = useCurrencyState();
  const hidden = useUI((s) => s.hidden);
  const [assetId, setAssetId] = useState(() => parameters.get('assetId') ?? '');
  const initialCurrency=parameters.get('currency');
  useEffect(()=>{if(initialCurrency&&CURRENCY_CODES.includes(initialCurrency))setCurrency(initialCurrency);},[initialCurrency,setCurrency]);
  const [reportCurrency, setReportCurrency] = useState<Currency | 'Original'>('Original');
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['investment-performance', start, end, currency],
    queryFn: () =>
      apiClient
        .get<ApiResponse<Performance>>('/investments/performance', {
          params: { start, end, currency },
        })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  });
  const render = (v: string | null) =>
    v == null ? '暂无估值' : <Money value={investmentDisplayAmount(v)} currency={currency} />;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageTitle>{tr("投资收益分析")}</PageTitle>
      <Space wrap>
        <DateInput
          aria-label={tr("统计开始日期")}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <DateInput
          aria-label={tr("统计结束日期")}
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Select
          value={currency}
          onChange={setCurrency}
          options={(CURRENCY_CODES as Currency[]).map((value) => ({
            value,
          }))}
        />
        <Button onClick={() => void queryClient.invalidateQueries({ queryKey: ['investment-performance'] })}>{tr("刷新")}</Button>
      </Space>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      <PeriodicReturnPanel />
      <BoundaryReturnPanel key={`boundary:${start}:${end}:${currency}`} start={start} end={end} currency={currency} />
      <Select
        aria-label={tr('资产')}
        placeholder={tr('资产')}
        value={q.data?.assets.some(a => a.id === assetId) ? assetId : undefined}
        onChange={setAssetId}
        options={(q.data?.assets ?? []).map(a => ({ value: a.id, label: hidden ? '••••' : a.name }))}
      />
      <Select
        aria-label={language === 'en' ? 'XIRR report currency' : 'XIRR 报告币种'}
        value={reportCurrency}
        onChange={setReportCurrency}
        options={[
          { value: 'Original', label: language === 'en' ? 'Original currency' : '资产原币' },
          ...CURRENCY_CODES.map(value => ({ value, label: value })),
        ]}
      />
      <AssetReturnPanel assetId={q.data?.assets.some(a => a.id === assetId) ? assetId : ''} start={start} end={end} currency={reportCurrency === 'Original' ? currency : reportCurrency} />
      <ReturnComparison key={`${start}:${end}:${currency}`} assets={q.data?.assets ?? []} start={start} end={end} currency={reportCurrency === 'Original' ? currency : reportCurrency} />
      {q.data && (
        <>
          <Alert type="info" message={q.data.scope} />
          <Card title={tr("各资产收益")}>
            <Table
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={q.data.assets}
              pagination={{ pageSize: 20 }}
              columns={[
                {
                  title: tr("资产"),
                  dataIndex: 'name',
                  render: (v: string) => (hidden ? '••••' : v),
                },
                { title: tr("期间已实现"), dataIndex: 'realizedInPeriod', render },
                { title: tr("期间分红利息"), dataIndex: 'incomeInPeriod', render },
                { title: tr("期间费用"), dataIndex: 'feesInPeriod', render },
                { title: tr("期末未实现"), dataIndex: 'unrealized', render },
              ]}
            />
          </Card>
          <Card title={tr("月度投资现金流与收益趋势")}>
            <Table
              rowKey="month"
              dataSource={q.data.points}
              scroll={{ x: 800 }}
              pagination={{ pageSize: 12 }}
              columns={[
                { title: tr("月份"), dataIndex: 'month' },
                {
                  title: tr("投资现金流（含本金）"),
                  dataIndex: 'investmentCashFlow',
                  render,
                },
                { title: tr("已实现价差"), dataIndex: 'realized', render },
                { title: tr("分红利息"), dataIndex: 'income', render },
                { title: tr("费用"), dataIndex: 'fees', render },
                {
                  title: tr("月末未实现（已覆盖）"),
                  dataIndex: 'unrealizedCovered',
                  render,
                },
                {
                  title: tr("缺估值持仓数"),
                  dataIndex: 'missingValuations',
                  render: (v) => (hidden ? '••••' : v),
                },
              ]}
            />
          </Card>
        </>
      )}
    </Space>
  );
}
