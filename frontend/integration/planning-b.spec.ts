import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
) as { email: string; password: string };
let token: string;
let suiteStartedAt = 0;
let account: string;
let category: string;
const prefix = 'B浏览器-' + Date.now();
const planningApiBase = process.env.FINANCE_TEST_API_BASE || 'http://127.0.0.1:5081/api';
async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(planningApiBase + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(r.status).toBe(200);
  return (await r.json()).data;
}
test.beforeAll(async () => {
  suiteStartedAt = Date.now();
  token = (await api('/auth/login', 'POST', credentials)).accessToken;
  const context = await fetch(
    planningApiBase + '/verification-context',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(context.status).toBe(200);
  expect((await context.json()).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  account = (
    await api('/accounts', 'POST', {
      name: prefix,
      type: 'Cash',
      currency: 'CNY',
      openingBalance: '1000',
    })
  ).id;
  const parent = await api('/categories', 'POST', {
    name: prefix + '父',
    kind: 'Expense',
  });
  category = (
    await api('/categories', 'POST', {
      name: prefix + '子',
      kind: 'Expense',
      parentId: parent.id,
    })
  ).id;
});
test.afterAll(async () => {
  // Preserve the real API's 10 logins/minute policy before the next test file.
  const remaining = 65000 - (Date.now() - suiteStartedAt);
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
});
async function login(page: Page, path: string) {
  await page.goto(path);
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page.locator('.home-page')).toBeVisible();
  await page.goto(path);
}
async function choose(page: Page, scope: Locator, label: string, text: string) {
  const input = scope.getByLabel(label, { exact: true });
  await input.focus();
  await input.press('ArrowDown');
  await input.fill(text);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: text })
    .last()
    .click();
}
async function confirm(page: Page) {
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  await expect(
    page.getByText('操作成功', { exact: true }).last(),
  ).toBeVisible();
}
test('周期规则表单、确认、撤销和恢复原交易', async ({ page }) => {
  await login(page, '/recurring');
  await page.getByRole('button', { name: '新增周期规则' }).click();
  const drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByLabel('名称', { exact: true }).fill(prefix + '固定支出');
  await drawer.getByLabel('金额', { exact: true }).fill('-1');
  await drawer.getByRole('button', { name: '保存规则' }).click();
  await expect(drawer.getByText('金额必须大于零，最多两位小数')).toBeVisible();
  await drawer.getByLabel('金额', { exact: true }).fill('120.25');
  await choose(page, drawer, '来源账户', prefix);
  await choose(page, drawer, '二级分类', prefix + '子');
  await drawer.getByLabel('商户 / 对象', { exact: true }).fill(prefix + '过账');
  await drawer.getByRole('button', { name: '保存规则' }).click();
  await expect(page.getByText('周期规则已保存，不会立即过账')).toBeVisible();
  let balance = (await api('/accounts')).find(
    (a: { id: string }) => a.id === account,
  ).balance;
  expect(balance).toBe('1000.00');
  await page.getByRole('button', { name: '检查到期规则' }).click();
  await expect(page.getByText('到期规则已检查，余额不变')).toBeVisible();
  await page.getByRole('tab', { name: '待确认与执行实例' }).click();
  const row = page.getByRole('row').filter({ hasText: prefix + '过账' });
  await row.getByRole('button', { name: '确认过账' }).click();
  await confirm(page);
  await expect(row.getByText('已过账', { exact: true })).toBeVisible();
  balance = (await api('/accounts')).find(
    (a: { id: string }) => a.id === account,
  ).balance;
  expect(balance).toBe('879.75');
  await row.getByRole('button', { name: /^撤\s*销$/ }).click();
  await confirm(page);
  await expect(row.getByText('已撤销', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '恢复原交易' }).click();
  await confirm(page);
  await expect(row.getByText('已过账', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '待确认与执行实例' }).click();
  await expect(row.getByText('已过账', { exact: true })).toBeVisible();
});
test('订阅价格字符串格式、改价历史与未保存保护', async ({ page }) => {
  await login(page, '/subscriptions');
  await page.getByRole('button', { name: '新增订阅' }).click();
  let drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByLabel('订阅名称').fill(prefix + '会员');
  await drawer.getByLabel('服务商').fill('实际服务测试副本');
  await drawer.getByLabel('每期费用').fill('30.50');
  await choose(page, drawer, '付款账户', prefix);
  await choose(page, drawer, '二级分类', prefix + '子');
  await drawer.getByRole('button', { name: '保存订阅' }).click();
  await expect(
    page.getByText('订阅已保存，价格历史和待确认实例已保留'),
  ).toBeVisible();
  let row = page.getByRole('row').filter({ hasText: prefix + '会员' });
  await expect(row.locator('.money')).toContainText('30.50');
  await row.getByRole('button', { name: /^编\s*辑$/ }).click();
  drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByLabel('每期费用').fill('40.25');
  await drawer.getByRole('button', { name: '保存订阅' }).click();
  await expect(
    page.getByText('订阅已保存，价格历史和待确认实例已保留').last(),
  ).toBeVisible();
  row = page.getByRole('row').filter({ hasText: prefix + '会员' });
  await row.getByRole('button', { name: '价格历史' }).click();
  await expect(
    page.locator('.ant-drawer-content').last().locator('.money'),
  ).toHaveCount(2);
  await expect(page.locator('.ant-drawer-content').last()).toContainText(
    '40.25',
  );
  await page.locator('.ant-drawer-close').last().click();
  await page.getByRole('button', { name: '新增订阅' }).click();
  await page.getByLabel('订阅名称').fill('未保存');
  await page.locator('.ant-drawer-close').last().click();
  await expect(
    page.locator('.ant-modal-confirm-title').getByText('放弃未保存的修改？'),
  ).toBeVisible();
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
});
test('手动记账自动分类预览不会立即过账', async ({ page }) => {
  const originalBalance = (await api('/accounts')).find(
    (a: { id: string }) => a.id === account,
  ).balance;
  await api('/automation-rules', 'POST', {
    name: prefix + '手动规则',
    priority: 0,
    state: 'Active',
    previewOnly: true,
    conditions: { source: 'Manual', type: 'Expense', merchantKeyword: prefix },
    actions: { categoryId: category, note: '经过确认的建议' },
  });
  await login(page, '/');
  await page.getByRole('button', { name: '记支出' }).click();
  const drawer = page.locator('.ant-drawer-content').last();
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('15');
  await choose(page, drawer, '账户', prefix);
  await drawer.getByLabel('商户 / 对象').fill(prefix + '建议');
  await drawer.getByRole('button', { name: '预览自动分类建议' }).click();
  await expect(
    page
      .locator('.ant-modal-confirm-title')
      .getByText('自动分类建议', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ant-modal-confirm')).toContainText(
    '经过确认的建议',
  );
  await page.getByRole('button', { name: '填入待确认表单' }).click();
  await expect(drawer.getByLabel('备注', { exact: true })).toHaveValue(
    '经过确认的建议',
  );
  await expect(
    drawer.getByLabel('分类', { exact: true }).locator('../..'),
  ).toContainText(prefix + '子');
  const balance = (await api('/accounts')).find(
    (a: { id: string }) => a.id === account,
  ).balance;
  expect(balance).toBe(originalBalance);
});
test('财务日历列表、周视图、深色与隐私模式', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'finance-ui',
      JSON.stringify({
        state: { hidden: true, theme: 'dark', defaultAccount: '' },
        version: 0,
      }),
    ),
  );
  await login(page, '/calendar');
  await expect(
    page.getByRole('heading', { name: '财务日历', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-theme]').first()).toHaveAttribute(
    'data-theme',
    'dark',
  );
  await expect(page.locator('.money').first()).toContainText('••••');
  const view = page.getByRole('combobox', { name: '日历视图' });
  await view.focus();
  await view.press('ArrowDown');
  await page.getByText('周视图', { exact: true }).last().click();
  await expect(page.locator('.summary-grid .ant-card')).toHaveCount(7);
  await page.screenshot({
    path: 'test-results/b/calendar-dark.png',
    fullPage: true,
  });
  await view.focus();
  await view.press('ArrowDown');
  await page.getByText('列表视图', { exact: true }).last().click();
  await expect(page.getByRole('columnheader', { name: '时间' })).toBeVisible();
});
test('手机周期录入、空状态与错误恢复', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, '/recurring');
  await page.getByRole('button', { name: '新增周期规则' }).click();
  await expect(page.getByLabel('金额', { exact: true })).toHaveAttribute(
    'inputmode',
    'decimal',
  );
  await expect.poll(async () => (await page.locator('.ant-drawer-content-wrapper').last().boundingBox())?.x ?? 100).toBeLessThan(1);
  await page.screenshot({
    path: 'test-results/b/recurring-mobile.png',
    fullPage: false,
  });
  await page.locator('.ant-drawer-close').last().click();
  await page.route('**/api/calendar-events?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { items: [], total: 0, page: 1, pageSize: 100 },
      }),
    }),
  );
  await page.goto('/calendar');
  await expect(page.getByText('所选范围暂无财务计划或执行实例')).toBeVisible();
  await page.unroute('**/api/calendar-events?*');
  await page.route('**/api/calendar-events?*', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        message: '日历范围必须在93天以内',
        code: 'INVALID_REQUEST',
      }),
    }),
  );
  await page.reload();
  await expect(page.getByText('日历范围必须在93天以内').last()).toBeVisible();
});
test('规则管理与批量预览应用保留待确认状态', async ({ page }) => {
  const note = prefix + '批量待整理';
  const rule = await api('/recurring-rules', 'POST', {
    name: note,
    currency: 'CNY',
    startLocal: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19),
    frequency: 'Month',
    interval: 1,
    timeZone: 'Asia/Shanghai',
    monthEndPolicy: 'Clamp',
    reminderDays: 3,
    state: 'Active',
    transaction: {
      type: 'Expense',
      amount: '18',
      accountId: account,
      categoryId: category,
      occurredAt: new Date().toISOString(),
      note,
      fee: '0',
    },
  });
  await api('/recurring-occurrences/generate', 'POST', {});
  const original = (await api('/accounts')).find(
    (a: { id: string }) => a.id === account,
  ).balance;
  await login(page, '/automation');
  await page.getByRole('button', { name: '新增规则' }).click();
  const drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByLabel('规则名称').fill(prefix + '批量规则');
  await drawer.getByLabel('备注关键词').fill(note);
  await drawer.getByLabel('设置商户').fill('批量确认商户');
  await drawer.getByLabel('仅预览模式').click();
  await drawer.getByRole('button', { name: '保存规则' }).click();
  await expect(page.getByText('规则已保存，不会修改已确认交易')).toBeVisible();
  await page.getByRole('tab', { name: '执行预览' }).click();
  const row = page.getByRole('row').filter({ hasText: note });
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: '预览选中实例（1）' }).click();
  await expect(page.locator('.ant-drawer-content').last()).toContainText(
    '批量确认商户',
  );
  await page.getByRole('button', { name: '确认批量应用' }).click();
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  await expect(page.getByText('已整理 1 笔，未创建实际交易')).toBeVisible();
  await expect(row).toContainText('批量确认商户');
  const occurrence = (await api('/recurring-occurrences?ruleId=' + rule.id))
    .items[0];
  expect(occurrence.state).toBe('Pending');
  expect(
    (await api('/accounts')).find((a: { id: string }) => a.id === account)
      .balance,
  ).toBe(original);
  await page.getByRole('tab', { name: '执行日志' }).click();
  await expect(page.getByText('已应用到待确认表单').first()).toBeVisible();
});
