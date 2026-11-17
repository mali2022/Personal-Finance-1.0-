import { test,expect } from './fixtures';
import type { Page } from '@playwright/test';
const conversationId='12345678-1234-1234-1234-123456789abc';
const transactionId='12345678-1234-1234-1234-123456789def';
async function prepare(page:Page,saveHistory=false){
  await page.context().route(/http:\/\/127\.0\.0\.1:\d+\/api\/cashflow\/forecast.*/,route=>route.fulfill({json:{data:{days:Array.from({length:30},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,balance:String(1000-i*10),inflow:'0.00',outflow:'10.00'})),minimum:'710.00',opening:'1000.00',inflow:'0.00',outflow:'290.00',closing:'710.00',unresolved:[],assumptions:'UI fixture: registered plans only'}}}));
  await page.context().route(/http:\/\/127\.0\.0\.1:\d+\/api\/automation-rules.*/,route=>route.fulfill({json:{data:{items:[],total:0,page:1,pageSize:20}}}));
  await page.context().route(/http:\/\/127\.0\.0\.1:\d+\/api\/ai\/.*/, async route=>{
    const url=new URL(route.request().url());
    const settings={provider:'DeepSeek',enabled:true,configured:true,model:'fixture-model',foundationVersion:1,privacy:{enabled:true,allowSummary:true,allowDetails:true,saveHistory},capabilities:{}};
    const result={conversationId,answer:'本期已核对支出38.00元。',model:'fixture-model',financialDataVerified:true,messageId:'message-id',sources:[{tool:'GetTransactions',start:'2026-10-01',end:'2026-10-31',currency:'CNY',scope:'UI fixture only',source:'FinanceService.Transactions',detailLink:'/transactions',queriedAt:'2026-10-14T00:00:00Z',data:{items:[{id:transactionId,occurredAt:'2026-10-01',amount:'38.00'}]},truncated:false}]};
    if(url.pathname.endsWith('/chat/stream')){await route.fulfill({contentType:'text/event-stream',body:`event: progress\ndata: {"stage":"Running","tool":"GetTransactions","callId":"query"}\n\nevent: delta\ndata: {"text":"fixture partial"}\n\nevent: completed\ndata: ${JSON.stringify(result)}\n\n`});return;}
    const data=url.pathname.endsWith('/settings') ? settings : url.pathname.endsWith('/'+conversationId) ? {conversation:{id:conversationId,title:'已保存会话',version:'1',archived:false,accountIds:null},items:[{id:'message-id',question:'本月支出',result,feedback:0}],total:1,page:1,pageSize:20} : {items:[],total:0};
    await route.fulfill({json:{data}});
  });
}
test('AI center has eight dedicated navigation entries and opens a side conversation',async({page})=>{
  await prepare(page);await page.goto('/ai-center');
  await expect(page.locator('#main-content').getByRole('heading',{name:'AI 智能中心',exact:true})).toBeVisible();
  await expect(page.getByText('等待预测数据',{exact:true})).toHaveCount(0);
  const aiRail=page.locator('.shell-sidebar .shell-rail button.rail-group[data-group="ai-center"]');
  await expect(aiRail).toHaveAttribute('aria-current','true');
  await expect(page.locator('.shell-panel .panel-link')).toHaveCount(8);
  await page.getByRole('button',{name:'打开侧边 Copilot'}).click();
  const drawer=page.locator('.ant-drawer-content');await expect(drawer.getByLabel('AI 问题或记账描述')).toBeVisible();
  await drawer.getByRole('button',{name:'发送问题',exact:true}).click();
  await expect(drawer.getByText('本期已核对支出38.00元。')).toBeVisible();
  await drawer.getByText('分析依据', {exact:true}).click();
  await expect(drawer.getByRole('link',{name:/交易引用/})).toHaveAttribute('href','/transactions/'+transactionId);
  await drawer.getByText('展开计算依据',{exact:true}).click();await expect(drawer.getByText('UI fixture only')).toBeVisible();
  await page.screenshot({path:'test-results/ai-center-side-copilot.png',fullPage:true});
});
test('saved conversation URL restores context and the sidebar',async({page})=>{
  await prepare(page,true);await page.goto('/ai-center/copilot?conversationId='+conversationId);
  await expect(page.getByText('本期已核对支出38.00元。')).toBeVisible();
  await expect(page.locator('.ai-chat-history')).toBeVisible();await expect(page.getByText('个人账本全部账户',{exact:true})).toBeVisible();
});
test('mobile overview stays within viewport and English labels are available',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await prepare(page);await page.goto('/ai-center');
  await expect(page.locator('#main-content').getByRole('heading',{name:'AI 智能中心',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'打开全部导航'}).click();
  await page.locator('.shell-mobile-drawer .ant-select.language-select').click();await page.locator('.ant-select-item-option-content').filter({hasText:/^English$/}).click();
  await page.locator('.shell-mobile-drawer .ant-drawer-close').click();
  await expect(page.getByRole('heading',{name:'AI finance center',exact:true})).toBeVisible();
  await expect(page.getByText('Waiting for forecast data',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:'test-results/ai-center-mobile.png',fullPage:true});
});
