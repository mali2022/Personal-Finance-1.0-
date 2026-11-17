import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Alert,Button} from 'antd';
import {apiClient} from '../../api/client';
import type {ApiResponse} from '../../types';
import type {PurchaseRecord} from './interestApi';
import {InterestFiles} from './InterestFiles';
export function CollectionFiles({purchaseId}:{purchaseId:string}) {
 const [version,setVersion]=useState<string>();const q=useQuery({queryKey:['concert','collection-purchase',purchaseId],queryFn:()=>apiClient.get<ApiResponse<PurchaseRecord>>('/concerts/collection-purchase/'+purchaseId).then(r=>r.data.data)});
 return q.isError?<Alert type="error" message="原商品图片加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>:q.data?<><span>原购买：{q.data.input.purchasedOn} · 渠道 {q.data.input.channel} · 商家 {q.data.input.merchant}</span><InterestFiles record={{...q.data,version:version??q.data.version}} onVersion={setVersion}/></>:null;
}
