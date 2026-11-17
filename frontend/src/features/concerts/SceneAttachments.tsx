import {Form,Select,Alert,Button} from 'antd';
import {useQuery} from '@tanstack/react-query';
import {concertApi} from './api';
export function SceneAttachments({value=[],onChange,disabled}:{value?:string[];onChange?:(ids:string[])=>void;disabled?:boolean}) {
 const scene=Form.useWatch('sceneId');const q=useQuery({queryKey:['concert-attachments',scene],enabled:!!scene,queryFn:()=>concertApi.attachments(scene)});
 return <>{q.isError&&<Alert type="error" message="凭证加载失败" action={<Button onClick={()=>void q.refetch()}>重试</Button>}/>}<Select aria-label="关联已有场次照片或凭证" mode="multiple" style={{width:'100%'}} disabled={disabled||!scene} loading={q.isPending&&!!scene} value={value} options={q.data?.map(a=>({value:a.id,label:a.name}))} onChange={onChange}/></>;
}
