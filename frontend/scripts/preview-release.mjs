import { spawn } from 'node:child_process';
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`构建失败：${code}`)),
    );
  });
await run([
  'node_modules/vite/bin/vite.js',
  'build',
  '--configLoader',
  'runner',
]);
const preview = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--configLoader',
    'runner',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ],
  { stdio: 'inherit' },
);
preview.on('exit', (code) => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => preview.kill(signal));
