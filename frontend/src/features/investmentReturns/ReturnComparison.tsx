import { useState } from 'react';
import { Button, Card, Empty, Space, Table, Pagination } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Select } from '../../components/TouchSelect';
import { apiClient } from '../../api/client';
import type { ApiResponse, Currency } from '../../types';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { returnStatus } from './AssetReturnPanel';
import type { AssetReturn } from './AssetReturnPanel';
import { investmentDisplayAmount } from './displayAmount';

type Row = Pick<AssetReturn, 'id' | 'name' | 'xirr' | 'amounts'> & {type:string;originalCurrency:string;project?:{status:string;projectId:string|null;projectName:string|null}};
export function ReturnComparison({ assets, start, end, currency }: { assets: { id: string; name: string }[]; start: string; end: string; currency: Currency }) {
  const english = useLocale() === 'en'; const text = (zh: string, en: string) => english ? en : zh;
  const hidden = useUI(s => s.hidden);
  const projectLabel=(row:Row)=>row.project?.projectName??(row.project?.status==='ProjectUnavailable'?text('项目已移除或不可用','Project removed or unavailable'):text('未分配','Unassigned'));
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [page,setPage]=useState(1);
  const catalog=useQuery({queryKey:['investment-performance','comparison-catalog',page],queryFn:({signal})=>apiClient.get<ApiResponse<{items:{id:string;name:string;currency:string}[];total:number}>>('/investments/assets',{params:{page,pageSize:20},signal}).then(r=>r.data.data)});
  const q = useQuery({ queryKey: ['investment-performance', 'compare', submitted, start, end, currency],
    queryFn: ({ signal }) => apiClient.post<ApiResponse<{ items: Row[] }>>('/investments/returns/compare', { assetIds: submitted, start, end, currency }, { signal }).then(r => r.data.data),
    enabled: submitted.length > 0 && !!start && !!end && start <= end,
  });
  return <Card role="region" aria-label={text('投资资产对比', 'Investment asset comparison')} title={text('投资资产对比', 'Investment asset comparison')}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <span>{start} — {end} · {currency}</span>
      <Select mode="multiple" maxCount={20} aria-label={text('选择对比资产', 'Select comparison assets')} value={selected} style={{ width: '100%' }} options={(catalog.data?.items??assets).map(x => ({ value: x.id, label: hidden ? '••••' : `${x.name}${'currency' in x?' · '+x.currency:''}` }))} onChange={value => { setSelected(value); setSubmitted([]); }} />
      {catalog.data&&<Pagination size="small" current={page} pageSize={20} total={catalog.data.total} showSizeChanger={false} onChange={setPage}/>}
      {catalog.isError&&<ErrorState error={catalog.error} retry={()=>catalog.refetch()}/>}
      <Button disabled={selected.length === 0 || start > end} loading={q.isFetching} onClick={() => setSubmitted([...selected])}>{text('对比收益', 'Compare returns')}</Button>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {!submitted.length && <Empty description={text('选择资产后开始对比', 'Select assets to compare')} />}
      {q.data && submitted.length > 0 && <Table<Row> rowKey="id" dataSource={q.data.items} pagination={{ pageSize: 10 }} scroll={{ x: 600 }} columns={[
        { title: text('资产', 'Asset'), dataIndex: 'name', render: (value: string) => hidden ? '••••' : value },
        {title:text('类别','Category'),dataIndex:'type',sorter:(a,b)=>a.type.localeCompare(b.type)},
        {title:text('原币','Original currency'),dataIndex:'originalCurrency',sorter:(a,b)=>a.originalCurrency.localeCompare(b.originalCurrency)},
        {title:text('期末项目分类','Project at period end'),render:(_,row)=>hidden?'••••':projectLabel(row),filters:[...new Map((q.data?.items??[]).map(row=>[row.project?.projectId??'__unassigned',projectLabel(row)])).entries()].map(([value,label])=>({value,text:hidden?'••••':label})),onFilter:(value,row)=>(row.project?.projectId??'__unassigned')===value},
        { title: text('年化 XIRR', 'Annualized XIRR'), render: (_, row) => hidden ? '••••' : row.xirr.status === 'Success' && row.xirr.rate !== null ? `${(row.xirr.rate * 100).toFixed(2)}%` : '—' },
        { title: text('总收益（报告币种）', 'Total profit (report currency)'), render: (_, row) => row.amounts?.reportTotalProfit == null ? '—' : <Money value={investmentDisplayAmount(row.amounts.reportTotalProfit)} currency={currency} /> },
        { title: text('数据状态', 'Data status'), render: (_, row) => row.xirr.status === 'Success' ? text('可计算', 'Available') : returnStatus(row.xirr.status, english) },
      ]} />}
    </Space>
  </Card>;
}
