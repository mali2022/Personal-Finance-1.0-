import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../src/data/releases.json',import.meta.url),'utf8'));
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let signed=false;let revoked=false;const code='PF-'+'A'.repeat(64);let invitations=[];
const user={id:'test-admin',email:'admin@example.test',displayName:'测试管理员',permissions:['finance:read','finance:write','admin:manage']};
await page.route('**/api/**',async route=>{const req=route.request();const p=new URL(req.url()).pathname;let data={};let status=200;
 if(p==='/api/auth/options')data={registrationEnabled:false,invitationActivationEnabled:true};
 else if(p==='/api/auth/csrf') {await route.fulfill({status:204,headers:{'set-cookie':'XSRF-TOKEN=test; Path=/'}});return;}
 else if(p==='/api/auth/me'){if(signed)data=user;else status=401;}
 else if(p==='/api/auth/refresh')status=401;
 else if(p==='/api/auth/login'){signed=true;data={user,accessToken:'test-token'};}
 else if(p==='/api/auth/invitations/validate'){const b=req.postDataJSON();if(b.code!==code){await route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({code:'INVITATION_USED',message:'邀请码已使用，请使用账号密码登录'})});return;}data={valid:true};}
 else if(p==='/api/admin/invitations'&&req.method()==='POST'){invitations=[{id:'invite-id',boundEmail:req.postDataJSON().email,status:'Active',expiresAt:req.postDataJSON().expiresAt,version:'1'}];data={code,invitation:invitations[0]};}
 else if(p==='/api/admin/invitations')data={items:invitations,total:invitations.length};
 else if(p.endsWith('/revoke')){revoked=true;invitations[0].status='Revoked';data=invitations[0];}
 else if(p==='/api/admin/overview')data={users:2,activeSessions:1,openTickets:0,resolvedTickets:0};
 else if(p==='/api/admin/tickets'||p==='/api/admin/audit'||p==='/api/admin/users')data={items:[],total:0};
 else if(/accounts|categories|operations/.test(p))data=[];
 else if(/conversations/.test(p))data={items:[],total:0};
 else if(p==='/api/ai/settings')data={enabled:false,configured:false,privacy:{enabled:false}};
 else if(p==='/api/dashboard')data={month:'2026-10',income:'0',expense:'0',surplus:'0',assets:'0',liabilities:'0',netWorth:'0',previousIncome:'0',previousExpense:'0',accounts:[],budget:{total:'0',used:'0',items:[]},categories:[],trend:[],recentTransactions:[]};
 else if(p==='/api/reports/summary')data={points:[]};
 else if(p==='/api/transactions')data={items:[],total:0,page:1,pageSize:100};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===401?{message:'请先登录',code:'UNAUTHORIZED'}:{data})});
});
const origin=process.env.INVITATION_VERIFY_ORIGIN||'http://127.0.0.1:4173';mkdirSync('test-results/invitations',{recursive:true});
await page.goto(origin+'/login');await expect(page.getByText('Personal Finance 测试版 4.0.1',{exact:true})).toBeVisible();
await expect(page.getByText('发布号：'+catalog.currentVersion,{exact:true})).toBeVisible();
await page.getByRole('link',{name:'持有邀请码？激活进入'}).click();await expect(page.getByLabel('邀请码',{exact:true})).toBeVisible();
await page.getByLabel('邮箱',{exact:true}).fill('invited@example.test');await page.getByLabel('邀请码',{exact:true}).fill('PF-'+'B'.repeat(64));
await page.getByRole('button',{name:/验证邀请码/}).click();await expect(page.getByText('邀请码已使用，请使用账号密码登录',{exact:true})).toBeVisible();
await page.getByLabel('邀请码',{exact:true}).fill(code);await page.getByRole('button',{name:/验证邀请码/}).click();await expect(page.getByText('邀请码有效，提交激活时将再次核验',{exact:true})).toBeVisible();
await page.screenshot({path:'test-results/invitations/activation-desktop.png',fullPage:true});
for(const width of [390,320]) {await page.setViewportSize({width,height:950});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Activation overflow '+width);await page.screenshot({path:`test-results/invitations/activation-${width}.png`,fullPage:true});}
await page.goto(origin+'/login');await page.getByLabel('邮箱',{exact:true}).fill('admin@example.test');await page.getByLabel('密码',{exact:true}).fill('Password-123456');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(origin+'/');
await page.goto(origin+'/admin');await page.getByRole('tab',{name:'邀请码管理',exact:true}).click();await page.getByLabel('绑定邮箱（选填）').fill('invited@example.test');await page.getByRole('button',{name:'生成邀请码',exact:true}).click();await expect(page.getByRole('dialog').getByText(code,{exact:true})).toBeVisible();await page.getByRole('button',{name:'我已保存，关闭'}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.getByText(code,{exact:true})).toHaveCount(0);
await page.getByRole('button',{name:/撤\s*销/}).click();await page.getByRole('button',{name:'确 定',exact:true}).click();await expect(page.getByText('已撤销',{exact:true})).toBeVisible();if(!revoked)throw Error('Revocation not sent');
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Admin mobile overflow');
await page.screenshot({path:'test-results/invitations/admin-mobile.png',fullPage:true});
signed=false;await page.evaluate(()=>localStorage.setItem('finance-ui',JSON.stringify({state:{language:'en',theme:'dark',hidden:false},version:0})));await page.goto(origin+'/login');await expect(page.getByText('Personal Finance Beta 4.0.1',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Have an invitation? Activate your account'})).toBeVisible();await page.screenshot({path:'test-results/invitations/login-dark-en.png',fullPage:true});
if(errors.length)throw Error(errors.join('\n'));writeFileSync('test-results/invitations/browser-proof.json',JSON.stringify({release:catalog.currentVersion,activation:true,validation:true,adminCreation:true,revoke:true,oneTimeDisplay:true,widths:[1440,390,320],englishDark:true,pageErrors:errors},null,2));await browser.close();console.log('Invitation UI, status errors, one-time code, revoke, mobile, English/dark, shared version passed');



