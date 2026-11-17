import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),destination=path.join(root,'.local-run/stability-20261020/baseline');
if(fs.existsSync(destination))throw Error('Baseline already exists; never overwrite audit evidence');
const excluded=new Set(['bin','obj','node_modules','.keys','dist','out','.git']);
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())walk(p);else if(!/credentials|appsettings\.Local|\.env|\.key$|\.pem$|\.pfx$|\.bak$/i.test(e.name))files.push(p);}}
for(const dir of ['frontend/src','frontend/scripts','backend/src','backend/tests','deploy/scripts','.github','tools'])walk(path.join(root,dir));
for(const f of ['AGENTS.md','.gitignore','frontend/package.json','frontend/pnpm-lock.yaml','frontend/eslint.config.js','frontend/vitest.config.ts','frontend/vite.config.ts','backend/NuGet.Config'])files.push(path.join(root,f));
const manifest=[];for(const p of [...new Set(files)].sort()){const name=path.relative(root,p),out=path.join(destination,name),bytes=fs.readFileSync(p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,bytes);manifest.push({path:name.replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(destination,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:manifest},null,2));console.log(JSON.stringify({snapshot:'.local-run/stability-20261020/baseline',files:manifest.length}));
