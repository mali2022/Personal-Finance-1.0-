import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
assert.match(s.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);assert.match(s.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const r=await fetch(s.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:s.email,password:s.password})});assert.equal(r.status,200);const token=(await r.json()).data.accessToken;
const context=await (await fetch(s.origin+'/api/verification-context',{headers:{Authorization:'Bearer '+token}})).json();assert.equal((context.data??context).database,s.database);
const samples=[];
for(let round=0;round<3;round++)for(const route of ['/transactions/summary?start=2025-01-01&end=2025-12-31&currency=CNY','/transactions?pageSize=20&status=NeedsReview']){
 const start=performance.now();try{const res=await fetch(s.origin+'/api'+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});const json=await res.json();assert.equal(res.status,200,JSON.stringify(json));assert(Number.isInteger(json.data.total));samples.push({round,route,ms:+(performance.now()-start).toFixed(2),passed:true});}catch(e){samples.push({round,route,ms:+(performance.now()-start).toFixed(2),passed:false,error:e.message});}
 fs.writeFileSync(s.output+'/core-query-probe.json',JSON.stringify({synthetic:true,timeoutMs:15000,samples},null,2));
}
console.log(JSON.stringify(samples));assert(samples.every(x=>x.passed));
