import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const operation = process.argv[2];
if (operation === 'receipts') {
  const shas = process.argv[3].split(',').filter(Boolean);
  if (shas.some(sha => !/^[a-f0-9]{40}$/.test(sha))) throw Error('Invalid receipt SHA');
  const file = 'verification/stability-next-20261020/github-uploaded.json';
  const combined = [...new Set([...(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []), ...shas])];
  fs.writeFileSync(file, JSON.stringify(combined));
  console.log(JSON.stringify({ uploaded: combined.length }));
} else if (operation === 'text-batch') {
  const shas = process.argv[3].split(',').filter(Boolean);
  const result = {};
  for (const sha of shas) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid Git blob SHA');
    const bytes = execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 30 * 1024 * 1024 });
    const content = bytes.toString('utf8');
    if (!Buffer.from(content).equals(bytes) || content.includes('\0')) throw Error('Binary blob needs base64 upload');
    result[sha] = content;
  }
  console.log(JSON.stringify(result));
} else if (operation === 'manifest') {
  const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { maxBuffer: 4 * 1024 * 1024 }).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) ([a-f0-9]{40}) 0\t(.*)$/s);
    if (!match) throw Error('Unmerged index entry');
    return { path: match[3], mode: match[1], sha: match[2], type: 'blob' };
  });
  const sizes = new Map(execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objectsize)'], { input: entries.map(entry => entry.sha).join('\n') + '\n', maxBuffer: 4 * 1024 * 1024 }).toString().trim().split('\n').map(line => { const [sha, size] = line.split(' '); return [sha, Number(size)]; }));
  console.log(JSON.stringify({ treeSha: execFileSync('git', ['write-tree']).toString().trim(), entries: entries.map(entry => ({ ...entry, bytes: sizes.get(entry.sha) })) }));
} else if (operation === 'blob' || operation === 'text' || operation === 'chunk') {
  const sha = process.argv[3];
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid Git blob SHA');
  const bytes = execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 30 * 1024 * 1024 });
  const offset = Number(process.argv[4] ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid chunk offset');
  const content = operation === 'text' ? bytes.toString('utf8') : bytes.toString('base64');
  console.log(JSON.stringify({ sha, bytes: bytes.length, content: operation === 'chunk' ? content.slice(offset, offset + 262144) : content }));
} else throw Error('Expected manifest, blob or text');
