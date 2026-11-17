import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button,Select,Space,Alert} from 'antd';
import {interestApi} from './interestApi';
export function PurchaseItemLink({value,onChange,disabled}:{value?:{purchaseId:string;itemId:string}|null;onChange?:(v:{purchaseId:string;itemId:string}|null)=>void;disabled?:boolean}) {
 const [page,setPage]=useState(1);const q=useQuery({queryKey:['music-purchase-link',page],queryFn:()=>interestApi.purchases(page)});const options=q.data?.items.flatMap(p=>p.input.items.map(i=>({value:p.id+'|'+i.id,label:`${p.input.purchasedOn} · ${i.name} · ${i.paid} ${p.input.currency}`})))??[];const selected=value?value.purchaseId+'|'+value.itemId:undefined;
 return <Space direction="vertical" style={{width:'100%'}}>{q.isError&&<Alert type="error" message="购买档案加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>}<Select aria-label="关联原购买商品" allowClear style={{width:'100%'}} disabled={disabled} value={selected} options={options} labelRender={v=>options.find(o=>o.value===v.value)?.label??'已保存的购买商品引用'} onChange={v=>{if(!v)onChange?.(null);else{const [purchaseId,itemId]=v.split('|');onChange?.({purchaseId,itemId});}}}/><Space><Button disabled={disabled||page===1} onClick={()=>setPage(p=>p-1)}>上一页购买</Button><span>第{page}页</span><Button disabled={disabled||page*20>=(q.data?.total??0)} onClick={()=>setPage(p=>p+1)}>下一页购买</Button></Space></Space>;
}
