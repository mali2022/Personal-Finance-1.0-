import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('dist/sw.js', 'utf8');
const resources = JSON.parse(source.match(/const RESOURCES=(\[[^;]+\]);/)[1]);
const assets = JSON.parse(source.match(/const ASSETS=(\[[^;]+\]);/)[1]);
assert.ok(assets.length > resources.filter(x => x.startsWith('/assets/')).length);
assert.ok(!resources.some(x => /ImportPage-|chart-engine-|chart-renderer-/.test(x)));
assert.ok(![...resources, ...assets].includes('/release-info.json'));
const listeners = new Map();
const stored = new Map();
const fetched = [];
let fail = false;
let quota = false;
const response = (ok = true) => ({ ok, clone() { return this; } });
const cache = {
  async match(request) { return stored.get(request.url ?? request); },
  async put(request, value) { if (quota) throw Error('quota'); stored.set(request.url, value); },
  async addAll(urls) { for (const url of urls) stored.set(url, response()); },
};
vm.runInNewContext(source, {
  URL,
  self: { location: { origin: 'https://finance.example' }, addEventListener: (type, fn) => listeners.set(type, fn) },
  caches: { open: async () => cache, match: async key => stored.get(key) },
  fetch: async request => { fetched.push(request.url); if (fail) throw Error('offline'); return response(!request.url.includes('bad')); },
});
async function dispatch(path, method = 'GET', mode = 'cors') {
  let result;
  listeners.get('fetch')({ request: { url: new URL(path, 'https://finance.example').href, method, mode }, respondWith(value) { result = value; } });
  return result;
}
for (const path of ['/api/transactions', '/release-info.json', 'https://other.example/assets/test.js']) assert.equal(await dispatch(path), undefined);
assert.equal(await dispatch(assets[0], 'POST'), undefined);
const lazy = assets.find(path => /ImportPage-/.test(path));
assert.ok(lazy);
const online = await dispatch(lazy);
assert.equal(online.ok, true);
const requests = fetched.length;
fail = true;
assert.equal(await dispatch(lazy), online);
assert.equal(fetched.length, requests, 'Cached lazy modules work offline');
stored.set('/', response());
assert.equal(await dispatch('/updates', 'GET', 'navigate'), stored.get('/'));
fail = false;
quota = true;
assert.equal((await dispatch(assets.find(path => path !== lazy))).ok, true, 'Quota errors preserve successful network responses');
let precacheBytes = 0;
let allAssetBytes = 0;
for (const path of resources) precacheBytes += (await stat(path === '/' ? 'dist/index.html' : 'dist' + path)).size;
for (const path of assets) allAssetBytes += (await stat('dist' + path)).size;
console.log(JSON.stringify({ pwaPolicyVerified: true, precacheResources: resources.length, totalAssets: assets.length, precacheBytes, allAssetBytes }));
