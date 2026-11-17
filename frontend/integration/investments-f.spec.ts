import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
);
test.beforeEach(async ({ page }) => {
  const r = await page.request.post('http://127.0.0.1:5086/api/auth/login', {
    data: credentials,
  });
  expect(r.status()).toBe(200);
  const context = await page.request.get(
    'http://127.0.0.1:5086/api/verification-context',
    {
      headers: { Authorization: 'Bearer ' + (await r.json()).data.accessToken },
    },
  );
  expect((await context.json()).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.locator('.home-page')).toBeVisible();
});
test('投资档案、移动隐私', async ({ page }) => {
  const stamp = Date.now();
  const accountName = 'F-E2E资金' + stamp;
  const assetName = '000F浏览器资产' + stamp;
  const login = await page.request.post(
    'http://127.0.0.1:5086/api/auth/login',
    { data: credentials },
  );
  const auth = {
    Authorization: 'Bearer ' + (await login.json()).data.accessToken,
    'Idempotency-Key': crypto.randomUUID(),
  };
  const accountResponse = await page.request.post(
    'http://127.0.0.1:5086/api/accounts',
    {
      headers: auth,
      data: {
        name: accountName,
        type: 'Investment',
        currency: 'CNY',
        openingBalance: '10000',
      },
    },
  );
  expect(accountResponse.status()).toBe(200);
  const accountId = (await accountResponse.json()).data.id;
  const policyResponse = await page.request.put(
    'http://127.0.0.1:5086/api/assets/aggregation-policy',
    {
      headers: { ...auth, 'Idempotency-Key': crypto.randomUUID() },
      data: { accountId, mode: 'CashOnly', reason: 'E2E确认仅现金' },
    },
  );
  expect(policyResponse.status()).toBe(200);
  await page.goto('/settings');
  await page.getByText('深色', { exact: true }).click();
  await page.goto('/investments');
  await expect(
    page.getByRole('heading', { name: '投资管理', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '登记投资资产', exact: true }).click();
  await page.getByLabel('资产名称', { exact: true }).fill(assetName);
  await page
    .getByLabel('投资资金账户（余额仅代表现金）', { exact: true })
    .click();
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: accountName })
    .first()
    .click();
  await page.getByLabel('交易市场', { exact: true }).fill('TEST');
  await page.getByLabel('资产代码', { exact: true }).fill('WEB' + Date.now());
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const assetRow = page.getByRole('row').filter({ hasText: assetName });
  await assetRow.getByRole('button', { name: /交\s*易/ }).click();
  await page.getByLabel('数量（最多8位小数）', { exact: true }).fill('2');
  await page.getByLabel('成交单价（最多8位小数）', { exact: true }).fill('10');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(assetRow.locator('td').nth(2)).toHaveText('2');
  await assetRow.getByRole('button', { name: /估\s*值/ }).click();
  await page.getByLabel('单位价格（最多8位小数）', { exact: true }).fill('12');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(assetRow.locator('td').nth(6)).toContainText('24.00');
  await assetRow.getByRole('button', { name: /交\s*易/ }).click();
  await page.getByLabel('交易类型', { exact: true }).press('ArrowDown');
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: '卖出' })
    .click();
  await page.getByLabel('数量（最多8位小数）', { exact: true }).fill('1');
  await page.getByLabel('成交单价（最多8位小数）', { exact: true }).fill('15');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(assetRow.locator('td').nth(2)).toHaveText('1');
  await expect(assetRow.locator('td').nth(7)).toContainText('5.00');
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const v of await page.locator('.money').allTextContents())
    expect(v).not.toMatch(/\d/);
  await expect(
    page.getByRole('button', { name: '登记投资资产', exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: '../backend/test-results/f/investments-mobile-private.png',
    fullPage: true,
  });
});
test('资产配置、存款、实物、报表和收益分析可读', async ({ page }) => {
  for (const [route, title] of [
    ['/term-deposits', '定期存款'],
    ['/physical-assets', '实物资产'],
    ['/assets/allocation', '资产配置与估值'],
    ['/investments/performance', '投资收益分析'],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('页面遇到问题', { exact: true })).toHaveCount(
      0,
    );
  }
  await page.goto('/reports/custom');
  await expect(
    page.getByRole('heading', { name: '自定义财务报表', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '预览报表', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '导出 CSV', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '导出 CSV', exact: true }),
  ).toBeDisabled();
  for (const v of await page.locator('.money').allTextContents())
    expect(v).not.toMatch(/\d/);
});

