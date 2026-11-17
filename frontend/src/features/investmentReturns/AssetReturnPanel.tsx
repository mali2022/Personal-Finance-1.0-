import { useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Space, Statistic, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ApiResponse, Currency } from '../../types';
import { ErrorState } from '../../components/Feedback';
import { Money as BaseMoney } from '../../components/Money';
import { investmentDisplayAmount } from './displayAmount';
import { useUI } from '../../stores/ui';
import { useLocale } from '../../i18n';
import { ReturnCashFlowChart } from './ReturnCashFlowChart';
import { saveBlob } from '../../utils/download';
import { ReturnTrend } from './ReturnTrend';
import Chart from '../../components/Chart';
import { InvestmentProjectPanel } from './InvestmentProjectPanel';
function Money({ value, currency }: { value: string; currency?: Currency }) {
  return <BaseMoney value={investmentDisplayAmount(value)} currency={currency} />;
}

export interface AssetReturn {
  id: string; name: string; currency: Currency; start: string; end: string;
  xirr: { status: string; rate: number | null; method: string; roots: number[] };
  firstRecordedTradeDate?:string|null;simpleReturn?:string|null;
  amounts?: { status: string; reconciled: boolean; originalCurrency: Currency; totalProfit: string | null; reportTotalProfit: string | null; netRealized: string | null; unrealizedChange: string | null; netDividends: string | null; netInterest: string | null; includedFees: string | null;reportClosingValue?:string|null;netCashInvested?:string|null;exchangeAttribution?:{status:string;reconciled:boolean;baselineDate:string;baselineRate:string|null;baselineSource:string|null;localProfitAtClosingRate:string|null;cashFlowFxTimingImpact:string|null;reportProfit:string|null} };
  cashFlows: { date: string; amount: string | null; type: string; sourceId: string; originalAmount?: string; originalCurrency?: Currency; rate?: string | null; rateDate?: string; rateSource?: string }[];
}
export function returnStatus(status: string, english: boolean): string {
  const messages: Record<string, [string, string]> = {
    ExchangeRateMissing: ['缺少现金流日期的直接历史汇率', 'Exact-date direct historical exchange rate is missing'],
    UnclassifiedCashFlow: ['存在无法分类的账户资金变动，请核对', 'Unclassified account movements require review'],
    UnconfirmedCashFlow: ['存在尚未确认的资金变动', 'Unconfirmed account movements exist'],
    ResourceLimit: ['计算超过资源预算，请缩小范围', 'Calculation exceeded its resource budget; reduce the scope'],
    ValuationMissing: ['缺少期初前一日或期末估值', 'Opening or closing valuation is missing'],
    TransferValuationMissing: ['持仓调拨缺少边界估值，无法计算', 'Position transfers require boundary valuations'],
    InsufficientData: ['现金流数据不足', 'Insufficient cash flows'],
    NoSignChange: ['现金流须同时包含投入与回收', 'Both contributions and proceeds are required'],
    MultipleRoots: ['存在多个收益率解，结果不唯一', 'Multiple valid rates; result is not unique'],
    AmbiguousCashFlow: ['复杂现金流无法确认唯一解', 'Uniqueness cannot be established'],
    NoRootInSearchRange: ['搜索范围内未找到有效解', 'No valid root within the search range'],
    NonConvergent: ['计算未收敛', 'Calculation did not converge'],
    InvalidCashFlow: ['现金流日期或金额不满足计算条件', 'Invalid cash-flow dates or amounts'],
  };
  return messages[status]?.[english ? 1 : 0] ?? (english ? 'Return unavailable' : '收益率不可用');
}
export function AssetReturnPanel({ assetId, start, end, currency }: { assetId: string; start: string; end: string; currency: Currency }) {
  const english = useLocale() === 'en';
  const text = (zh: string, en: string) => english ? en : zh;
  const hidden = useUI(s => s.hidden);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['investment-performance', 'asset-return', assetId, start, end, currency],
    queryFn: ({ signal }) => apiClient.get<ApiResponse<AssetReturn>>(`/investments/assets/${encodeURIComponent(assetId)}/returns`, { params: { start, end, currency }, signal }).then(r => r.data.data),
    enabled: !!assetId && !!start && !!end && start <= end,
    staleTime: 0,
  });
  const data = q.data;
  return <Card title={text('单项投资 XIRR（年化）', 'Asset XIRR (annualized)')} loading={q.isLoading}>
    {!assetId && <Empty description={text('请选择资产查看收益率', 'Select an asset to view its return')} />}
    {start > end && <Alert type="warning" message={text('开始日期不得晚于结束日期', 'Start date must not follow end date')} />}
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    {data && <Space direction="vertical" style={{ width: '100%' }}>
      {data.xirr.status === 'Success' && data.xirr.rate !== null ? <Statistic title={hidden ? '••••' : data.name} value={hidden ? '••••' : `${(data.xirr.rate * 100).toFixed(2)}%`} suffix={hidden ? '' : data.xirr.rate < 0 ? text('亏损', 'Loss') : text('收益', 'Return')} /> : <Alert type="warning" message={returnStatus(data.xirr.status, english)} />}
      <span>{data.start} — {data.end} · {data.currency}</span>
      <InvestmentProjectPanel assetId={assetId} date={end}/>
      {data.firstRecordedTradeDate&&<span>{text('首笔已登记交易','First recorded trade')}：{data.firstRecordedTradeDate}</span>}
      {data.simpleReturn!=null&&<span>{text('简单累计收益率（收益÷总现金支出，含期初价值及费用，不年化）','Simple cumulative return (profit / gross cash outlays including opening value and fees; not annualized)')}：{hidden?'••••':`${(Number(data.simpleReturn)*100).toFixed(2)}%`}</span>}
      {data.amounts && <Card size="small" title={text('期间收益金额与归因', 'Period profit and attribution')}>
        {data.amounts.status === 'Success' && data.amounts.reconciled ? <Space direction="vertical">
          {data.amounts.reportClosingValue!=null&&<span>{text('期末持仓价值','Closing holdings value')}：<Money value={data.amounts.reportClosingValue} currency={data.currency}/></span>}
          {data.amounts.netCashInvested!=null&&<span>{text('净现金投入（含期初价值）','Net cash invested (including opening value)')}：<Money value={data.amounts.netCashInvested} currency={data.currency}/></span>}
          <span>{text('总收益（报告币种）', 'Total profit (report currency)')}：{data.amounts.reportTotalProfit == null ? text('缺少汇率', 'Missing exchange rate') : <Money value={data.amounts.reportTotalProfit} currency={data.currency} />}</span>
          {([
            ['totalProfit', text('总收益（原币）', 'Total profit (original currency)')],
            ['netRealized', text('净已实现损益', 'Net realized profit')],
            ['unrealizedChange', text('未实现损益变化', 'Change in unrealized profit')],
            ['netDividends', text('净分红', 'Net dividends')],
            ['netInterest', text('净利息', 'Net interest')],
            ['includedFees', text('已包含费用（勿重复扣除）', 'Included fees (do not subtract again)')],
          ] as const).map(([key, label]) => <span key={key}>{label}：{data.amounts![key] == null ? '—' : <Money value={data.amounts![key]!} currency={data.amounts!.originalCurrency} />}</span>)}
          <span>{text('原币净归因与总收益一致。', 'Original-currency net components reconcile to total profit.')}</span>
          <Chart option={{aria:{enabled:true,label:{description:text('原币收益金额净归因图，费用已经包含，不重复扣除。','Original-currency net profit attribution. Fees are already included.')}},tooltip:{trigger:'axis'},xAxis:{type:'category',data:[text('净已实现','Net realized'),text('未实现变化','Unrealized change'),text('净分红','Net dividends'),text('净利息','Net interest')]},yAxis:{type:'value',name:data.amounts.originalCurrency},series:[{name:text('收益金额','Profit amount'),type:'bar',data:[data.amounts.netRealized,data.amounts.unrealizedChange,data.amounts.netDividends,data.amounts.netInterest].map(value=>value==null?null:Number(value))}]}}/>
        </Space> : <Alert type="warning" message={text('收益金额数据不足或归因未对平', 'Profit data is incomplete or attribution does not reconcile')} />}
      </Card>}
      {data.amounts?.exchangeAttribution&&<Card size="small" title={text('汇率金额归因：期末汇率基准','FX attribution: closing-rate baseline')}>
        {data.amounts.exchangeAttribution.status==='Success'&&data.amounts.exchangeAttribution.reconciled?<Space direction="vertical">
          <span>{text('原币收益按期末汇率折算','Local profit at closing FX')}：<Money value={data.amounts.exchangeAttribution.localProfitAtClosingRate!} currency={data.currency}/></span>
          <span>{text('现金流时点汇率影响','Cash-flow FX timing impact')}：<Money value={data.amounts.exchangeAttribution.cashFlowFxTimingImpact!} currency={data.currency}/></span>
          <span>{data.amounts.exchangeAttribution.baselineDate} · {hidden?'••••':data.amounts.exchangeAttribution.baselineRate} · {hidden?'••••':data.amounts.exchangeAttribution.baselineSource??text('同币种','Same currency')}</span>
        </Space>:<Alert type="warning" message={text('汇率归因缺少基准/历史报价或数据未对平','FX attribution requires baseline/historical quotes and reconciled data')} description={data.amounts.exchangeAttribution.status}/>}
      </Card>}
      <Button onClick={() => setOpen(true)}>{text('查看计算现金流', 'View calculation cash flows')}</Button>
      <Button disabled={hidden || q.isFetching} onClick={() => saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `investment-return-${data.start}-${data.end}.json`)}>{text('导出计算明细 JSON', 'Export calculation details JSON')}</Button>
      <Button disabled={hidden || q.isFetching} onClick={async()=>{
        const summary=`${data.start} — ${data.end} · ${data.currency}\nXIRR Actual/365: ${data.xirr.status==='Success'&&data.xirr.rate!==null?`${(data.xirr.rate*100).toFixed(2)}%`:returnStatus(data.xirr.status,english)}`;
        if(navigator.share){try{await navigator.share({title:text('投资收益摘要','Investment return summary'),text:summary});}catch{/* User cancellation does not change the report. */}}
        else saveBlob(new Blob([summary],{type:'text/plain;charset=utf-8'}),`investment-summary-${data.start}-${data.end}.txt`);
      }}>{text('分享收益摘要','Share return summary')}</Button>
      {data.cashFlows.length > 0 && <ReturnCashFlowChart data={data} />}
      <ReturnTrend key={`${assetId}:${start}:${end}:${currency}`} assetId={assetId} start={start} end={end} currency={currency}/>
    </Space>}
    <Drawer open={open} onClose={() => setOpen(false)} width="min(720px, 100vw)" title={text('收益率计算详情', 'Return calculation details')}>
      <p>{data?.xirr.method} · {data?.xirr.status} · {data?.cashFlows.length ?? 0} {text('笔', 'flows')}</p>
      <Table size="small" rowKey={r => `${r.type}:${r.sourceId}`} dataSource={data?.cashFlows} pagination={{ pageSize: 20 }} scroll={{ x: 550 }} columns={[
        { title: text('日期', 'Date'), dataIndex: 'date' },
        { title: text('类型', 'Type'), dataIndex: 'type' },
        { title: text('现金流', 'Cash flow'), dataIndex: 'amount', render: (value: string | null) => value == null ? '—' : <Money value={value} currency={currency} /> },
        { title: text('原币现金流', 'Original cash flow'), dataIndex: 'originalAmount', render: (value: string | undefined, row) => value ? <Money value={value} currency={row.originalCurrency} /> : '—' },
        { title: text('汇率 / 日期 / 来源', 'Rate / date / source'), dataIndex: 'rate', render: (value: string | null | undefined, row) => hidden ? '••••' : `${value ?? '—'} / ${row.rateDate ?? '—'} / ${row.rateSource ?? '—'}` },
        { title: text('来源 ID', 'Source ID'), dataIndex: 'sourceId', render: (value: string) => hidden ? '••••' : value },
      ]} />
    </Drawer>
  </Card>;
}
