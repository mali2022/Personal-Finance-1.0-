import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
assert.match(session.database, /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
assert.match(session.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const filename = process.argv[3] || 'life-simulator-performance.json';
assert.match(filename, /^[a-z0-9-]+\.json$/);
const output = path.join(session.output, filename);
assert(!fs.existsSync(output), 'Preserve earlier benchmark evidence');
const login = await fetch(session.origin+'/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password})});
assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const samples=[];
async function request(route, body, label) {
  const start=performance.now(); const r=await fetch(session.origin+'/api'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','If-Match':'0','Idempotency-Key':crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const result=await r.json(); assert.equal(r.status,200,JSON.stringify(result)); if(label)samples.push({label,ms:performance.now()-start}); return result.data ?? result;
}
assert.equal((await request('/verification-context')).database,session.database);
const state = async()=>({accounts:(await request('/accounts')).map(x=>({id:x.id,balance:x.balance,version:x.version})).sort((a,b)=>a.id.localeCompare(b.id)),transactions:(await request('/transactions?pageSize=1')).total});
const before=await state(); assert(before.transactions>=1000000);
let snapshot;
for(let i=0;i<5;i++)snapshot=await request('/life-simulator/snapshots',{currency:'CNY'},'baseline');
const b={...snapshot.snapshot.suggested,name:'Million life fixture',months:120,cash:10000,monthlyIncome:8000,monthlyExpense:5000,assumptionSource:'Synthetic explicit benchmark assumptions; existing personal snapshot retained'};
const ids=[];
for(let i=0;i<20;i++){const r=await request('/life-simulator/runs',b,'deterministic120');if(i===0)ids.push(r.id);assert.equal(r.result.months.length,120);}
for(let i=0;i<20;i++){const r=await request('/life-simulator/runs',{...b,months:480},'deterministic480');assert.equal(r.result.months.length,480);}
for(let i=0;i<2;i++)ids.push((await request('/life-simulator/runs',{...b,name:'Alternative '+i,monthlyExpense:4000+i*500})).id);
for(let i=0;i<10;i++)assert.equal((await request('/life-simulator/compare',{ids},'comparison3')).length,3);
await request('/life-simulator/sensitivity',{input:b,parameter:'InvestmentReturn',values:[-.05,0,.05],secondParameter:'Inflation',secondValues:[0,.02,.04]},'sensitivity9');
const probability=await request('/life-simulator/monte-carlo',{input:{...b,investments:10000},iterations:100,seed:20261027,investmentVolatility:.15,inflationVolatility:.01,incomeVolatility:.03,correlation:0,annualFee:0},'monteCarlo100x120');
assert.equal(probability.result.bands.length,120);
assert.deepEqual(await state(),before);
const summary=[...new Set(samples.map(x=>x.label))].map(label=>{const times=samples.filter(x=>x.label===label).map(x=>x.ms).sort((a,b)=>a-b);return {label,count:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.ceil(times.length*.95)-1],maxMs:times.at(-1)};});
fs.writeFileSync(output,JSON.stringify({synthetic:true,transactions:before.transactions,modelVersion:probability.result.modelVersion,ledgerUnchanged:true,environment:{node:process.version,cpu:os.cpus()[0].model,cores:os.cpus().length,memory:os.totalmem(),apiBuildId:crypto.createHash('sha256').update(fs.readFileSync(path.join(session.apiOut,'PersonalFinance.Api.dll'))).digest('hex')},cache:'First deterministic request cold; subsequent identical inputs use bounded per-user cache',summary,samples,limitations:['Local SQL Server LocalDB; not production SLA','Other local test activity may affect elapsed times','No million-sized investment trade fixture']},null,2));
console.log(JSON.stringify({ledgerUnchanged:true,summary}));
