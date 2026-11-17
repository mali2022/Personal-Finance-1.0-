import {useQueries} from '@tanstack/react-query';
import {Alert,Select} from 'antd';
import {concertApi} from './api';
import type {Scene} from './api';
export type TripFile={sceneId:string;attachmentId:string};
export function TripFiles({scenes,value,onChange}:{scenes:Scene[];value:TripFile[];onChange:(v:TripFile[])=>void}) {
 const results=useQueries({queries:scenes.map(s=>({queryKey:['concert-attachments',s.id],queryFn:()=>concertApi.attachments(s.id)}))});const options=results.flatMap((q,i)=>(q.data??[]).map(f=>({value:JSON.stringify({sceneId:scenes[i].id,attachmentId:f.id}),label:scenes[i].input.title+' · '+f.name})));
 return <>{results.some(q=>q.isError)&&<Alert type="error" message="部分场次凭证加载失败"/>}<Select aria-label="行程已有凭证" mode="multiple" style={{width:'100%'}} value={value.map(v=>JSON.stringify(v))} options={options} onChange={v=>onChange(v.map(s=>JSON.parse(s) as TripFile))}/></>;
}
