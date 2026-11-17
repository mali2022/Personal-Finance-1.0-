import { build } from 'vite';
import fs from 'node:fs';
if (!process.env.BUNDLE_REPORT) throw Error('BUNDLE_REPORT is required');
await build({ configLoader: 'runner', plugins: [{ name: 'local-bundle-audit', generateBundle(_options, bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({ file: item.fileName, entry: item.isEntry, bytes: Buffer.byteLength(item.code), imports: item.imports, modules: Object.entries(item.modules).map(([id, value]) => ({ id: id.replaceAll('\\', '/').replace(/^.*\/frontend\//, 'frontend/'), bytes: value.renderedLength })).sort((a, b) => b.bytes - a.bytes) }));
  fs.writeFileSync(process.env.BUNDLE_REPORT, JSON.stringify(chunks, null, 2));
} }] });
