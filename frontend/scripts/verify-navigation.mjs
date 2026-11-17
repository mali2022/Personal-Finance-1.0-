import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const results=[];
const profile={id:'navigation-test',displayName:'导航测试',email:'navigation@example.test',preferredCurrency:'EUR',version:1,language:'zh-CN',timeZone:'Asia/Shanghai',gender:'Unspecified',country:'',region:'',city:'',occupation:'',bio:'',realName:'',phone:'',birthday:null};
async function prepare(viewport) {
 const page=await browser.newPage({viewport});page.on('pageerror',error=>console.log('PAGE ERROR '+error.message));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR '+m.text().slice(0,600));});
 await page.route(/^http:\/\/127\.0\.0\.1:5181\/api\//,async route=>{const u=new URL(route.request().url());let data=[];
 if(u.pathname.endsWith('/auth/me'))data={...profile,permissions:['admin:manage']};
 else if(u.pathname.endsWith('/auth/profile'))data=profile;
 else if(u.pathname.endsWith('/auth/refresh'))data={accessToken:'navigation-test-token'};
 else if(u.pathname.endsWith('/transactions')||u.pathname.endsWith('/recurring'))data={items:[],total:0,page:1,pageSize:20};
 else if(u.pathname.endsWith('/ai/settings'))data={enabled:false,configured:false,provider:'DeepSeek',privacy:{enabled:false},capabilities:{}};
 await route.fulfill({json:{data}});
 });return page;
}
try {
 const desktop=await prepare({width:1440,height:900});await desktop.goto('http://127.0.0.1:5181/help');
 const nav=desktop.getByRole('navigation',{name:'桌面功能导航'});try{await nav.waitFor({timeout:10000});}catch(error){console.log('BODY '+(await desktop.locator('body').innerText()).slice(0,1500));await desktop.screenshot({path:'verification/navigation/failure.png'});throw error;}
 const titles=nav.locator('.ant-menu-submenu-title');await titles.first().waitFor();
 const expected=['总览','交易中心','账户与资产','薪酬与社保','预算与计划','分析与报告','AI 智能中心','专项财务'];
 const labels=(await titles.allTextContents()).map(x=>x.trim());if(JSON.stringify(labels)!==JSON.stringify(expected))throw Error('wrong groups '+JSON.stringify(labels));
 await desktop.screenshot({path:'verification/navigation/desktop.png'});
 for(let i=0;i<8;i++)if(await titles.nth(i).getAttribute('aria-expanded')!=='true')await titles.nth(i).click();
 await nav.getByRole('menuitem',{name:'代买代付',exact:true}).waitFor();
 const menuLabels=(await nav.getByRole('menuitem').allTextContents()).map(x=>x.trim());if(new Set(menuLabels).size!==menuLabels.length)throw Error('duplicate desktop menu');
 const settings=desktop.locator('.sidebar-footer').getByRole('link',{name:'设置与管理'});const before=await settings.boundingBox();await nav.locator('.shell-feature-menu').evaluate(el=>{el.scrollTop=el.scrollHeight;});const after=await settings.boundingBox();if(!before||!after||Math.abs(before.y-after.y)>1||after.y+after.height>900)throw Error('settings not fixed');
 await desktop.screenshot({path:'verification/navigation/desktop-expanded.png',fullPage:false});
 await desktop.getByRole('button',{name:'折叠侧边导航'}).click();await settings.waitFor();await desktop.getByRole('button',{name:'展开侧边导航'}).click();
 await desktop.goto('http://127.0.0.1:5181/ai-center/assets?currency=EUR#nav');await desktop.waitForURL('**/accounts?currency=EUR#nav');
 await desktop.getByRole('navigation',{name:'桌面功能导航'}).getByRole('menuitem',{name:'账户管理',exact:true}).waitFor();
 await desktop.getByRole('button',{name:'用户菜单'}).click();await desktop.locator('.ant-dropdown').getByRole('menuitem').filter({hasText:'设置与管理'}).click();await desktop.waitForURL('**/settings');
 await desktop.locator('main').getByRole('link',{name:'后台管理',exact:true}).waitFor();const settingLinks=desktop.locator('main').getByRole('link');const hrefs=await settingLinks.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));if(hrefs.includes('/accounts')||hrefs.filter(x=>x==='/admin').length!==1)throw Error('settings duplicates business routes or admin');
 results.push({surface:'desktop',groups:8,uniqueMenus:menuLabels.length,fixedSettings:true,legacyRedirect:true,avatarSettings:true,adminAccess:true});await desktop.close();
 const mobile=await prepare({width:390,height:844});await mobile.goto('http://127.0.0.1:5181/help');await mobile.locator('.mobile-nav').getByRole('button',{name:'打开全部功能'}).click();
 const drawer=mobile.getByRole('dialog',{name:'全部功能',exact:true});await drawer.waitFor();const mnav=drawer.getByRole('navigation',{name:'手机功能导航'});const mtitles=mnav.locator('.ant-menu-submenu-title');await mobile.waitForFunction(()=>{const panel=document.querySelector('.shell-mobile-drawer .ant-drawer-content-wrapper');return panel && Math.abs(panel.getBoundingClientRect().x)<1;});await mobile.screenshot({path:'verification/navigation/mobile.png'});for(let i=0;i<8;i++)if(await mtitles.nth(i).getAttribute('aria-expanded')!=='true')await mtitles.nth(i).click();
 await mnav.getByRole('menuitem',{name:'代买代付',exact:true}).waitFor();
 const mlabels=(await mnav.getByRole('menuitem').allTextContents()).map(x=>x.trim());if(new Set(mlabels).size!==mlabels.length)throw Error('duplicate mobile menu');
 const msettings=drawer.locator('.ant-drawer-footer').getByRole('link',{name:'设置与管理'});await msettings.waitFor();const box=await msettings.boundingBox();if(!box||box.y+box.height>844)throw Error('mobile footer off screen');
 if(await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('mobile horizontal overflow');await mobile.screenshot({path:'verification/navigation/mobile-expanded.png'});
 await msettings.click();await mobile.waitForURL('**/settings');await drawer.waitFor({state:'hidden'});
 results.push({surface:'mobile',groups:8,uniqueMenus:mlabels.length,fixedSettings:true,noHorizontalOverflow:true,settingsClosesDrawer:true});await mobile.close();
 fs.writeFileSync('verification/navigation/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}


