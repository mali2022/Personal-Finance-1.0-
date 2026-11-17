import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
assert.match(s.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);assert.match(s.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const fixture=JSON.parse(fs.readFileSync(s.output+'/reconciliation-fixture.json','utf8').replace(/^\uFEFF/,''));
const login=await fetch(s.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:s.email,password:s.password})});assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const samples=[];
async function call(path,body,method='POST',extra={}){const start=performance.now();const r=await fetch(s.origin+'/api'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const json=await r.json();samples.push({path,ms:+(performance.now()-start).toFixed(2),status:r.status});assert.equal(r.status,200,JSON.stringify(json));return json.data??json;}
assert.equal((await call('/verification-context',null,'GET')).database,s.database);
const balance=async()=>(await call('/accounts',null,'GET')).find(a=>a.id.toUpperCase()===fixture.accountId.toUpperCase()).balance;
const before=await balance();let transactions=[];
for(let page=1;page<=10;page++){const d=await call(`/transactions?accountId=${fixture.accountId}&type=Expense&pageSize=100&page=${page}`,null,'GET');transactions.push(...d.items);}
assert.equal(transactions.length,1000);
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const runId=process.env.PF_RECONCILIATION_IMPORT_RUN_ID??'';assert.match(runId,/^[a-z0-9-]*$/);
const csv='date,amount,type,merchant,currency,reference\n'+transactions.map(t=>[t.occurredAt,t.amount,'Expense',t.merchant,t.currency,'api-statement:'+runId+t.id].map(quote).join(',')).join('\n');
const form=new FormData();form.append('source','CSV');form.append('file',new Blob([csv],{type:'text/csv'}),'synthetic-1000-reconciliation.csv');const uploadStart=performance.now();
const r=await fetch(s.origin+'/api/imports',{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal:AbortSignal.timeout(60000)});const uploaded=await r.json();assert.equal(r.status,200,JSON.stringify(uploaded));samples.push({path:'/imports upload',ms:+(performance.now()-uploadStart).toFixed(2),status:r.status});
const job=uploaded.data;const mapped=await call(`/imports/${job.id}/mapping`,{accountId:fixture.accountId,purpose:'Reconciliation',mapping:{occurredAt:'date',amount:'amount',type:'type',merchant:'merchant',currency:'currency',externalId:'reference'}},'PUT',{'If-Match':job.version});assert.equal(mapped.summary.total,1000);assert.equal(mapped.summary.invalid,0);
let cursor=0,imported=0,duplicates=0;for(let i=0;i<5;i++){const x=await call('/smart-reconciliation/import',{accountId:fixture.accountId,importJobId:job.id,version:mapped.version,afterIndex:cursor});assert.equal(x.failures.length,0);imported+=x.imported;duplicates+=x.duplicates;cursor=x.nextIndex;}
assert.equal(imported+duplicates,1000);const replay=await call('/smart-reconciliation/import',{accountId:fixture.accountId,importJobId:job.id,version:mapped.version,afterIndex:0});assert.equal(replay.imported,0);assert.equal(replay.duplicates,200);assert.equal(await balance(),before);
fs.writeFileSync(s.output+'/reconciliation-import-performance.json',JSON.stringify({synthetic:true,actualFileRows:1000,imported,duplicates,replayDuplicates:replay.duplicates,ledgerBalanceUnchanged:true,samples},null,2));console.log('Real CSV upload, mapping, 1000-row batched receipt and replay verified');
