import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('src');const entries=new Map();
function scan(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory()){if(!['tests','mocks','i18n'].includes(name))scan(file);continue;}if(!/\.tsx?$/.test(name))continue;const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);function visit(n){if(ts.isCallExpression(n)&&['t','tr','localizedLabels'].includes(n.expression.getText(source)))return;if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n))&&/[\u3400-\u9fff]/.test(n.text)){const text=n.text.trim();entries.set(text,[...(entries.get(text)||[]),path.relative(root,file)]);}ts.forEachChild(n,visit);}visit(source);}}
scan(root);fs.mkdirSync('test-results/profile',{recursive:true});fs.writeFileSync('test-results/profile/i18n-inventory.json',JSON.stringify([...entries].map(([text,files])=>({text,files:[...new Set(files)]})),null,2));console.log(entries.size+' unique Chinese strings');
