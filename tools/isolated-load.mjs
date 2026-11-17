import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const origin = process.env.PF_LOAD_ORIGIN;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(process.env.PF_LOAD_DATABASE ?? '', /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
const out = process.env.PF_LOAD_OUTPUT;
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(fixture.database, process.env.PF_LOAD_DATABASE);
assert.equal(fixture.seededTransactions, 40000);
const seconds = Number(process.env.PF_LOAD_SECONDS);
const workers = Number(process.env.PF_LOAD_WORKERS);
const samples = []; const failures = []; const checks = [];
let token, tokenIssuedAt = 0, authenticating, refreshes = 0;
const cookies = new Map();
function captureCookies(response, jar = cookies) { for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0]; const index = pair.indexOf('='); jar.set(pair.slice(0, index), pair.slice(index + 1)); } }
const cookieHeader = jar => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
const credentials = { email: process.env.PF_LOAD_EMAIL, password: process.env.PF_LOAD_PASSWORD };
async function login() {
  const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Isolated login failed');
  captureCookies(response);
  token = (await response.json()).data.accessToken; tokenIssuedAt = Date.now();
}
async function refreshSession() {
  const response = await fetch(origin + '/api/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Cookie: cookieHeader(cookies), 'X-XSRF-TOKEN': decodeURIComponent(cookies.get('XSRF-TOKEN')) }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Isolated session refresh failed'); captureCookies(response);
  token = (await response.json()).data.accessToken; tokenIssuedAt = Date.now(); refreshes++;
}
async function request(route, { method = 'GET', body, headers = {}, status = 200, name = route, record = true } = {}) {
  if (Date.now() - tokenIssuedAt > 8 * 60000) {
    authenticating ??= refreshSession().finally(() => { authenticating = undefined; });
    await authenticating;
  }
  const started = performance.now();
  try {
    const response = await fetch(origin + '/api' + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const json = await response.json();
    captureCookies(response);
    if (record) { const sample = { name, ms: performance.now() - started, status: response.status, at: Date.now() }; samples.push(sample); fs.appendFileSync(path.join(out, 'requests.jsonl'), JSON.stringify(sample) + '\n'); }
    assert.equal(response.status, status, `${method} ${route} returned ${response.status} ${json.code ?? ''}`);
    return json.data ?? json;
  } catch (error) { failures.push({ name, message: error.message }); throw error; }
}
const money = text => {
  const [integer, fraction = ''] = String(text).split('.');
  return BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0')) * (String(text).startsWith('-') ? -1n : 1n);
};
const query = params => '/transactions?' + new URLSearchParams({ pageSize: '50', ...params });
const paths = [
  { name: 'anomaly-any', route: query({ anomaly: 'Any' }), check: d => assert(d.total >= 0) },
  { name: 'anomaly-summary', route: '/transactions/summary?anomaly=Any', check: d => assert(d.total >= 0) },
  { name: 'list', route: query({}), check: d => { assert(d.total >= 40000); assert.equal(d.items.length, 50); assert.equal(new Set(d.items.map(t => t.id)).size, 50); } },
  { name: 'deep-page', route: query({ page: '800' }), check: d => assert.equal(d.items.length, 50) },
  { name: 'keyword-all', route: query({ keyword: fixture.prefix }), check: d => assert.equal(d.total, 40000) },
  { name: 'keyword-tag', route: query({ keyword: fixture.prefix + '-tags-' }), check: d => assert.equal(d.total, 40000) },
  { name: 'keyword-none', route: query({ keyword: 'unmatched-stability-needle-20261020' }), check: d => assert.equal(d.total, 0) },
  { name: 'amount-sort', route: query({ sort: 'amount:desc' }), check: d => { for (let i = 1; i < d.items.length; i++) assert(money(d.items[i - 1].amount) >= money(d.items[i].amount)); } },
  { name: 'combined', route: query({ accountId: fixture.accountId, categoryId: fixture.parentId, currency: 'CNY', type: 'Expense', start: '2018-01-01', end: '2025-12-31', min: '1', max: '100' }), check: d => assert(d.items.every(t => t.accountId === fixture.accountId && t.currency === 'CNY' && t.type === 'Expense')) },
  ...['CNY', 'USD', 'HKD'].map(currency => ({ name: 'report-' + currency, route: '/reports/summary?' + new URLSearchParams({ start: '2018-01-01', end: '2025-12-31', currency, granularity: 'year' }), check: d => { const expected = fixture.totals.find(t => t.Currency === currency); assert.equal(money(d.income), money(expected.income)); assert.equal(money(d.expense), money(expected.expense)); assert.equal(d.points.length, 8); } })),
];
const percentile = (values, p) => values.length ? +values.slice().sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)].toFixed(2) : null;
function summarize(items) {
  return [...new Set(items.map(s => s.name))].map(name => {
    const selected = items.filter(s => s.name === name); const values = selected.map(s => s.ms);
    return { name, requests: selected.length, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99), maxMs: Math.max(...values), unexpectedResponses: selected.filter(s => s.status >= 500).length };
  });
}
const report = { startedAt: new Date().toISOString(), fixture: { transactions: 40000, entries: 80000, currencies: ['CNY', 'USD', 'HKD'], apiBuildId: fixture.apiBuildId }, environment: { cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length, totalMemoryBytes: os.totalmem(), platform: os.platform(), node: process.version, transport: 'local Kestrel HTTP; real SQL; synthetic data only', cache: 'warm; SQL caches not cleared', apiBuild: 'Release' }, benchmark: [], soak: null, checks, limitations: ['Single local machine, not production capacity or a 24-hour reliability guarantee', 'No external AI, FX provider or production financial writes'] };
function persist() { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ...report, failures }, null, 2)); }
const progress = stage => fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ stage, requests: samples.length, failures: failures.length, at: new Date().toISOString() }));
try {
await login();
const context = await request('/verification-context', { record: false }); assert.equal(context.database, fixture.database);
checks.push('Authenticated API explicitly confirms the random isolated database');
await request('/auth/me', { record: false });
await refreshSession();
const [header, payload] = token.split('.');
const expiredPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), exp: Math.floor(Date.now() / 1000) - 120 })).toString('base64url');
const expiredUnsigned = header + '.' + expiredPayload;
const expiredToken = expiredUnsigned + '.' + createHmac('sha256', process.env.PF_LOAD_SIGNING_KEY).update(expiredUnsigned).digest('base64url');
assert.equal((await fetch(origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + expiredToken } })).status, 401);
const disposableLogin = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(disposableLogin.status, 200);
const disposableCookies = new Map(); captureCookies(disposableLogin, disposableCookies);
const disposableToken = (await disposableLogin.json()).data.accessToken;
const anti = await fetch(origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + disposableToken } });
assert.equal(anti.status, 200); captureCookies(anti, disposableCookies);
const revoked = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + disposableToken, Cookie: cookieHeader(disposableCookies), 'X-XSRF-TOKEN': decodeURIComponent(disposableCookies.get('XSRF-TOKEN')) } });
assert.equal(revoked.status, 200);
assert.equal((await fetch(origin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + disposableToken } })).status, 401);
checks.push('Expired signed tokens and revoked disposable sessions return 401; refresh rotation succeeds');
for (const item of paths) { item.check(await request(item.route, { name: 'warm/' + item.name })); }
for (const concurrency of [1, 4, 8]) {
  const startIndex = samples.length; const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    for (let repeat = 0; repeat < 3; repeat++) for (const item of paths) item.check(await request(item.route, { name: item.name }));
  }));
  const summary = summarize(samples.slice(startIndex));
  report.benchmark.push({ concurrency, durationMs: performance.now() - started, summary, latencyBudgetExceeded: summary.filter(s => s.p95Ms > (s.name.startsWith('report-') ? 5000 : 2000)).map(s => s.name) });
  progress('benchmark/' + concurrency); persist(); console.log(JSON.stringify(report.benchmark.at(-1)));
}
const account = await request('/accounts', { method: 'POST', body: { name: 'Isolated mixed load account', type: 'Cash', currency: 'CNY', openingBalance: '100000.00' }, headers: { 'Idempotency-Key': crypto.randomUUID() }, record: false });
const categories = await request('/categories', { record: false });
const expenseCategory = categories.find(c => c.kind === 'Expense' && c.parentId && c.status === 'Active');
const expense = { type: 'Expense', accountId: account.id, categoryId: expenseCategory.id, amount: '0.01', currency: 'CNY', occurredAt: '2026-10-20T12:00:00+08:00', merchant: 'ISOLATED-LOAD-WRITE', note: 'Synthetic sustained test' };
let expectedBalance = 1000000000n; let created = 0; let recovered = 0;
const sharedKey = crypto.randomUUID();
const burst = await Promise.all(Array.from({ length: 12 }, () => request('/transactions/expense', { method: 'POST', body: expense, headers: { 'Idempotency-Key': sharedKey }, name: 'idempotency-burst' })));
assert.equal(new Set(burst.map(t => t.id)).size, 1); expectedBalance -= 100n; created++;
await request('/transactions/expense', { method: 'POST', body: { ...expense, amount: '0.02' }, headers: { 'Idempotency-Key': sharedKey }, status: 409, name: 'idempotency-conflict' });
checks.push('Twelve concurrent identical keys post once; changed content is rejected');
async function cycle(index) {
  const saved = await request('/transactions/expense', { method: 'POST', body: expense, headers: { 'Idempotency-Key': crypto.randomUUID() }, name: 'write-expense' });
  expectedBalance -= 100n; created++;
  if (index % 2 === 0) {
    const detail = await request('/transactions/' + saved.id, { name: 'detail' });
    await request('/transactions/' + saved.id, { method: 'DELETE', headers: { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': detail.version }, name: 'delete' });
    expectedBalance += 100n;
    const deleted = await request('/transactions/' + saved.id, { name: 'deleted-detail' });
    await request('/transactions/' + saved.id + '/restore', { method: 'POST', body: {}, headers: { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': deleted.version }, name: 'restore' });
    expectedBalance -= 100n; recovered++;
  }
}
await Promise.all(Array.from({ length: workers }, (_, i) => cycle(i)));
const soakStartIndex = samples.length; const soakStarted = performance.now(); const until = soakStarted + seconds * 1000;
let writeIndex = workers;
await Promise.all([
  ...Array.from({ length: workers }, async (_, worker) => {
    let index = worker;
    while (performance.now() < until) { const item = paths[index++ % paths.length]; item.check(await request(item.route, { name: item.name })); await delay(100); }
  }),
  (async () => { while (performance.now() < until) { await cycle(writeIndex++); progress('soak'); persist(); await delay(1000); } })(),
]);
const accounts = await request('/accounts', { record: false });
assert.equal(money(accounts.find(a => a.id === account.id).balance), expectedBalance);
checks.push('Final isolated account balance equals exact acknowledged writes across deletes and restores');
await request('/auth/me', { record: false });
report.soak = { requestedSeconds: seconds, durationMs: performance.now() - soakStarted, workers, summary: summarize(samples.slice(soakStartIndex)), created, deleteRestoreCycles: recovered, expectedBalance: expectedBalance.toString(), refreshes };
report.finishedAt = new Date().toISOString(); report.functionalPassed = true;
progress('complete'); persist();
console.log(JSON.stringify({ functionalPassed: true, soak: report.soak, failures }));
} catch (error) { report.functionalPassed = false; report.finishedAt = new Date().toISOString(); persist(); throw error; }
