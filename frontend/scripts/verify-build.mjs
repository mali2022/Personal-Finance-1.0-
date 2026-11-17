import { readFile, readdir, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';

const translations = JSON.parse(await readFile('src/i18n/en.json', 'utf8'));
const translationKeys = Object.keys(translations);
const dictionaryOnlyKeys = new Set([
  '应用启动失败，请检查 Mock Service Worker 文件与网络配置。',
  '演示模式：可使用任意有效邮箱与非空密码。数据刷新后重置。',
]);
for (const key of dictionaryOnlyKeys)
  assert.equal(typeof translations[key], 'string');

function propertyKey(property) {
  if (!ts.isPropertyAssignment(property)) return undefined;
  const name = property.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
}

function withoutDictionaryOnlyEntries(source) {
  const tree = ts.createSourceFile(
    'production.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.equal(
    tree.parseDiagnostics.length,
    0,
    '生产资源必须是有效 JavaScript',
  );
  const excluded = [];
  function visit(node) {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.length === translationKeys.length
    ) {
      const seen = new Set();
      const isDictionary = node.properties.every((property) => {
        const key = propertyKey(property);
        if (
          key === undefined ||
          seen.has(key) ||
          !Object.hasOwn(translations, key) ||
          !ts.isStringLiteral(property.initializer) ||
          property.initializer.text !== translations[key]
        )
          return false;
        seen.add(key);
        return true;
      });
      if (isDictionary) {
        // Exempt only these constant pairs inside the complete, current en.json
        // object. Matching runtime strings or partial lookalike objects remain.
        for (const property of node.properties) {
          if (dictionaryOnlyKeys.has(propertyKey(property)))
            excluded.push([property.getStart(tree), property.end]);
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  let offset = 0;
  const retained = [];
  for (const [start, end] of excluded.sort((a, b) => a[0] - b[0])) {
    retained.push(source.slice(offset, start));
    offset = end;
  }
  retained.push(source.slice(offset));
  return retained.join('');
}

function containsDevelopmentRuntime(source) {
  const runtime = withoutDictionaryOnlyEntries(source);
  return ['mock-session', 'Mock Service Worker', '演示模式：'].some((marker) =>
    runtime.includes(marker),
  );
}

// Verify the exception itself: dictionary metadata is allowed, while identical
// text in active banners, runtime strings and partial objects is still blocked.
const dictionaryFixture = `const translations=${JSON.stringify(translations)};`;
assert.equal(containsDevelopmentRuntime(dictionaryFixture), false);
for (const marker of ['mock-session', 'Mock Service Worker', '演示模式：']) {
  assert.equal(
    containsDevelopmentRuntime(
      `${dictionaryFixture}console.log(${JSON.stringify(marker)});`,
    ),
    true,
  );
}
for (const key of dictionaryOnlyKeys) {
  assert.equal(
    containsDevelopmentRuntime(
      `${dictionaryFixture}showBanner(translations[${JSON.stringify(key)}]);`,
    ),
    true,
  );
  assert.equal(
    containsDevelopmentRuntime(
      `const runtime=${JSON.stringify({ [key]: translations[key] })};`,
    ),
    true,
  );
}

const manifest = JSON.parse(
  await readFile('dist/manifest.webmanifest', 'utf8'),
);
assert.equal(manifest.scope, '/');
assert.equal(manifest.start_url, '/');
for (const icon of manifest.icons)
  assert.ok((await stat('dist' + icon.src)).size > 0);
const assets = await readdir('dist/assets');
const javascript = assets.filter((file) => file.endsWith('.js'));
const contents = await Promise.all(
  javascript.map((file) => readFile('dist/assets/' + file, 'utf8')),
);
assert.ok(
  contents.every((source) => !containsDevelopmentRuntime(source)),
  '生产资源不能包含开发模拟账本和 MSW 运行时',
);
assert.ok(javascript.some((file) => file.startsWith('ImportPage-')));
assert.ok(javascript.some((file) => file.startsWith('Chart-')));
const sw = await readFile('dist/sw.js', 'utf8');
await import('./verify-pwa-policy.mjs');
const precache = JSON.parse(
  sw.match(/const RESOURCES=(\[[^;]+\]);/)?.[1] || 'null',
);
assert.ok(
  Array.isArray(precache) && precache.length > 0,
  'PWA 必须提供有效缓存清单',
);
for (const resource of precache) {
  assert.ok(
    typeof resource === 'string' &&
      resource.startsWith('/') &&
      !resource.startsWith('/api/'),
  );
  const path = resource === '/' ? 'dist/index.html' : 'dist' + resource;
  assert.ok((await stat(path)).size > 0, `PWA 缓存资源必须存在：${resource}`);
}
assert.ok(sw.includes("url.pathname.startsWith('/api/')"));
assert.ok(sw.includes("event.request.method!=='GET'"));
assert.ok(sw.includes('ignoreVary:true'));
const index = await readFile('dist/index.html', 'utf8');
const releaseInfo = JSON.parse(await readFile('dist/release-info.json', 'utf8'));
const releaseSource = JSON.parse(await readFile('src/data/releases.json', 'utf8'));
assert.deepEqual(releaseInfo, releaseSource, '公开版本公告必须与本次构建一致');
assert.ok(!precache.includes('/release-info.json'), '更新检查不得读取离线缓存的版本公告');
assert.ok(sw.includes("event.data?.type==='SKIP_WAITING'"), '手动更新必须能激活等待中的资源');
for (const match of index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))
  assert.ok((await stat('dist' + match[1])).size > 0);
console.log(
  JSON.stringify({
    productionMock: false,
    lazyRoutes: true,
    chartsLazy: true,
    apiExcludedFromCache: true,
    javascriptChunks: javascript.length,
    precachedResources: precache.length,
  }),
);
