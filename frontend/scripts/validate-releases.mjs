import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = new URL('../src/data/releases.json', import.meta.url);
const catalog = JSON.parse(await readFile(source, 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.version, catalog.product.version, 'Package and product versions must match');
assert.match(catalog.currentVersion, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
assert.ok(Array.isArray(catalog.releases) && catalog.releases.length > 0);
assert.equal(catalog.releases[0].version, catalog.currentVersion);
assert.equal(catalog.currentVersion.split('.').slice(0, 3).join('-'), catalog.releases[0].date);
assert.equal(catalog.product.releaseNumber, catalog.currentVersion);
assert.equal(catalog.product.name, 'Personal Finance');
assert.equal(catalog.product.channel, 'stable');
assert.match(catalog.product.version, /^\d+\.\d+\.\d+$/);
const ids = new Set(), versions = new Set(); let previousDate = '9999-12-31';
const productVersions = new Set();
let previousProduct = [Infinity, Infinity, Infinity];
assert.equal(catalog.releases[0].productVersion, catalog.product.version);
for (const release of catalog.releases) {
  assert.match(release.productVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(!productVersions.has(release.productVersion), 'Product versions must be unique');
  productVersions.add(release.productVersion);
  const parts = release.productVersion.split('.').map(Number);
  const difference = parts.map((v, i) => v - previousProduct[i]).find(v => v !== 0);
  assert.ok(difference < 0, 'Product versions must be newest first');
  previousProduct = parts;
  assert.ok(typeof release.id === 'string' && release.id.length > 0 && !ids.has(release.id)); ids.add(release.id);
  assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(release.date).toISOString().slice(0, 10), release.date);
  assert.ok(release.date <= previousDate, 'Release notes must be newest first'); previousDate = release.date;
  assert.ok(['new', 'improved', 'fixed'].includes(release.kind));
  if (release.version !== null) { assert.match(release.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/); assert.ok(!versions.has(release.version)); versions.add(release.version); }
  for (const text of [release.title, ...release.changes]) for (const language of ['zh', 'en']) assert.ok(typeof text?.[language] === 'string' && text[language].trim().length > 0 && text[language].length <= 5000);
  assert.ok(release.changes.length > 0);
  assert.ok(release.changes.length <= 30, 'Release notes must fit the public catalog contract');
}
console.log(JSON.stringify({ version: catalog.currentVersion, releases: catalog.releases.length }));
