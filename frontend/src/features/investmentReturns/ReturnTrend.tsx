import { useState } from 'react';
import { Button, Card, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import Chart from '../../components/Chart';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { apiClient } from '../../api/client';
import type { ApiResponse, Currency } from '../../types';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { investmentDisplayAmount } from './displayAmount';
import { returnStatus } from './AssetReturnPanel';
interface Point { date:string;closingValue:string|null;totalProfit:string|null;netCashInvested:string|null;xirr:{status:string;rate:number|null} }
export function ReturnTrend({assetId,start,end,currency}:{assetId:string;start:string;end:string;currency:Currency}) {
 const en=useLocale()==='en';const t=(zh:string,english:string)=>en?english:zh;const hidden=useUI(s=>s.hidden);const [enabled,setEnabled]=useState(false);
 const q=useQuery({queryKey:['investment-performance','trend',assetId,start,end,currency],enabled:enabled&&!!assetId&&start<=end,queryFn:({signal})=>apiClient.get<ApiResponse<{points:Point[]}>>(`/investments/assets/${encodeURIComponent(assetId)}/return-trend`,{params:{start,end,currency},signal}).then(r=>r.data.data)});
 const render=(value:string|null)=>value==null?'—':<Money value={investmentDisplayAmount(value)} currency={currency}/>;
 return <Card title={t('历史价值与收益趋势','Historical value and returns')}>
  <Button disabled={!assetId} loading={q.isFetching} onClick={()=>enabled?void q.refetch():setEnabled(true)}>{t('加载历史趋势','Load historical trend')}</Button>
  {q.isError&&<ErrorState error={q.error} retry={()=>q.refetch()}/>}
  {q.data&&<><Chart option={{tooltip:{trigger:'axis'},legend:{},xAxis:{type:'category',data:q.data.points.map(p=>p.date)},yAxis:{type:'value',name:currency},series:[['closingValue',t('持仓估值','Holdings value')],['netCashInvested',t('净现金投入','Net cash invested')],['totalProfit',t('累计收益','Cumulative profit')]].map(([key,name])=>({name,type:'line',connectNulls:false,data:q.data.points.map(p=>p[key as 'closingValue'|'netCashInvested'|'totalProfit']==null?null:Number(p[key as 'closingValue'|'netCashInvested'|'totalProfit']))}))}}/>
   <Table rowKey="date" size="small" dataSource={q.data.points} pagination={{pageSize:12}} scroll={{x:650}} columns={[{title:t('日期','Date'),dataIndex:'date'},{title:t('持仓估值','Holdings value'),dataIndex:'closingValue',render},{title:t('净现金投入','Net cash invested'),dataIndex:'netCashInvested',render},{title:t('累计收益','Cumulative profit'),dataIndex:'totalProfit',render},{title:'XIRR',render:(_,p)=>hidden?'••••':p.xirr.status==='Success'&&p.xirr.rate!==null?`${(p.xirr.rate*100).toFixed(2)}%`:returnStatus(p.xirr.status,en)}]}/></>}
 </Card>;
}
