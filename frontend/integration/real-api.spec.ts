import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
) as { email: string; password: string };
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page.locator('.home-page')).toBeVisible();
}
async function choose(page: Page, label: string, option: string) {
  const selector = page
    .locator('.ant-drawer-body')
    .getByLabel(label, { exact: true });
  await selector.focus();
  await selector.press('ArrowDown');
  if (label.includes('账户') || label === '分类')
    await page
      .locator('.ant-drawer-body')
      .getByLabel(label, { exact: true })
      .fill(option.split(' ·')[0]);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: option })
    .last()
    .click();
}
test('真实支出、编辑、删除、恢复与刷新持久化', async ({ page }) => {
  await login(page);
  const merchant = 'SQL浏览器午餐-' + Date.now();
  await page.getByRole('button', { name: '记支出' }).click();
  let drawer = page.locator('.ant-drawer-content').last();
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('25.50');
  await choose(page, '分类', '日常午餐');
  await drawer.getByLabel('商户 / 对象').fill(merchant);
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).last()).toBeVisible();
  await page.goto('/transactions?keyword=' + encodeURIComponent(merchant));
  await expect(page.getByText(merchant, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(merchant, { exact: true })).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: merchant })
    .getByRole('button', { name: '详情' })
    .click();
  await page.getByRole('button', { name: /^编\s*辑$/ }).click();
  drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByPlaceholder('0.00').first().fill('26');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: /^删\s*除$/ }).click();
  const deletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.startsWith('/api/transactions/'),
  );
  await page.getByRole('button', { name: '确认删除' }).click();
  expect((await deletion).status()).toBe(200);
  await expect(page.getByText('操作成功')).toBeVisible();
  await page.goto(
    '/transactions?status=Deleted&keyword=' + encodeURIComponent(merchant),
  );
  await page
    .getByRole('row')
    .filter({ hasText: merchant })
    .getByRole('button', { name: '详情' })
    .click();
  await page.getByRole('button', { name: '恢复交易' }).click();
  await expect(page.getByText('操作成功')).toBeVisible();
});
test('真实收入和转账可保存', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '记收入' }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('100');
  await choose(page, '分类', '工资收入 / 工资');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: '账户间转账' }).click();
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('20');
  await choose(page, '转入账户', '银行卡 ·');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).last()).toBeVisible();
});
test('真实退款来源、额度与保存', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /^退\s*款$/ }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('1');
  await drawer.getByLabel('原消费交易').click();
  await drawer.getByLabel('原消费交易').fill('SQL浏览器午餐-');
  await page.locator('.ant-select-item-option-content').first().click();
  await expect(page.getByText('已退款', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
test('后端保存成功后不等待首页刷新才反馈', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '记支出', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('1.23');
  await choose(page, '分类', '日常午餐');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refreshing = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/dashboard',
  );
  await page.route('**/api/dashboard**', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
    await refreshing;
    await expect(page.getByText('已保存', { exact: true }).last()).toBeVisible({
      timeout: 5000,
    });
    await expect(drawer).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('所有真实页面加载与手机记账', async ({ page }) => {
  await login(page);
  const errors: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(r.url());
  });
  for (const url of [
    '/accounts',
    '/categories',
    '/budgets',
    '/reports',
    '/projects',
    '/merchants',
    '/loans',
    '/reimbursements',
    '/import',
    '/settings',
  ]) {
    await page.goto(url);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .locator('.mobile-nav')
    .getByRole('button')
    .filter({ hasText: '记账' })
    .click();
  await expect(
    page.locator('.ant-drawer-content').getByPlaceholder('0.00').first(),
  ).toBeFocused();
  await page.screenshot({
    path: 'test-results/real-api/mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
