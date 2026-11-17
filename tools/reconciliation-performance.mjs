import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
assert.match(s.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);assert.match(s.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const fixture=JSON.parse(fs.readFileSync(s.output+'/reconciliation-fixture.json','utf8').replace(/^\uFEFF/,''));
const login=await fetch(s.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:s.email,password:s.password})});assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const samples=[];
async function call(path,body,key=crypto.randomUUID(),expected=200){const start=performance.now();const r=await fetch(s.origin+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const json=await r.json();samples.push({path,status:r.status,ms:+(performance.now()-start).toFixed(2)});assert.equal(r.status,expected,JSON.stringify(json));return json.data;}
const overview=await call('/smart-reconciliation?accountId='+fixture.accountId);assert(overview.denominator>=fixture.statementCount);
const pending=await call('/smart-reconciliation?accountId='+fixture.accountId+'&state=Pending');
const rows=pending.items;assert(rows.length>0);const before=await call('/accounts');const balance=before.find(a=>a.id.toUpperCase()===fixture.accountId.toUpperCase()).balance;
const confirmed=[];
for(const row of rows.slice(0,10)){const c=await call(`/smart-reconciliation/${row.id}/candidates`);assert(c.candidates.length<=100);const candidate=c.candidates.find(c=>c.confidence==='High'&&c.reasons.includes('AmountExact'));if(candidate)confirmed.push({id:row.id,version:row.version,transactionId:candidate.transactionId,transactionVersion:candidate.version});}
if(confirmed.length){const body={action:'Confirm',reason:'Synthetic performance batch review',items:confirmed};await call('/smart-reconciliation/batch/preview',body);const key=crypto.randomUUID();const result=await call('/smart-reconciliation/batch/execute',body,key);const retry=await call('/smart-reconciliation/batch/execute',body,key);assert.deepEqual(result,retry);assert(result.results.some(r=>r.success));}
const existingTasks=await call('/smart-reconciliation/tasks?accountId='+fixture.accountId);const task=existingTasks.find(t=>t.state!=='Completed')??await call('/smart-reconciliation/tasks',{accountId:fixture.accountId,startsAt:fixture.startsAt,endsAt:fixture.endsAt});const step=await call(`/smart-reconciliation/tasks/${task.id}/step`,{version:task.version});const processedDelta=step.processed-task.processed;assert(processedDelta<=20);assert(processedDelta>0);
// Read after the committed step demonstrates that progress survives a fresh HTTP request.
const tasks=await call('/smart-reconciliation/tasks?accountId='+fixture.accountId);assert(tasks.some(t=>t.id===task.id&&t.processed===step.processed));
await Promise.all(Array.from({length:4},()=>call(`/smart-reconciliation/${rows.at(-1).id}/candidates`)));
const after=await call('/accounts');assert.equal(after.find(a=>a.id.toUpperCase()===fixture.accountId.toUpperCase()).balance,balance);
const summarize=prefix=>{const a=samples.filter(x=>x.path.includes(prefix)).map(x=>x.ms).sort((a,b)=>a-b);return {count:a.length,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.ceil(a.length*.95)-1],maxMs:a.at(-1)};};
fs.writeFileSync(s.output+'/reconciliation-performance.json',JSON.stringify({synthetic:true,ledgerTransactions:1000000,ledgerEntries:2000000,statementCount:overview.denominator,sqlSeedStatements:fixture.statementCount,apiBuildId:(await (await fetch(s.origin+"/api/health")).json()).buildId,processedPerStep:processedDelta,candidateSearch:summarize('/candidates'),batch:summarize('/batch/'),task:summarize('/step'),samples,ledgerBalanceUnchanged:true,limitations:['LocalDB measurements are not a production SLA','A resumed step is verified by fresh requests; process termination during commit is not injected','No pre-change production comparison is claimed']},null,2));
console.log('Reconciliation performance and financial invariants verified');
