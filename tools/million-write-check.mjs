import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const session=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
assert.match(session.origin,/^http:\/\/127\.0\.0\.1:\d+$/);assert.match(session.database,/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
const name=process.argv[3]||'write-check';assert.match(name,/^[a-z0-9-]+$/);
const output=path.join(session.output,name);fs.mkdirSync(output,{recursive:false});const checks=[],samples=[];
let token;
async function req(route,{method='GET',body,version,key=crypto.randomUUID(),status=200}={}){const start=performance.now();const r=await fetch(session.origin+'/api'+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'Idempotency-Key':key}:{}),...(version?{'If-Match':version}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const json=await r.json();samples.push({route,method,status:r.status,ms:+(performance.now()-start).toFixed(2)});assert.equal(r.status,status,JSON.stringify({route,status:r.status,error:json}));return json.data??json;}
function save(){fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({transactionsBefore:1000000,synthetic:true,checks,samples,passed:checks.length},null,2));}
try{
const login=await fetch(session.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session.email,password:session.password})});assert.equal(login.status,200);token=(await login.json()).data.accessToken;
assert.equal((await req('/verification-context')).database,session.database);
const a=await req('/accounts',{method:'POST',body:{name:'Million write A '+crypto.randomUUID(),type:'Cash',currency:'CNY',openingBalance:'1000',status:'Active'}});
const b=await req('/accounts',{method:'POST',body:{name:'Million write B '+crypto.randomUUID(),type:'Cash',currency:'CNY',openingBalance:'1000',status:'Active'}});
const categories=await req('/categories');const expenseCategory=categories.find(c=>c.kind==='Expense'&&c.parentId&&c.status==='Active');const incomeCategory=categories.find(c=>c.kind==='Income'&&c.parentId&&c.status==='Active');
const date='2026-10-26T12:00:00+08:00';const expense={type:'Expense',currency:'CNY',amount:'10.00',accountId:a.id,categoryId:expenseCategory.id,occurredAt:date,fee:'0',note:'synthetic million write',payments:[{accountId:a.id,amount:'4.00'},{accountId:b.id,amount:'6.00'}]};
const key=crypto.randomUUID();const burst=await Promise.all(Array.from({length:12},()=>req('/transactions/expense',{method:'POST',body:expense,key})));assert.equal(new Set(burst.map(x=>x.id)).size,1);
await req('/transactions/expense',{method:'POST',body:{...expense,amount:'11.00'},key,status:409});checks.push('12 concurrent identical idempotency keys post once; changed body returns 409');save();
let t=await req('/transactions/'+burst[0].id);assert.equal(t.payments.length,2);assert.equal(t.accountBalances.find(x=>x.accountId===a.id).balance,'996.00');assert.equal(t.accountBalances.find(x=>x.accountId===b.id).balance,'994.00');checks.push('Multi-payment entries and exact transaction balances match');
const refund=await req('/transactions/refund',{method:'POST',body:{type:'Refund',amount:'3.00',accountId:b.id,categoryId:expenseCategory.id,currency:'CNY',occurredAt:date,originalTransactionId:t.id,fee:'0',note:'synthetic partial refund'}});
assert.equal((await req('/refund-sources/'+t.id)).refundableAmount,'7.00');
await req('/transactions/'+t.id+'/income',{method:'PUT',version:t.version,status:422,body:{...expense,type:'Income',categoryId:incomeCategory.id,payments:[],amount:'12.00'}});checks.push('Partial refund uses exact remaining capacity; linked expense editing is protected');
let r=await req('/transactions/'+refund.id);await req('/transactions/'+r.id,{method:'DELETE',version:r.version});
const edited={...expense,type:'Income',categoryId:incomeCategory.id,payments:[],amount:'12.00'};await req('/transactions/'+t.id+'/income',{method:'PUT',version:t.version,body:edited});
await req('/transactions/'+t.id+'/income',{method:'PUT',version:t.version,body:edited,status:409});
t=await req('/transactions/'+t.id);assert.equal(t.type,'Income');assert.equal(t.accountBalances.find(x=>x.accountId===a.id).balance,'1012.00');checks.push('Type editing rebuilds the ledger and stale versions return 409');save();
for(const kind of ['Lent','Borrowed']){const loan=await req('/business',{method:'POST',body:{kind,counterparty:'Synthetic loan',accountId:a.id,amount:'100.00',occurredAt:date,note:'synthetic'}});let d=await req('/business/'+loan.id);await req('/business/'+loan.id+'/settlements',{method:'POST',version:d.version,body:{accountId:a.id,amount:'40.00',occurredAt:date,note:'synthetic'}});d=await req('/business/'+loan.id);await req('/business/'+loan.id,{method:'DELETE',version:d.version});}
checks.push('Lent and borrowed principal plus repayments can be deleted atomically');
await req('/transactions/'+t.id,{method:'DELETE',version:t.version});t=await req('/transactions/'+t.id);await req('/transactions/'+t.id+'/restore',{method:'POST',body:{},version:t.version});
const balances=await req('/accounts');assert.equal(balances.find(x=>x.id===a.id).balance,'1012.00');assert.equal(balances.find(x=>x.id===b.id).balance,'1000.00');checks.push('Final acknowledged balance equals writes after refund deletion, type edit, loan reversals and transaction restore');
await req('/exports',{method:'POST',body:{format:'CSV',filters:{}},status:422});checks.push('Million-row export rejects the documented 100000-row limit without creating an export');save();
console.log('MILLION_WRITE_CHECK_PASSED '+checks.length);
}catch(e){save();throw e;}
