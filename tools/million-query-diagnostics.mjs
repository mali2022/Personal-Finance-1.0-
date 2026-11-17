import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const session=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const name=process.argv[3];assert.match(name,/^[a-z0-9-]+$/);
assert.match(session.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(session.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
const log=path.join(session.output,path.basename(session.apiOut)+'-api.log');
const output=path.join(session.output,name);fs.mkdirSync(output,{recursive:false});
const login=await fetch(session.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password})});assert.equal(login.status,200);
const token=(await login.json()).data.accessToken;
const context=await fetch(session.origin+'/api/verification-context',{headers:{Authorization:'Bearer '+token}});assert.equal((await context.json()).database,session.database);
const rows=[];
for(const route of ['/dashboard?month=2025-12','/reports/net-worth-attribution?start=2025-01-01&end=2025-12-31&currency=CNY','/categories/overview?currency=CNY']) {
 const offset=fs.statSync(log).size,start=performance.now();
 const r=await fetch(session.origin+'/api'+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});
 await r.arrayBuffer();
 const trace=fs.readFileSync(log).subarray(offset).toString('utf8');
 const commands=Array.from(trace.matchAll(/Executed DbCommand \(([\d,]+)ms\)([\s\S]*?)(?=\n(?:info|warn|fail|dbug):|$)/g),m=>({ms:Number(m[1].replaceAll(',','')),sql:m[2]}));
 const row={route,status:r.status,ms:+(performance.now()-start).toFixed(2),commands:commands.sort((a,b)=>b.ms-a.ms)};rows.push(row);
 fs.writeFileSync(path.join(output,'diagnostics.json'),JSON.stringify({diagnosticOnly:true,diagnosticTimeoutMs:60000,acceptanceDeadlineUnchangedMs:15000,rows},null,2));
 console.log(JSON.stringify({route,status:r.status,ms:row.ms,commands:commands.length,slowest:commands.slice(0,3).map(x=>x.ms)}));
}
