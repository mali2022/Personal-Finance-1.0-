import fs from 'node:fs';
for(const f of fs.readdirSync('frontend/e2e').filter(f=>f.endsWith('.ts'))){
 const p='frontend/e2e/'+f;let s=fs.readFileSync(p,'utf8');
 s=s.replaceAll("'交易与账户'","'交易中心'").replaceAll('.shell-mobile-drawer .language-select','.shell-mobile-drawer .ant-select.language-select').replaceAll("locator('.language-select')","locator('.ant-select.language-select:visible').first()");
 if(f==='ai-phase1.spec.ts')s=s.replace("page.goto('/ai')","page.goto('/ai-center/copilot')");
 if(f==='ai-center.spec.ts')s=s.replace('AI center has fourteen modules and opens a bordered side conversation','AI center has eight dedicated navigation entries and opens a side conversation').replace('toHaveCount(14)','toHaveCount(8)');
 if(f==='final.spec.ts')s=s.replace("await page.getByRole('button', { name: '记录资产损失' }).click();","await page.getByRole('button', { name: /记一笔/ }).click();\n  await page.getByRole('menuitem', { name: '资产损失', exact: true }).click();");
 fs.writeFileSync(p,s);
}
