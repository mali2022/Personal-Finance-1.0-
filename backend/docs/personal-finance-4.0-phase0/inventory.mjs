import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Read source only. Never connect to SQL, start the application, or read secrets.
const output = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output, '../../..');
const apiRoot = path.join(root, 'backend/src/PersonalFinance.Api');
const relative = p => path.relative(root, p).replaceAll('\\', '/');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['bin', 'obj', 'node_modules', 'dist', '.keys', 'TestResults'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}
const routes = [];
for (const file of files(path.join(apiRoot, 'Application')).filter(p => p.endsWith('Endpoints.cs') || p.endsWith('RuntimeHealth.cs'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(app|api|group)\.Map(Get|Post|Put|Patch|Delete)\(([^,\n]+),/g)) {
    const [, receiver, method, expression] = match;
    const prefix = receiver === 'app' ? '' : receiver === 'group' ? '/api/ai' : '/api';
    let paths;
    if (expression.includes('type.ToLowerInvariant()')) {
      const base = expression.match(/^"([^"]+)"/)[1];
      paths = ['Expense', 'Income', 'Transfer', 'Refund', 'CreditCardPayment', 'AssetLoss'].map(t => prefix + base + t.toLowerCase());
    } else if (/^path(?:\s*\+\s*"\/\{id\}")?$/.test(expression)) {
      paths = ['/housing-fund', '/social-contributions'].map(p => prefix + p + (expression.includes('{id}') ? '/{id}' : ''));
    } else if (/^"[^"]+"$/.test(expression.trim())) paths = [prefix + JSON.parse(expression.trim())];
    else paths = [prefix + '[UNRESOLVED:' + expression + ']'];
    for (const route of paths) routes.push({ method: method.toUpperCase(), path: route, source: relative(file), line: source.slice(0, match.index).split('\n').length,
      authorization: receiver === 'app' ? 'endpoint-specific; inspect source' : 'authenticated group', expression });
  }
}
const snapshotFile = path.join(apiRoot, 'Infrastructure/Migrations/FinanceDbModelSnapshot.cs');
const snapshot = fs.readFileSync(snapshotFile, 'utf8');
const entities = new Map();
for (const match of snapshot.matchAll(/modelBuilder\.Entity\("([^"]+)", b =>\s*\{([\s\S]*?)\n\s*\}\);/g)) {
  const name = match[1].split('.').at(-1), body = match[2];
  const entity = entities.get(name) ?? { entity: name, tables: [], columns: [], foreignKeys: [] };
  for (const t of body.matchAll(/b\.ToTable\("([^"]+)"(?:, "([^"]+)")?/g)) entity.tables.push({ name: t[1], schema: t[2] ?? 'finance' });
  for (const p of body.matchAll(/b\.Property<([^>]+)>\("([^"]+)"\)([\s\S]*?);/g)) entity.columns.push({ name: p[2], clrType: p[1], sqlType: p[3].match(/HasColumnType\("([^"]+)"\)/)?.[1] ?? null });
  for (const fk of body.matchAll(/b\.HasOne\("([^"]+)",[^\n]*\)([\s\S]*?);/g)) entity.foreignKeys.push({ principal: fk[1].split('.').at(-1), properties: [...(fk[2].match(/HasForeignKey\(([^)]+)\)/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(p => p[1]), deleteBehavior: fk[2].match(/OnDelete\(DeleteBehavior\.(\w+)\)/)?.[1] ?? 'EF default' });
  entities.set(name, entity);
}
const migrations = files(path.join(apiRoot, 'Infrastructure/Migrations')).filter(p => /\d{14}_.*\.cs$/.test(p) && !p.endsWith('.Designer.cs')).map(relative).sort();
const sourceFiles = [...files(path.join(apiRoot, 'Application')), ...files(path.join(apiRoot, 'Domain')), ...files(path.join(apiRoot, 'Infrastructure')),
  ...files(path.join(root, 'frontend/src')), path.join(apiRoot, 'Program.cs'), path.join(apiRoot, 'PersonalFinance.Api.csproj'), path.join(root, 'frontend/package.json')]
  .filter(p => /\.(cs|tsx?|json|csproj)$/.test(p) && !p.includes('credentials') && !p.includes('appsettings'));
const manifest = sourceFiles.map(p => ({ path: relative(p), sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') }));
const inventory = { generatedAt: new Date().toISOString(), scope: 'Static source and EF snapshot; not deployed SQL schema or runtime endpoint enumeration', routes, entities: [...entities.values()], migrations, manifest };
fs.writeFileSync(path.join(output, 'source-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
const er = ['erDiagram'];
for (const entity of entities.values()) for (const fk of entity.foreignKeys) {
  // Source snapshot does not establish business cardinality; use conservative optional-many notation.
  er.push(`    ${fk.principal} o|--o{ ${entity.entity} : "${fk.properties.join(',')}"`);
}
fs.writeFileSync(path.join(output, 'schema-full.mmd'), er.join('\n') + '\n');
fs.writeFileSync(path.join(output, 'Personal Finance 测试版 3.0.0 - 074 - Personal Finance 测试版 3.0.0 - 082 - API清单.md'), '# 当前 API 静态清单\n\n依据 `Application/*Endpoints.cs` 与 `RuntimeHealth.cs` 提取；已展开交易类型与社保/公积金循环。参数化路径保留占位符。不是 OpenAPI 或运行时验收；具体输入契约见 `Contracts` 与服务验证。`/api/verification-context` 仅在隔离验证模式注册，另见 `Program.cs`，不列为正式接口。\n\n认证：普通 `api` 路由组均要求登录；AI 路由组还限流。`/api/auth/*` 公开入口与 `/api/health` 的访问策略见源文件。大部分 JSON 成功响应为 `{data,traceId}`；文件和 SSE 例外。金额通常为字符串；写操作的幂等/If-Match 要求须逐接口核查。\n\n| 方法 | 路径 | 源文件:行 |\n| --- | --- | --- |\n' + routes.map(r => `| ${r.method} | \`${r.path}\` | \`${r.source}:${r.line}\` |`).join('\n') + '\n');
console.log(JSON.stringify({ routes: routes.length, unresolvedRoutes: routes.filter(r => r.path.includes('UNRESOLVED')).length, entities: entities.size, tables: [...entities.values()].flatMap(e => e.tables).length, foreignKeys: [...entities.values()].flatMap(e => e.foreignKeys).length, migrations: migrations.length, manifestFiles: manifest.length }));
