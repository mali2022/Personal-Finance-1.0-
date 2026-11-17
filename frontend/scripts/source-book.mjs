import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const entries = [];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) await collect(absolute);
    else entries.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
}
for (const dir of ['src', 'e2e', 'integration', 'scripts', 'deploy'])
  await collect(path.join(root, dir));
entries.push(
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'playwright.integration.config.ts',
  'eslint.config.js',
  '.prettierrc.json',
  '.env.development',
  '.env.production',
  '.env.integration',
  '.gitignore',
  'index.html',
  'README.md',
  '.env.example',
  'Dockerfile',
  '.dockerignore',
  '../.github/workflows/frontend.yml',
  'public/manifest.webmanifest',
  'public/offline.html',
  'public/import-template.csv',
);
const languages = {
  ts: 'ts',
  tsx: 'tsx',
  css: 'css',
  json: 'json',
  js: 'js',
  mjs: 'js',
  html: 'html',
  md: 'markdown',
};
let output =
  '# Personal Finance · 完整项目代码\n\n此文档由 `node scripts/source-book.mjs` 生成。每个文件按路径列出完整源码。当前为前端 1.0，包含阶段一至四和最终收尾。真实 ASP.NET Core 后端与增强项见最终验收清单。MSW worker 为官方生成文件，请使用 `msw init public` 更新；依赖锁文件见 pnpm-lock.yaml。\n\n';
for (const file of entries.sort()) {
  const source = await readFile(path.join(root, file), 'utf8');
  output += `## ${file}\n\n\`\`\`\`${languages[file.split('.').pop()] || 'text'}\n${source.trimEnd()}\n\`\`\`\`\n\n`;
}
await writeFile(path.join(root, 'docs', 'Personal Finance 测试版 1.0.0 - 008 - 完整代码.md'), output, 'utf8');
console.log(`已输出 ${entries.length} 个完整源码文件。`);
