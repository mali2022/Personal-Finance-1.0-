import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { accountApi } from '../../api/finance';
import { apiClient } from '../../api/client';
import { investmentApi } from '../../api/investments';
import type { ApiResponse, Currency } from '../../types';
import { Select } from '../../components/TouchSelect';
import { DateInput } from '../../components/ResponsiveDatePicker';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { returnStatus } from './AssetReturnPanel';
import { investmentDisplayAmount } from './displayAmount';
interface BoundaryResult { xirr: { status: string; rate: number | null }; totalProfit: string | null; cashFlows: { date: string; amount: string; type: string; sourceId: string }[]; valuations: unknown[] }
export function BoundaryReturnPanel({ start, end, currency }: { start: string; end: string; currency: Currency }) {
  const english = useLocale() === 'en'; const t = (zh: string, en: string) => english ? en : zh;
  const hidden = useUI(s => s.hidden);
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: accountApi.list });
  const [selected, setSelected] = useState<string[]>([]); const [submitted, setSubmitted] = useState<string[]>([]);
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<unknown>();
  const [form] = Form.useForm();
  const q = useQuery({ queryKey: ['investment-performance','boundary', submitted, start, end, currency], enabled: submitted.length > 0 && start <= end,
    queryFn: ({ signal }) => apiClient.post<ApiResponse<BoundaryResult>>('/investments/returns/boundary', { accountIds: submitted, start, end, currency }, { signal }).then(r => r.data.data), staleTime: 0 });
  return <Card role="region" aria-label={t('投资账户与组合收益', 'Account and portfolio returns')} title={t('投资账户与组合收益', 'Account and portfolio returns')}>
    <Space direction="vertical" style={{width:'100%'}}>
      <span>{start} — {end} · {currency}</span>
      <Select mode="multiple" maxCount={20} aria-label={t('收益计算账户', 'Return calculation accounts')} value={selected} style={{width:'100%'}} options={(accounts.data ?? []).filter(a => a.type === 'Investment').map(a => ({value:a.id,label:hidden?'••••':`${a.name} · ${a.currency}`}))} onChange={ids => {setSelected(ids);setSubmitted([]);}} />
      <Space wrap><Button disabled={!selected.length} loading={q.isFetching} onClick={() => setSubmitted([...selected])}>{t('计算账户或组合 XIRR', 'Calculate account or portfolio XIRR')}</Button><Button disabled={hidden} onClick={() => {setError(undefined);setOpen(true);}}>{t('登记完整账户估值', 'Record full account value')}</Button></Space>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data && submitted.length > 0 && <>
        {q.data.xirr.status === 'Success' && q.data.xirr.rate !== null ? <strong>{hidden?'••••':`${(q.data.xirr.rate*100).toFixed(2)}%`} · {t('年化 XIRR', 'Annualized XIRR')}</strong> : <Alert type="warning" message={returnStatus(q.data.xirr.status,english)} />}
        {q.data.totalProfit !== null && <span>{t('期间总收益', 'Period total profit')}：<Money value={investmentDisplayAmount(q.data.totalProfit)} currency={currency}/></span>}
        <Table size="small" rowKey={r=>`${r.type}:${r.sourceId}`} dataSource={q.data.cashFlows} pagination={{pageSize:10}} scroll={{x:550}} columns={[{title:t('日期','Date'),dataIndex:'date'},{title:t('类型','Type'),dataIndex:'type'},{title:t('金额','Amount'),dataIndex:'amount',render:(value:string)=><Money value={investmentDisplayAmount(value)} currency={currency}/>}]} />
        <Button disabled={hidden} onClick={() => {const blob=new Blob([JSON.stringify(q.data,null,2)],{type:'application/json'});import('../../utils/download').then(({saveBlob})=>saveBlob(blob,`boundary-return-${start}-${end}.json`));}}>{t('导出账户计算依据','Export boundary calculation evidence')}</Button>
      </>}
    </Space>
    <Modal open={open} title={t('登记完整账户估值','Record full account value')} onCancel={()=>setOpen(false)} onOk={async()=>{
      const values=await form.validateFields();setSaving(true);setError(undefined);
      try{await investmentApi.save('/investments/boundary-values',values);setOpen(false);form.resetFields();if(submitted.length)await q.refetch();}catch(e){setError(e);}finally{setSaving(false);}
    }} confirmLoading={saving}>
      <Form form={form} layout="vertical"><Form.Item name="accountId" label={t('投资账户','Investment account')} rules={[{required:true}]}><Select options={(accounts.data??[]).filter(a=>a.type==='Investment').map(a=>({value:a.id,label:`${a.name} · ${a.currency}`}))}/></Form.Item>
        <Form.Item name="date" label={t('估值日期','Valuation date')} rules={[{required:true}]}><DateInput type="date"/></Form.Item>
        <Form.Item name="value" label={t('账户原币完整价值','Full account value in original currency')} rules={[{required:true}]}><Input inputMode="decimal"/></Form.Item>
        <Form.Item name="source" label={t('核对依据','Verification source')} rules={[{required:true}]}><Input maxLength={200}/></Form.Item>
        <Form.Item name="includesCashAndHoldings" valuePropName="checked" rules={[{validator:(_,v)=>v?Promise.resolve():Promise.reject(new Error(t('请确认完整性','Confirm completeness')))}]}><Checkbox>{t('已核对现金及全部持仓，未重复计值','I verified cash and all holdings without double counting')}</Checkbox></Form.Item>
      </Form>{error!=null&&<ErrorState error={error}/>}
    </Modal>
  </Card>;
}
