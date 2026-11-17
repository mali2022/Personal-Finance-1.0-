import { useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Space, Pagination } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { investmentApi } from '../../api/investments';
import { directoryApi } from '../../api/business';
import { Select } from '../../components/TouchSelect';
import { DateInput } from '../../components/ResponsiveDatePicker';
import { ErrorState } from '../../components/Feedback';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import type { ApiResponse } from '../../types';
export function InvestmentProjectPanel({assetId,date}:{assetId:string;date:string}){
 const en=useLocale()==='en';const t=(zh:string,english:string)=>en?english:zh;const hidden=useUI(s=>s.hidden);const cache=useQueryClient();const[open,setOpen]=useState(false);const[saving,setSaving]=useState(false);const[error,setError]=useState<unknown>();const[form]=Form.useForm();
 const q=useQuery({queryKey:['investment-performance','project',assetId,date],queryFn:({signal})=>apiClient.get<ApiResponse<{status:string;projectName:string|null;effectiveFrom:string|null}>>(`/investments/assets/${encodeURIComponent(assetId)}/project`,{params:{date},signal}).then(r=>r.data.data),enabled:!!assetId});
 const[projectSearch,setProjectSearch]=useState('');const[projectPage,setProjectPage]=useState(1);
 const projects=useQuery({queryKey:['directory','projects',projectSearch,projectPage],queryFn:()=>directoryApi.list('projects',projectSearch,projectPage),enabled:open});
 return <Space direction="vertical" style={{width:'100%'}}>
  <span>{t('报告期末项目分类','Project classification at report end')}：{hidden?'••••':q.data?.projectName??(q.data?.status==='ProjectUnavailable'?t('项目已移除或不可用','Project removed or unavailable'):t('未分配','Unassigned'))}</span>
  {q.isError&&<ErrorState error={q.error} retry={()=>q.refetch()}/>}
  <Button disabled={hidden} onClick={()=>{setError(undefined);form.resetFields();setOpen(true);}}>{t('登记项目分类','Record project classification')}</Button>
  <Modal open={open} title={t('登记项目分类','Record project classification')} onCancel={()=>setOpen(false)} confirmLoading={saving} onOk={async()=>{const value=await form.validateFields();setSaving(true);setError(undefined);try{const current=await apiClient.get<ApiResponse<{version:string}>>(`/investments/assets/${encodeURIComponent(assetId)}`);await investmentApi.save(`/investments/assets/${encodeURIComponent(assetId)}/project`,{...value,projectId:value.projectId??null},current.data.data.version,'put');await cache.invalidateQueries({queryKey:['investment-performance']});setOpen(false);}catch(e){setError(e);}finally{setSaving(false);}}}>
   <Form form={form} layout="vertical"><Form.Item name="projectId" label={t('项目（留空解除）','Project (leave empty to unassign)')}><Select allowClear showSearch filterOption={false} onSearch={value=>{setProjectSearch(value);setProjectPage(1);}} options={(projects.data?.items??[]).filter(x=>x.status==='Active').map(x=>({value:x.id,label:x.name}))}/></Form.Item>
    {projects.data&&<Pagination size="small" current={projectPage} pageSize={20} showSizeChanger={false} total={projects.data.total} onChange={setProjectPage}/>}
    <Form.Item name="effectiveFrom" label={t('生效日期','Effective date')} rules={[{required:true}]}><DateInput type="date"/></Form.Item><Form.Item name="reason" label={t('分类依据','Classification source')} rules={[{required:true}]}><Input maxLength={200}/></Form.Item>
    <Form.Item name="classifyWholeAsset" valuePropName="checked" rules={[{validator:(_,v)=>v?Promise.resolve():Promise.reject(new Error(t('请确认分类范围','Confirm classification scope')))}]}><Checkbox>{t('确认这是整项资产分类','I confirm whole-asset classification')}</Checkbox></Form.Item>
   </Form>{projects.isError&&<ErrorState error={projects.error} retry={()=>projects.refetch()}/>}{error!=null&&<ErrorState error={error}/>}
  </Modal>
 </Space>;
}
