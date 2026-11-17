import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Alert,Button,Card,Input,Select} from 'antd';
import {concertApi} from './api';
import type {Scene} from './api';
import {TransactionDrawer} from '../transactions/TransactionDrawer';
export type TripExpense={id:string;transactionId:string;amount:string;currency?:string|null;allocations:{sceneId:string;costId:string}[]};
export function TripExpenseFields({item,primaryCurrency,scenes,onChange,onRemove}:{item:TripExpense;primaryCurrency:string;scenes:Scene[];onChange:(patch:Partial<TripExpense>)=>void;onRemove:()=>void}) {
 const currency=item.currency??primaryCurrency;const [search,setSearch]=useState('');const [view,setView]=useState(false);const q=useQuery({queryKey:['concert-transactions',currency,search],queryFn:()=>concertApi.transactions(currency,search,false)});
 const options=scenes.filter(s=>s.input.currency===currency).flatMap(s=>s.input.costs.map(c=>({value:s.id+'|'+c.id,label:`${s.input.title} · ${c.category} · ${c.amount} ${currency}`})));
 return <Card size="small">{q.isError&&<Alert type="error" message="费用来源加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>}<Input aria-label="费用原币币种" value={currency} onChange={e=>onChange({currency:e.target.value.toUpperCase()})}/><Select aria-label="行程实际消费来源" showSearch filterOption={false} onSearch={setSearch} style={{width:'100%'}} value={item.transactionId||undefined} options={q.data?.filter(t=>t.type==='Expense').map(t=>({value:t.id,label:`${t.amount} ${t.currency} · ${t.note||t.merchant||t.id}`}))} onChange={transactionId=>onChange({transactionId})}/><Input aria-label="本行程归属金额" inputMode="decimal" value={item.amount} onChange={e=>onChange({amount:e.target.value})}/><Select aria-label="已有场次费用引用" mode="multiple" style={{width:'100%'}} value={item.allocations.map(a=>a.sceneId+'|'+a.costId)} options={options} onChange={values=>onChange({allocations:values.map(v=>{const [sceneId,costId]=v.split('|');return {sceneId,costId};})})}/><Button disabled={!item.transactionId} onClick={()=>setView(true)}>原交易 / 资金与汇率记录</Button><Button onClick={onRemove}>解除行程费用引用</Button>{view&&<TransactionDrawer id={item.transactionId} onClose={()=>setView(false)}/>}</Card>;
}
