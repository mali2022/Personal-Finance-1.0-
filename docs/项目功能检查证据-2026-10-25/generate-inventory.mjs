import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const output = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output, '../..');
function walk(dir) {
  if (!fs.existsSync(path.join(root, dir))) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
    if (['bin','obj','node_modules'].includes(e.name)) return [];
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(p) : [p];
  });
}
function csv(name, rows) {
  fs.writeFileSync(path.join(output, name), '\uFEFF' + rows.map(row => row.map(x => '"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n'));
}
const endpoints = [['File','Line','Method','Declaration']];
for (const file of walk('backend/src/PersonalFinance.Api').filter(f => f.endsWith('.cs'))) {
  fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/).forEach((line,i) => {
    for (const m of line.matchAll(/\.Map(Get|Post|Put|Delete|Patch|Group)\(([^,\r\n]+)/g)) endpoints.push([file,i+1,m[1],m[2]]);
  });
}
csv('后端接口声明.csv',endpoints);
const dirs=['frontend/src/pages','frontend/src/features','frontend/src/api','frontend/src/tests','frontend/e2e','frontend/integration','frontend/redesign-tests','backend/src/PersonalFinance.Api/Application','backend/src/PersonalFinance.Api/Domain','backend/tests'];
const files=dirs.flatMap(walk);
csv('源码与测试清单.csv',[['File','Kind'],...files.map(f=>[f,/tests|e2e|integration/i.test(f)?'Test':'Source'])]);
const routes=['frontend/src/routes/index.tsx','frontend/src/design/navigation.ts','frontend/src/features/reports/sections.ts','frontend/src/features/financialReports/sections.ts'];
fs.writeFileSync(path.join(output,'前端路由来源.md'),'# 前端路由来源\n\n2026-10-25 静态源码快照；包含嵌套路由、动态目录及兼容别名。\n\n'+routes.map(f=>'## '+f+'\n\n```tsx\n'+fs.readFileSync(path.join(root,f),'utf8')+'\n```\n').join('\n'));
console.log(JSON.stringify({endpointDeclarations:endpoints.length-1,sourceAndTestFiles:files.length}));
