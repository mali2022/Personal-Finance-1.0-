import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import crypto from 'node:crypto';
const session=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const mode=process.env.PF_MILLION_MODE || 'matrix';
const phase=process.argv[3] || 'baseline';assert.match(phase,/^[a-z0-9-]+$/);assert.match(session.origin,/^http:\/\/127\.0\.0\.1:\d+$/);assert.match(session.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
const fixture=JSON.parse(fs.readFileSync(path.join(session.output,'fixture.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(fixture.database,session.database);assert.equal(fixture.seededTransactions,1000000);
const output=path.join(session.output,phase);fs.mkdirSync(output,{recursive:false});
const samples=[];let token;let issued=0;const cookies=new Map();
function capture(r){for(const c of r.headers.getSetCookie()){const i=c.indexOf('=');cookies.set(c.slice(0,i),c.slice(i+1).split(';')[0]);}}
async function login(){const r=await fetch(session.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password})});assert.equal(r.status,200);capture(r);token=(await r.json()).data.accessToken;issued=Date.now();}
async function call(route,{method='GET',body,headers={},record=true,check}={}){
 if(Date.now()-issued>8*60000){await login();}
 const t=performance.now();let row={route,method,concurrency:Number(headers['X-Verification-Concurrency'] || 1),status:0,ms:0,bytes:0,ok:false};
 try{const r=await fetch(session.origin+'/api'+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const text=await r.text();row={...row,status:r.status,bytes:Buffer.byteLength(text)};assert.equal(r.status,200,text.slice(0,500));const json=JSON.parse(text);const value=json.data ?? json;check?.(value);row.ok=true;return value;}
 catch(e){row.error=e.message;return undefined;}
 finally{row.ms=+(performance.now()-t).toFixed(2);if(record){samples.push(row);fs.appendFileSync(path.join(output,'requests.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify(row));}}
}
const dates='start=2025-01-01&end=2025-12-31&currency=CNY';
const forecastStart=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const forecastEnd=new Date(Date.parse(forecastStart+'T00:00:00Z')+31*86400000).toISOString().slice(0,10);
const account=fixture.accountId,category=fixture.categoryId;
const listCheck=d=>{assert(d.total>=1000000);assert.equal(d.items.length,20);assert.equal(new Set(d.items.map(t=>t.id)).size,20)};
const amountDescendingCheck=d=>{listCheck(d);for(let i=1;i<d.items.length;i++)assert(Number(d.items[i-1].amount)>=Number(d.items[i].amount),'Amount order must remain descending');};
const routes=[
 ['/transactions?pageSize=20',listCheck],['/transactions?page=50000&pageSize=20',listCheck],['/transactions?pageSize=20&sort=amount:desc',amountDescendingCheck],
 ['/transactions?pageSize=20&keyword='+fixture.prefix+'&start=2018-01-01&end=2025-12-31',d=>assert.equal(d.total,1000000)],
 ['/transactions?pageSize=20&keyword=missing-million-needle',d=>assert.equal(d.total,0)],
 ['/transactions?pageSize=20&accountId='+account,d=>assert(d.items.length>0)],
 ['/accounts'],['/categories'],['/dashboard?month=2025-12'],['/categories/overview?currency=CNY'],
 ['/categories/'+category+'/statistics?month=2025-12&currency=CNY'],
 ...['analysis','statistics','activity-summary','related-resources','health','audit-history','fund-status'].map(p=>['/accounts/'+account+'/'+p+'?'+dates]),
 ...['merchants','projects','tags','templates'].map(p=>['/directory/'+p]),
 ['/refund-sources?keyword='+fixture.prefix],
 ['/reports/summary?'+dates+'&granularity=month', d=>{const e=fixture.annual.find(x=>x.Currency==='CNY');assert.equal(Number(d.income),Number(e.income));assert.equal(Number(d.expense),Number(e.expense));assert.equal(d.points.length,12); }],['/reports/advanced?'+dates],
 ...['expense-structure','income-stability','net-worth-attribution','comparison','monthly-review','annual-review','emergency-fund','savings-rate','debt-pressure','promotions'].map(p=>['/reports/'+p+'?'+dates+'&month=2025-12&year=2025']),
 ['/settings/statistics/management'],['/settings/statistics'],['/settings/statistics/history'],['/reports/metric-definitions'],
 ['/annual-budgets?year=2025'],['/budgets/2025-12'],['/savings-goals?currency=CNY'],['/budget-templates'],['/budget-alerts'],
 ['/financial-planning/summary'],['/cashflow/scenarios'],[`/cashflow/forecast?start=${forecastStart}&end=${forecastEnd}&currency=CNY`],['/cashflow/events?currency=CNY'],
 ...['Lent','Borrowed','Reimbursement'].map(kind=>['/business?kind='+kind]),['/debt-plans?currency=CNY'],['/loan-schedules'],
 ['/investments/assets'],['/investments/positions'],['/investments/performance?'+dates],['/assets/allocation?currency=CNY&date=2025-12-31'],['/term-deposits'],['/physical-center?currency=CNY'],['/physical-categories'],
 ['/fund-holds'],['/prepayments'],['/advances'],['/payroll'],['/payroll/summary?year=2025'],['/social-contributions/summary?year=2025'],['/housing-fund/withdrawals'],
 ['/living-cost/baskets'],['/product-prices'],['/payment-instruments'],['/currencies'],
 ['/imports'],['/merchant-master'],['/recurring-rules'],['/recurring-occurrences'],['/subscriptions'],['/automation-rules'],['/calendar-events?start=2025-12-01T00%3A00%3A00%2B08%3A00&end=2026-01-01T00%3A00%3A00%2B08%3A00'],['/planning/summary'],
 ['/spaces'],['/space-invitations'],['/concerts'],['/concerts/report?year=2025&currency=CNY'],['/fuel/vehicles'],['/fuel/report?from=2025-01-01&to=2025-12-31&currency=CNY'],['/memories/bookmarks'],['/reports/on-this-day?date=2025-12-01&currency=CNY'],
 ['/ai/settings'],['/ai/conversations'],['/ai/drafts'],['/ai/usage'],
 ['/transactions?pageSize=20&anomaly=Any'],['/transactions/summary?'+dates],['/transactions/summary?anomaly=Any'],['/transactions?pageSize=20&status=NeedsReview']
];
function persist(){const sorted=rows=>rows.map(r=>r.ms).sort((a,b)=>a-b);const summary=Array.from(new Set(samples.map(x=>x.route+' @'+x.concurrency))).map(key=>{const rows=samples.filter(x=>x.route+' @'+x.concurrency===key);const route=rows[0].route;const concurrency=rows[0].concurrency;const a=sorted(rows);return{route,concurrency,requests:rows.length,passed:rows.filter(r=>r.ok).length,p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.ceil(a.length*.95)-1],maxMs:a.at(-1),errors:rows.filter(r=>!r.ok).map(r=>r.error),over2s:rows.filter(r=>r.ms>2000).length}});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({phase,mode,transactions:fixture.seededTransactions,entries:fixture.seededTransactions*2,synthetic:true,environment:{cpu:os.cpus()[0].model,cores:os.cpus().length,memory:os.totalmem(),apiBuildId:crypto.createHash('sha256').update(fs.readFileSync(path.join(session.apiOut,'PersonalFinance.Api.dll'))).digest('hex'),timeoutMs:15000,cache:'no cache reset; first sample includes JIT'},summary,samples:samples.length,failures:samples.filter(x=>!x.ok).length,limitations:['Ledger scale does not mean one million instances of every specialist entity','External AI and live FX providers are not load tested','Capacity numbers describe local LocalDB and Release API, not production SLA']},null,2));}
await login();const context=await call('/verification-context',{record:false});assert.equal(context.database,session.database);
const modules=await call('/settings/modules',{record:false});
if(!modules.concerts) assert(await call('/settings/modules',{method:'PUT',body:{concerts:true},headers:{'If-Match':modules.version,'Idempotency-Key':crypto.randomUUID()},record:false}));
const goals=await call('/savings-goals?currency=CNY',{record:false});
let goal=goals.items?.find(g=>g.name==='Million emergency fixture');
if(!goal) goal=await call('/savings-goals',{method:'POST',body:{name:'Million emergency fixture',type:'Emergency',target:'10000',currency:'CNY',startDate:'2025-01-01',targetDate:'2027-01-01',monthlySaving:'100',priority:1,state:'Active',note:'synthetic'},headers:{'If-Match':'0','Idempotency-Key':crypto.randomUUID()},record:false});
assert(goal?.id);
for(const item of routes) if(item[0].startsWith('/reports/emergency-fund?')) item[0]+='&goalIds='+goal.id;
if(mode==='matrix') for(const [route,check] of routes){await call(route,{check});persist();}
const first=mode==='matrix'?await call('/transactions?pageSize=1',{record:false}):null;if(first?.items?.length){for(const suffix of ['', '/history','/attachments','/issues','/statement-matches']){await call('/transactions/'+first.items[0].id+suffix);persist();}}
if(!phase.startsWith('baseline')){
 const measured=mode==='search'?routes.filter(([route])=>route.startsWith('/transactions?')&&route.includes('keyword=')):routes.filter(([route])=>route.startsWith('/transactions?')&&!route.includes('anomaly')&&!route.includes('NeedsReview')).slice(0,6);
 for(const concurrency of [1,4,8]){await Promise.all(Array.from({length:concurrency},async()=>{for(let repeat=0;repeat<3;repeat++)for(const [route,check] of measured)await call(route,{check,headers:{'X-Verification-Concurrency':String(concurrency)}})}));persist();}
}
persist();console.log('MILLION_PHASE_FINISHED '+phase);
