import { useState } from 'react';
import { Alert, Button, Input, Select, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { concertApi } from './api';
import type { TransferPayment } from './api';
export function RecoveryPayments({value=[],onChange,currency='CNY',kind,disabled}:{value?:TransferPayment[];onChange?:(p:TransferPayment[])=>void;currency?:string;kind:'Income'|'Expense';disabled?:boolean}) {
 const [search,setSearch]=useState('');const q=useQuery({queryKey:['concert','transfer-choices',currency,kind,search],queryFn:()=>concertApi.transferTransactions(currency,kind,search)});const title=kind==='Income'?'理赔实收':'理赔返款';
 return <Space direction="vertical" style={{width:'100%'}}>
  {q.isError && <Alert type="error" message="来源加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>}
  {value.map((p,index)=><Space key={index} wrap><Select aria-label={`${title}来源 ${index+1}`} style={{minWidth:220}} disabled={disabled} showSearch filterOption={false} onSearch={setSearch} value={p.transactionId||undefined} options={q.data?.filter(t=>t.type===kind).map(t=>({value:t.id,label:`${t.amount} ${t.currency} · ${t.note||t.merchant||t.id}`}))} onChange={transactionId=>onChange?.(value.map((x,i)=>i===index?{...x,transactionId}:x))}/><Input aria-label={`${title}金额 ${index+1}`} inputMode="decimal" disabled={disabled} value={p.amount} onChange={e=>onChange?.(value.map((x,i)=>i===index?{...x,amount:e.target.value}:x))}/><Button disabled={disabled} onClick={()=>onChange?.(value.filter((_,i)=>i!==index))}>移除关联</Button></Space>)}
  <Button disabled={disabled||value.length>=20} onClick={()=>onChange?.([...value,{transactionId:'',amount:''}])}>关联{title}</Button>
 </Space>;
}
