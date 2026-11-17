import {useQuery} from '@tanstack/react-query';
import {Alert,Button,Collapse} from 'antd';
import {apiClient} from '../../api/client';
import type {ApiResponse} from '../../types';
import {Sensitive} from '../../components/Sensitive';
function readable(changes:string) {try {const value=JSON.parse(changes);if(typeof value.before==='string')try {value.before=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.before),c=>c.charCodeAt(0))));}catch{/* Old snapshots may not be JSON. */}return JSON.stringify(value,null,2);}catch{return changes;}}
export function P1History({kind,id}:{kind:string;id:string}) {
 const q=useQuery({queryKey:['concert','p1-history',kind,id],queryFn:()=>apiClient.get<ApiResponse<{id:string;createdAt:string;changes:string}[]>>(`/concerts/p1-history/${kind}/${id}`).then(r=>r.data.data)});
 return q.isError?<Alert type="error" message="历史加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>:<Collapse items={(q.data??[]).map(h=>({key:h.id,label:h.createdAt,children:<Sensitive><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{readable(h.changes)}</pre></Sensitive>}))}/>;
}
