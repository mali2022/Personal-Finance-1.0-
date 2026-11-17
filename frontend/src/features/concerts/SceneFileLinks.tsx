import {useQuery} from '@tanstack/react-query';
import {Alert,App,Button,Space} from 'antd';
import {concertApi} from './api';
export function SceneFileLinks({sceneId,ids}:{sceneId:string;ids:string[]}) {
 const {message}=App.useApp();const q=useQuery({queryKey:['concert-attachments',sceneId],enabled:!!sceneId&&ids.length>0,queryFn:()=>concertApi.attachments(sceneId)});
 return <Space wrap>{q.isError&&<Alert type="error" message="凭证加载失败"/>}{ids.map(id=><Button key={id} onClick={async()=>{try {const blob=await concertApi.download(sceneId,id);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=q.data?.find(f=>f.id===id)?.name??'场次凭证';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{message.error('凭证下载失败，请重试');}}}>{q.data?.find(f=>f.id===id)?.name??'下载关联场次凭证'}</Button>)}</Space>;
}
