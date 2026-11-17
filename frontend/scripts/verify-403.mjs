import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('verification/403',{recursive:true});
const browser=await chromium.launch({headless:true});
const sections=[['comparison','期间对比'],['periods','月报与年报'],['structure','收支结构'],['net-worth','资产负债归因'],['metrics','指标说明'],['debt-pressure','债务压力'],['health','财务健康']];
const results=[];
try{for(const width of [1440,390]){
let profile={id:'test-403',displayName:'验证用户',email:'verify@example.test',preferredCurrency:'EUR',version:1,language:'zh-CN',timeZone:'Asia/Shanghai',gender:'Unspecified',country:'',region:'',city:'',occupation:'',bio:'',realName:'',phone:'',birthday:null};
const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(/^http:\/\/127\.0\.0\.1:5181\/api\//,async route=>{const req=route.request();const path=new URL(req.url()).pathname;let data=[];
if(path.endsWith('/auth/me'))data={...profile,permissions:[]};
else if(path.endsWith('/auth/profile')){if(req.method()==='PUT')profile={...profile,...req.postDataJSON(),version:2};data=profile;}
else if(path.endsWith('/auth/refresh'))data={accessToken:'test-403-token'};
else if(path.includes('/reports/')||path.includes('/debt-plans'))return route.fulfill({status:503,json:{message:'验证环境未提供报表数据'}});
else if(req.method()!=='GET')data={id:'11111111-1111-1111-1111-111111111111',version:1,deleted:req.method()==='DELETE'};
await route.fulfill({json:{data}});});
await page.goto('http://127.0.0.1:5181/profile');const name=page.getByLabel('显示名称',{exact:true});await name.waitFor();if(!await name.isDisabled())throw Error('profile editable initially');
await page.getByRole('button',{name:'修改信息',exact:true}).click();await name.fill('未保存');await page.getByRole('button',{name:'取消修改',exact:true}).click();if(await name.inputValue()!=='验证用户'||!await name.isDisabled())throw Error('cancel failed');
await page.getByRole('button',{name:'修改信息',exact:true}).click();await name.fill('已保存用户');await page.getByRole('button',{name:'保存资料',exact:true}).click();await page.getByRole('button',{name:'修改信息',exact:true}).waitFor();if(!await name.isDisabled()||await name.inputValue()!=='已保存用户')throw Error('save failed');
await page.screenshot({path:`verification/403/profile-${width}.png`,fullPage:true});
for(const [id,title]of sections){await page.goto('http://127.0.0.1:5181/reports/'+id+'?currency=EUR');await page.getByRole('heading',{name:title,exact:true}).waitFor();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+id);}
await page.screenshot({path:`verification/403/reports-${width}.png`,fullPage:true});
if(width===1440){const submitted=await page.evaluate(async()=>{const{apiClient}=await import('/src/api/client.ts');const{setJournalOwner,pendingOperations}=await import('/src/stores/operationJournal.ts');setJournalOwner('test-403');const paths=['/directory/merchants','/directory/projects','/investments/assets','/product-prices','/business','/payroll-center/slips/11111111-1111-1111-1111-111111111111','/payroll-center/plans/11111111-1111-1111-1111-111111111111'];for(const path of paths)await apiClient.request({url:path,method:path.includes('/payroll-center/')?'delete':'post',data:{name:'fixture'},headers:{'Idempotency-Key':crypto.randomUUID(),'If-Match':'1'}});return{count:paths.length,pending:pendingOperations('test-403').length};});if(submitted.pending)throw Error('journal not cleared');results.push(submitted);}
if(errors.length)throw Error(errors.join('\n'));results.push({width,profileEditCancelSave:true,reportRoutes:7,noOverflow:true});await page.close();}
fs.writeFileSync('verification/403/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
