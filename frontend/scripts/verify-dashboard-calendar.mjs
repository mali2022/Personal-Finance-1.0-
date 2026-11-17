import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage(); const errors = []; let aiRequests=0;
page.on('pageerror', e => errors.push(e.message));
const month = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const account = {id:'cash',name:'测试账户',type:'Cash',currency:'CNY',balance:'800.00',status:'Active'};
const item = { id:'sample', type:'Expense',amount:'25.00',currency:'CNY',accountId:'cash',categoryId:'food',merchant:'日历测试商户',occurredAt:`${month}-02T12:00:00+08:00`,status:'Confirmed',splits:[],tagIds:[],note:'',fee:'0.00'};
await page.route('**/api/**', async route => {
 const path = new URL(route.request().url()).pathname; let data = {};
 if(path === '/api/ai/chat/stream') { aiRequests++;
   const answer={conversationId:'test-conversation',answer:'1. 消费异常：未发现足够依据。\n2. 支出增长：餐饮为主要支出分类，历史样本不足以判断增长。\n3. 高额消费：查看交易依据后核对必要性。\n4. 节省空间：可先复核可选消费，不能承诺节省金额。',model:'DeepSeek',financialDataVerified:true,sources:[{tool:'GetIncomeExpenseSummary',start:month+'-01',end:month+'-31',currency:'CNY',scope:'个人账本',source:'Report',detailLink:'/reports',queriedAt:new Date().toISOString(),data:{income:'100.00',expense:'25.00'},truncated:false}]};
   await route.fulfill({status:200,contentType:'text/event-stream',body:'event: completed\ndata: '+JSON.stringify(answer)+'\n\n'});return;
 }

 if(path === '/api/auth/me') data={id:'test',displayName:'测试',email:'test@example.test',permissions:['finance:read','finance:write']};
 else if(path === '/api/dashboard') data={month,income:'1000',expense:'25',surplus:'975',assets:'800',liabilities:'0',netWorth:'800',previousIncome:'0',previousExpense:'0',accounts:Array.from({length:5},(_,i)=>({...account,id:'account-'+i})),budget:{total:'500',used:'25',items:[]},categories:[],trend:[],recentTransactions:Array.from({length:6},(_,i)=>({...item,id:'recent-'+i}))};
 else if(path === '/api/ai/settings') data={enabled:true,configured:true,provider:'DeepSeek',privacy:{enabled:true,allowSummary:true,allowDetails:true,allowPayroll:false,allowFamily:false,allowRecognitionText:false},capabilities:{},transmission:'测试授权'};
 else if(path === '/api/reports/summary') data={points:[{period:month+'-02',income:'100.00',expense:'25.00'}]};
 else if(path === '/api/accounts') data=[account];
 else if(path === '/api/categories') data=[{id:'food',name:'餐饮',kind:'Expense',status:'Active'}];
 else if(path === '/api/transactions') data={items:[item],total:1,page:1,pageSize:100};
 else if(/conversations/.test(path)) data={items:[],total:0};
 else if(/operations/.test(path)) data=[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
});
mkdirSync('test-results/dashboard-calendar',{recursive:true});
await page.goto(process.env.DASHBOARD_VERIFY_ORIGIN || 'http://127.0.0.1:4173/');
await page.getByRole('button',{name:`${month}-02 · 1笔交易`}).click();
await expect(page.locator('.dashboard-calendar-detail').getByText('日历测试商户')).toBeVisible();
await expect(page.locator('.dashboard-calendar-day-totals').getByText('¥100.00')).toBeVisible();
await expect(page.locator('.dashboard-calendar-day-totals').getByText('¥25.00')).toBeVisible();
await page.getByText('查看分析依据（1项）').click();
await page.getByText('展开计算依据').click();
await expect(page.getByRole('link',{name:'打开财务明细'})).toHaveAttribute('href','/reports');
await page.getByText('查看分析依据（1项）').click();
await page.getByRole('button',{name:'一键追问 AI Copilot'}).click();
await expect(page.getByRole('dialog').getByText('AI 财务 Copilot',{exact:true})).toBeVisible();
await page.locator('.global-copilot-drawer .ant-drawer-close').click();
await expect(page.getByRole('dialog')).toBeHidden();
const bounds = await page.locator('.dashboard-bottom-grid > .dashboard-panel').evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; }));
if(bounds.length !== 2 || Math.abs(bounds[0].bottom-bounds[1].bottom)>1 || Math.abs(bounds[0].top-bounds[1].top)>1) throw Error('Cards not aligned '+JSON.stringify(bounds));
await page.locator('.dashboard-insights-panel').screenshot({path:'test-results/dashboard-calendar/insights-card.png'});
await page.locator('.dashboard-calendar-panel').screenshot({path:'test-results/dashboard-calendar/calendar-card.png'});
await page.screenshot({path:'test-results/dashboard-calendar/desktop.png',fullPage:true});
for(const width of [390,320]) {
 await page.setViewportSize({width,height:900});
 await expect(page.getByRole('button',{name:`${month}-02 · 1笔交易`})).toBeVisible();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error('Overflow at '+width);
 await page.screenshot({path:`test-results/dashboard-calendar/mobile-${width}.png`,fullPage:true});
}
await page.evaluate(() => localStorage.setItem('finance-ui', JSON.stringify({state:{language:'en',theme:'dark',hidden:false},version:0})));
await page.reload();
await expect(page.getByText('AI financial insights',{exact:true})).toBeVisible();
await expect(page.getByText('Daily total income',{exact:true})).toBeVisible();
await page.locator('.dashboard-insights-panel').screenshot({path:'test-results/dashboard-calendar/insights-dark-en.png'});
const beforePrivacy=aiRequests;
await page.evaluate(() => localStorage.setItem('finance-ui', JSON.stringify({state:{language:'en',theme:'dark',hidden:true},version:0})));
await page.reload();
await expect(page.getByText('Financial insights are hidden in privacy mode',{exact:true})).toBeVisible();
if(aiRequests!==beforePrivacy) throw Error('Unexpected AI request in privacy mode');
if(errors.length) throw Error(errors.join('\n'));
await browser.close(); console.log('Calendar daily transactions, desktop card alignment and 390/320px layout passed');




