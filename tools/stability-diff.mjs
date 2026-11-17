import fs from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(fs.readFileSync('.local-run/stability-20261020/baseline/source-manifest.json', 'utf8'));
const changed = manifest.files.filter(file => !fs.existsSync(file.path) || createHash('sha256').update(fs.readFileSync(file.path)).digest('hex') !== file.sha256).map(file => file.path);
if (changed.some(path => /TimeAssets|time-assets|timeAssets/.test(path))) throw Error('Unexpected change in deferred Time Assets module');
const result = { baselineAt: manifest.createdAt, compared: manifest.files.length, changed, deferredTimeAssetsChanged: false };
fs.writeFileSync('verification/stability-20261020/source-diff.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
