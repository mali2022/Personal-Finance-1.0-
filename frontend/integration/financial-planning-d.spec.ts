import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/d-credentials.local.json',
    'utf8',
  ),
);
const database = (
  await readFile('../backend/test-results/d/database.txt', 'utf8')
).trim();
const prefix = 'D浏览器-' + Date.now();
let token: string, account: string, accountName: string;
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  version = '0',
) {
  const r = await fetch('http://127.0.0.1:5082/api' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'If-Match': version,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(r.status, `${method} ${path}`).toBe(200);
  return (await r.json()).data;
}
test.beforeAll(async () => {
  token = (await api('/auth/login', 'POST', credentials)).accessToken;
  const context = await fetch(
    'http://127.0.0.1:5082/api/verification-context',
    { headers: { Authorization: 'Bearer ' + token } },
  );
  expect((await context.json()).database).toBe(database);
  accountName = prefix + '现金';
  account = (
    await api('/accounts', 'POST', {
      name: accountName,
      type: 'Cash',
      currency: 'CNY',
      openingBalance: '1000.00',
    })
  ).id;
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const loginResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page.locator('.home-page')).toBeVisible();
  const isolated = await page.request.get('/api/verification-context', {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect((await isolated.json()).database).toBe(database);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).first().click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(option, { exact: true })
    .click();
}
test('年度平均分配尾差、版本与月度差异真实API', async ({ page }) => {
  await login(page);
  await page.goto('/budgets/annual');
  await page.getByLabel('预算年度').fill('2028');
  await page.getByLabel('预算年度').press('Tab');
  await expect(
    page.getByText('尚未设置年度预算，可创建或复制上一年的计划。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '编辑年度计划' }).click();
  await page.getByLabel('年度总额', { exact: true }).fill('100.01');
  await page.getByRole('button', { name: '平均分配12个月' }).click();
  await page.getByLabel('调整原因', { exact: true }).fill('浏览器年度分配');
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/annual-budgets/2028') &&
      r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存计划', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const plan = await api('/annual-budgets/2028');
  expect(plan.total).toBe('100.01');
  expect(
    plan.allocations.reduce(
      (n: bigint, a: { amount: string }) =>
        n + BigInt(a.amount.replace('.', '')),
      0n,
    ),
  ).toBe(10001n);
  await page
    .getByRole('button', { name: '预览差异', exact: true })
    .first()
    .click();
  await page.getByLabel('年度草稿应用原因').fill('明确人工应用');
  const applied = page.waitForResponse((r) =>
    r.url().includes('/monthly-apply'),
  );
  await page.getByRole('button', { name: '确认替换本月基础预算' }).click();
  expect((await applied).status()).toBe(200);
  expect((await api('/budgets/2028-01')).baseTotal).toBe('8.34');
  await page.screenshot({
    path: '../backend/test-results/d/annual.png',
    fullPage: true,
  });
});
test('储蓄目标创建、预览分配、释放、账户余额不变', async ({ page }) => {
  await login(page);
  await page.goto('/goals');
  await page.getByRole('button', { name: '创建目标', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill(prefix + '旅行');
  await page.getByLabel('目标金额', { exact: true }).fill('500.00');
  await page.getByRole('button', { name: '保存目标', exact: true }).click();
  await expect(page.getByText('储蓄目标已保存', { exact: true })).toBeVisible();
  const card = page
    .locator('.ant-card')
    .filter({ has: page.getByText(prefix + '旅行', { exact: true }) });
  await card.getByRole('button', { name: '管理预留', exact: true }).click();
  await choose(page, '资金账户', accountName);
  await page.getByLabel('调整金额', { exact: true }).fill('100.00');
  await page.getByLabel('调整原因', { exact: true }).fill('浏览器资金用途预留');
  await page.getByRole('button', { name: '预览分配', exact: true }).click();
  await expect(page.getByText('允许分配', { exact: true })).toBeVisible();
  const written = page.waitForResponse((r) => r.url().endsWith('/allocate'));
  await page.getByRole('button', { name: '确认调整', exact: true }).click();
  expect((await written).status()).toBe(200);
  expect(
    (await api('/accounts')).find((a: { id: string }) => a.id === account)
      .balance,
  ).toBe('1000.00');
  await choose(page, '预留操作', '释放预留');
  await choose(page, '资金账户', accountName);
  await page.getByLabel('调整金额', { exact: true }).fill('20.00');
  await page.getByLabel('调整原因', { exact: true }).fill('释放部分预留');
  const released = page.waitForResponse((r) => r.url().endsWith('/release'));
  await page.getByRole('button', { name: '确认调整', exact: true }).click();
  expect((await released).status()).toBe(200);
  await expect(page.getByText('目标变更历史', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '../backend/test-results/d/goals.png',
    fullPage: true,
  });
});
test('现金流计划真实API、图表与隐私深色', async ({ page }) => {
  await login(page);
  await page.goto('/cashflow');
  await page.getByRole('button', { name: '创建未来计划' }).click();
  await page.getByLabel('计划名称', { exact: true }).fill(prefix + '预计支出');
  await choose(page, '流出/收入账户', accountName + ' · CNY');
  await page.getByLabel('金额', { exact: true }).fill('12.34');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/cashflow/events') &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存计划', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.getByText(prefix + '预计支出', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: '财务统计图表' })).toHaveCount(2);
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await expect(page.getByRole('img', { name: '财务统计图表' })).toHaveCount(0);
  await expect(
    page.getByText('隐私模式已隐藏余额趋势、预测收支及资金缺口图表'),
  ).toBeVisible();
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('finance-ui') || '{}');
    v.state.theme = 'dark';
    localStorage.setItem('finance-ui', JSON.stringify(v));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '未来现金流' })).toBeVisible();
  await page.screenshot({
    path: '../backend/test-results/d/cashflow-dark-private.png',
    fullPage: true,
  });
  expect(
    (await api('/accounts')).find((a: { id: string }) => a.id === account)
      .balance,
  ).toBe('1000.00');
});
test('应急规则与明确目标分析', async ({ page }) => {
  await login(page);
  await page.goto('/planning/indicators');
  await expect(
    page.getByRole('heading', { name: '应急储备与储蓄率' }),
  ).toBeVisible();
  await expect(page.getByText('请先明确选择应急目标')).toBeVisible();
  const options = (await api('/savings-goals?currency=CNY')).items.filter(
    (g: { type: string }) => g.type === 'Emergency',
  );
  await choose(page, '应急储备目标', options[0].name);
  await expect(page.getByText(/^覆盖月数/).first()).toBeVisible();
  await expect(page.getByText('必要性规则', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '../backend/test-results/d/emergency.png',
    fullPage: true,
  });
});
test('手机目标Drawer与现金流日期范围可操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/goals');
  await page.getByRole('button', { name: '创建目标', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill(prefix + '手机目标');
  await page.getByLabel('目标金额', { exact: true }).fill('100.00');
  await page.getByRole('button', { name: '保存目标', exact: true }).click();
  await expect(page.getByText('储蓄目标已保存', { exact: true })).toBeVisible();
  await page.goto('/cashflow');
  await choose(page, '预测范围', '未来7天');
  await expect(page.getByRole('heading', { name: '未来现金流' })).toBeVisible();
  await page.screenshot({
    path: '../backend/test-results/d/mobile.png',
    fullPage: true,
  });
});
