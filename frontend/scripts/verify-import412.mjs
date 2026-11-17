import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const seed=JSON.parse(await readFile('../.local-run/import412-browser-fixture.json','utf8'));
const out='../.local-run/import412-proof';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5188/login');await page.getByLabel('邮箱',{exact:true}).fill(seed.email);await page.getByLabel('密码',{exact:true}).fill(seed.password);await page.getByRole('button',{name:/^登\s*录$/}).click();
 await expect(page).not.toHaveURL(/\/login/);await page.goto('http://127.0.0.1:5188/import?job='+seed.jobId);
 const panel=page.locator('.ant-card').filter({hasText:'数据清洗与识别 · 4.1.2'}).first();await expect(panel).toBeVisible();
 await expect(page.getByRole('button',{name:'AI 识别当前页（最多20行）'})).toBeDisabled();
 await panel.screenshot({path:out+'/desktop-cleaning.png'});
 await page.getByText(/清洗履历（/).click();await expect(page.getByRole('button',{name:'下载原始账单'})).toBeEnabled();await panel.screenshot({path:out+'/desktop-trace.png'});
 await page.goto('http://127.0.0.1:5188/merchants');await page.getByRole('button',{name:'商户主数据与别名'}).click();const master=page.getByRole('dialog',{name:'统一商户名称与主数据'});await expect(master.getByText('北山咖啡门店',{exact:true})).toBeVisible();await master.screenshot({path:out+'/desktop-merchants.png'});
 await master.locator('button.ant-drawer-close').click();await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const v=JSON.parse(localStorage.getItem('finance-ui')||'{"state":{}}');v.state.theme='dark';localStorage.setItem('finance-ui',JSON.stringify(v));});
 await page.goto('http://127.0.0.1:5188/import?job='+seed.jobId);await expect(page.getByText('数据清洗与识别 · 4.1.2',{exact:true})).toBeVisible();await page.getByText('数据清洗与识别 · 4.1.2',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/mobile-dark-cleaning.png'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
 await page.evaluate(()=>{const v=JSON.parse(localStorage.getItem('finance-ui'));v.state.hidden=true;localStorage.setItem('finance-ui',JSON.stringify(v));});await page.reload();await expect(page.getByText('数据清洗与识别 · 4.1.2',{exact:true})).toBeVisible();
 await page.getByText(/清洗履历（/).click();await page.getByRole('row').filter({has:page.getByRole('cell',{name:'1',exact:true})}).filter({hasText:'规则清洗'}).getByRole('button',{name:'查看前后值'}).click();const evidence=page.getByRole('dialog',{name:'清洗前后值与依据'});await expect(evidence).not.toContainText('原始备注');
 await page.screenshot({path:out+'/mobile-private-trace.png'});expect(errors).toEqual([]);
 await writeFile(out+'/proof.json',JSON.stringify({realIsolatedApi:true,desktop:true,mobileDark:true,noDocumentOverflow:true,privacyHidesSourceValues:true,aiRequiresConsent:true,pageErrors:errors},null,2));console.log('4.1.2 isolated browser checks passed');
}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true});throw e;}finally{await browser.close();}
