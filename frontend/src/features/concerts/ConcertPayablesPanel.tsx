import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Alert,App,Button,Card,Space,Table} from 'antd';
import {Link} from 'react-router-dom';
import {DataEditor} from './ConcertForms';
import {concertApi} from './api';
import {useUI} from '../../stores/ui';
const initialPayable={counterparty:'',amount:'0.00',categoryId:'',occurredAt:null,note:'',confirmation:'no'};
const initialRefund={amount:'0.00',occurredAt:null,accountId:null,note:'',confirmation:'no'};
export function ConcertPayablesPanel({currency,onSaved}:{currency:string;onSaved:()=>Promise<unknown>}) {
 const [create,setCreate]=useState<string>();const [refund,setRefund]=useState<{id:string;version:string;key:string}>();const hidden=useUI(s=>s.hidden);const {message}=App.useApp();const cache=useQueryClient();
 const q=useQuery({queryKey:['concert','payables',currency],queryFn:()=>concertApi.payables(currency)});
 const refresh=async()=>{await Promise.all([cache.invalidateQueries({queryKey:['concert']}),cache.invalidateQueries({queryKey:['concert-transactions']}),cache.invalidateQueries({queryKey:['business']}),cache.invalidateQueries({queryKey:['accounts']}),cache.invalidateQueries({queryKey:['transactions']}),cache.invalidateQueries({queryKey:['reports']}),cache.invalidateQueries({queryKey:['overview']}),cache.invalidateQueries({queryKey:['dashboard']})]);await onSaved();};
 return <Card title="他人代付与应付（当前币种）" className="mb16">
 <Button disabled={hidden} onClick={()=>setCreate(crypto.randomUUID())}>确认新增他人实际代付</Button>
 {q.isError && <Alert type="error" message="应付加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>}
 <Table rowKey="id" size="small" loading={q.isPending} dataSource={q.data??[]} pagination={{pageSize:10}} scroll={{x:650}} columns={[{title:'代付人',render:(_,r)=>hidden?'••••':r.counterparty},{title:'原始本金',render:(_,r)=>hidden?'••••':r.principal},{title:'剩余应付',render:(_,r)=>hidden?'••••':r.outstanding},{title:'操作',render:(_,r)=><Space wrap><Link to={`/loans?direction=Borrowed&id=${r.id}`}>原借贷详情 / 部分还款 / 冲销</Link><Button disabled={hidden} onClick={()=>setRefund({id:r.id,version:r.version,key:crypto.randomUUID()})}>登记商家实际退款</Button></Space>}]}/>
 {create && <DataEditor title="确认他人代付记账" fields={[{name:'counterparty',label:'实际代付人',required:true},{name:'amount',label:`实际代付金额 ${currency}`,kind:'amount',required:true},{name:'categoryId',label:'费用分类',kind:'category',required:true},{name:'occurredAt',label:'实际支付时间',kind:'datetime',required:true},{name:'note',label:'付款事实说明',kind:'textarea'},{name:'confirmation',label:'独立写入确认',required:true,options:[{value:'no',label:'尚未确认'},{value:'yes',label:'确认新增真实费用和应付，非重复业务'}]}]} value={initialPayable} onClose={()=>setCreate(undefined)} onSave={async v=>{if(v.confirmation!=='yes')throw new Error('请明确确认真实代付与应付记账');const result=await concertApi.createPayable({counterparty:String(v.counterparty),currency,amount:String(v.amount),categoryId:String(v.categoryId),occurredAt:String(v.occurredAt),note:String(v.note),confirmed:true},create);setCreate(undefined);message.success(`已记账，请在订单或费用中关联来源 ${result.transactionId}`);await refresh();}}/>}
 {refund && <DataEditor title="确认他人代付的实际退款" fields={[{name:'amount',label:'实际退款金额',kind:'amount',required:true},{name:'occurredAt',label:'实际退款时间',kind:'datetime',required:true},{name:'accountId',label:'实际退至本人账户（留空表示退至代付人并冲减应付）',kind:'account'},{name:'note',label:'实际退款说明',kind:'textarea'},{name:'confirmation',label:'独立写入确认',required:true,options:[{value:'no',label:'尚未确认'},{value:'yes',label:'确认实际退款事实并记账'}]}]} value={initialRefund} onClose={()=>setRefund(undefined)} onSave={async v=>{if(v.confirmation!=='yes')throw new Error('请明确确认实际退款事实');await concertApi.refundPayable(refund.id,{amount:String(v.amount),occurredAt:String(v.occurredAt),note:String(v.note),accountId:v.accountId?String(v.accountId):null,confirmed:true},refund.version,refund.key);setRefund(undefined);await refresh();}}/>}
 </Card>;
}
