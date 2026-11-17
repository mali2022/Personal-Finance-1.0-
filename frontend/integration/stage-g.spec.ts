import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
);
let testToken: string;
test('family split preview and confirmation post the exact total once', async ({
  page,
}) => {
  const name = 'Chromium分摊账户' + Date.now();
  const headers = {
    Authorization: 'Bearer ' + testToken,
    'Idempotency-Key': crypto.randomUUID(),
  };
  const accountResponse = await page.request.post('/api/accounts', {
    headers,
    data: { name, type: 'Bank', currency: 'CNY', openingBalance: '1000.00' },
  });
  expect(accountResponse.status()).toBe(200);
  const accountId = (await accountResponse.json()).data.id;
  await page.goto('/advances');
  await page.getByRole('button', { name: '家庭多人分摊', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  await drawer.getByLabel('商品或事项').fill('三人采购');
  await drawer.getByLabel('实际付款账户').fill(name);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: name })
    .first()
    .click();
  await drawer.getByLabel('实际付款总额').fill('100.00');
  await drawer.getByLabel('第 1 人', { exact: true }).fill('甲');
  await drawer.getByLabel('第 2 人', { exact: true }).fill('乙');
  await drawer.getByLabel('由本人承担').first().click();
  await drawer.getByRole('button', { name: '增加人员' }).click();
  await drawer.getByLabel('第 3 人', { exact: true }).fill('丙');
  await drawer.getByRole('button', { name: '预览资金与分摊' }).click();
  await expect(drawer.getByRole('cell', { name: /33\.34/ })).toBeVisible();
  const readBalance = async () => {
    const response = await page.request.get('/api/accounts', {
      headers: { Authorization: 'Bearer ' + testToken },
    });
    return (await response.json()).data.find(
      (account: { id: string }) => account.id === accountId,
    ).balance;
  };
  expect(await readBalance()).toBe('1000.00');
  await drawer.getByRole('button', { name: '确认实际付款与分摊' }).click();
  await expect(page.getByText('分摊已确认', { exact: true })).toBeVisible();
  await expect(drawer).not.toBeVisible();
  expect(await readBalance()).toBe('900.00');
});
test('yearly payroll analysis and history filters use server data', async ({
  page,
}) => {
  await page.goto('/payroll');
  await page.getByRole('tab', { name: '年度工资与缴费' }).click();
  await expect(
    page.getByText('年度工资与缴费分析', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '实发同比%' }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '工资构成' }),
  ).toBeVisible();
  await page
    .locator('.ant-select')
    .filter({ has: page.getByRole('combobox', { name: '统计类型' }) })
    .locator('.ant-select-selector')
    .click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^公积金$/ })
    .click();
  await expect(
    page.getByText('已记录公积金缴费累计', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('实际公积金提取', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '原币提取金额' }),
  ).toBeVisible();
  await page.goto('/memories/on-this-day');
  await expect(page.getByRole('button', { name: '随机回顾' })).toBeVisible();
  await page.getByRole('button', { name: '随机回顾' }).click();
  await expect(page.getByText('加载失败，请重试')).toHaveCount(0);
});
test('planned purchase is cash neutral until the actual purchase is confirmed', async ({
  page,
}) => {
  const name = 'Chromium待购账户' + Date.now();
  const headers = {
    Authorization: 'Bearer ' + testToken,
    'Idempotency-Key': crypto.randomUUID(),
  };
  const response = await page.request.post('/api/accounts', {
    headers,
    data: { name, type: 'Bank', currency: 'CNY', openingBalance: '1000.00' },
  });
  expect(response.status()).toBe(200);
  const accountId = (await response.json()).data.id;
  const readBalance = async () => {
    const accounts = await page.request.get('/api/accounts', {
      headers: { Authorization: 'Bearer ' + testToken },
    });
    return (await accounts.json()).data.find(
      (a: { id: string }) => a.id === accountId,
    ).balance;
  };
  await page.goto('/advances');
  await page.getByRole('tab', { name: '待购与取消' }).click();
  await page.getByRole('button', { name: '新增记录', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  const planName = 'Chromium待购商品' + Date.now();
  await drawer.getByLabel('商品或事项').fill(planName);
  await drawer.getByLabel('应返还人').fill('朋友');
  await drawer.getByLabel('实际资金账户').fill(name);
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: name })
    .first()
    .click();
  await drawer.getByLabel('预计总额（不入账）').fill('100.00');
  await drawer.getByRole('button', { name: '保存（不新增现金交易）' }).click();
  await expect(drawer).not.toBeVisible();
  expect(await readBalance()).toBe('1000.00');
  const row = page.getByRole('row').filter({ hasText: planName });
  await row.getByRole('button', { name: '确认实际采购' }).click();
  await drawer.getByLabel('实际付款总额').fill('90.00');
  await drawer.getByRole('button', { name: '预览/核对' }).click();
  await expect(drawer.getByText('真实现金影响', { exact: true })).toBeVisible();
  expect(await readBalance()).toBe('1000.00');
  await drawer.getByRole('button', { name: '确认资金影响并保存' }).click();
  await expect(drawer).not.toBeVisible();
  expect(await readBalance()).toBe('910.00');
  await expect(row.getByRole('button', { name: '确认实际采购' })).toHaveCount(
    0,
  );
});
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  const login = await loginResponse;
  expect(login.status()).toBe(200);
  await expect(page.locator('.home-page')).toBeVisible();
  const token = (await login.json()).data.accessToken;
  testToken = token;
  const context = await page.request.get('/api/verification-context', {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect((await context.json()).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
});
test('all nine module routes and payroll contribution tabs use real API', async ({
  page,
}) => {
  for (const [route, title] of [
    ['/settings/currencies', '货币与汇率'],
    ['/settings/payment-instruments', '付款授权工具'],
    ['/accounts/fund-status', '冻结与在途资金'],
    ['/prepayments', '预付款与押金'],
    ['/advances', '代买代付与实物往来'],
    ['/payroll', '工资管理'],
    ['/analytics/living-cost', '固定生活成本篮子'],
    ['/memories/on-this-day', '历史上的今日消费'],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('加载失败，请重试')).toHaveCount(0);
  }
  await page.goto('/payroll');
  await page.getByRole('tab', { name: '社保', exact: true }).click();
  await expect(page.getByRole('heading', { name: '社保缴费' })).toBeVisible();
  await page.getByRole('tab', { name: '公积金', exact: true }).click();
  await expect(page.getByRole('heading', { name: '住房公积金' })).toBeVisible();
});
test('payroll drawer computes exact net amount and persists without posting another income', async ({
  page,
}) => {
  await page.goto('/payroll');
  await page.getByRole('button', { name: '新增记录', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  await drawer
    .getByLabel('雇主', { exact: true })
    .fill('Chromium工资' + Date.now());
  await drawer.getByRole('button', { name: '增加条目' }).click();
  await drawer.getByLabel('项目名称').fill('工资');
  await drawer.getByLabel('金额（原币）').fill('10000.00');
  await drawer.getByRole('button', { name: '保存（不新增现金交易）' }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(
    page.getByRole('cell', { name: /10,000/ }).first(),
  ).toBeVisible();
});
test('dark mobile layout and privacy hide financial content', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'finance-ui',
      JSON.stringify({
        state: { hidden: true, theme: 'dark', defaultAccount: '' },
        version: 0,
      }),
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { name: '工资管理' })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: '••••', exact: true }).first(),
  ).toBeVisible();
  await page.goto('/memories/on-this-day');
  await expect(page.getByText('隐私模式已隐藏金额和消费内容')).toBeVisible();
});
test('external payer facts preserve the ledger and do not require a fictional funding account', async ({
  page,
}) => {
  const headers = { Authorization: 'Bearer ' + testToken };
  const before = (
    await (
      await page.request.get('/api/transactions?pageSize=1', { headers })
    ).json()
  ).data.total;
  await page.goto('/settings/payment-instruments');
  await page
    .getByRole('tab', { name: '账本外第三方付款', exact: true })
    .click();
  await page.getByRole('button', { name: '新增记录', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  await drawer.getByLabel('付款事项').fill('Chromium外部出资' + Date.now());
  await drawer.getByLabel('实际出资人').fill('家人');
  await drawer.getByLabel('消费人', { exact: true }).fill('本人');
  await drawer.getByLabel('金额（原币）').fill('80.00');
  await drawer.getByRole('button', { name: '保存（不新增现金交易）' }).click();
  await expect(drawer).not.toBeVisible();
  expect(
    (
      await (
        await page.request.get('/api/transactions?pageSize=1', { headers })
      ).json()
    ).data.total,
  ).toBe(before);
});
