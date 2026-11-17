import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
);
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.locator('.home-page')).toBeVisible();
});
async function realApi(page: Page) {
  await page.request.get('/api/auth/csrf');
  const cookies = await page.context().cookies();
  const xsrf = decodeURIComponent(
    cookies.find((c) => c.name === 'XSRF-TOKEN')!.value,
  );
  const login = await page.request.post('/api/auth/login', {
    data: credentials,
    headers: { 'X-XSRF-TOKEN': xsrf },
  });
  expect(login.status()).toBe(200);
  const token = (await login.json()).data.accessToken;
  return async (path: string, data?: unknown, version?: string) => {
    const r = await page.request.fetch('/api' + path, {
      method: data ? 'POST' : 'GET',
      data,
      headers: {
        Authorization: 'Bearer ' + token,
        'X-XSRF-TOKEN': xsrf,
        'Idempotency-Key': crypto.randomUUID(),
        ...(version ? { 'If-Match': version } : {}),
      },
    });
    expect(r.status()).toBe(200);
    return (await r.json()).data;
  };
}
test('真实优惠页创建、历史和统计下钻', async ({ page }) => {
  await page.goto('/benefits');
  await expect(page.getByRole('heading', { name: '优惠与权益' })).toBeVisible();
  await page.getByRole('button', { name: '新建权益', exact: true }).click();
  const name = 'G1浏览器券-' + Date.now();
  await page.getByLabel('名称', { exact: true }).fill(name);
  await page.getByLabel('平台', { exact: true }).fill('浏览器验证');
  await page.getByLabel('面额 / 初始赠送权益').fill('5.00');
  await page.getByLabel('折扣后支付比例（%，85 表示八五折）').fill('85');
  await page.getByLabel('最高优惠金额（为空不限）').fill('3.00');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '平台筛选' }).click();
  await page.getByText('浏览器验证', { exact: true }).last().click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '优惠分析' }).click();
  await expect(page.getByText('手续费节省', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '财务统计图表' })).toBeVisible();
  await page.getByRole('radio', { name: '按年', exact: true }).check();
  await expect(
    page.getByRole('columnheader', { name: '年份', exact: true }),
  ).toBeVisible();
  await page.getByRole('radio', { name: '按月', exact: true }).check();
  await expect(
    page.getByRole('link', { name: '查看原交易' }).first(),
  ).toBeVisible();
});
test('真实返现部分追回及受控撤销', async ({ page }) => {
  const api = await realApi(page),
    stamp = Date.now(),
    name = 'G2浏览器追回-' + stamp;
  const cats = await api('/categories'),
    category = cats.find(
      (c: { kind: string; parentId?: string; status: string }) =>
        c.kind === 'Expense' && c.parentId && c.status === 'Active',
    );
  const income = cats.find(
    (c: { kind: string; parentId?: string; status: string }) =>
      c.kind === 'Income' && c.parentId && c.status === 'Active',
  );
  const account = await api('/accounts', {
    name,
    type: 'Bank',
    currency: 'CNY',
    openingBalance: '100',
  });
  const expense = await api('/transactions/expense', {
    type: 'Expense',
    amount: '10',
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date().toISOString(),
  });
  const cashback = await api('/cashbacks', {
    transactionId: expense.id,
    amount: '5',
    source: name,
    treatment: 'RewardIncome',
  });
  await api(
    `/cashbacks/${cashback.id}/settle`,
    {
      accountId: account.id,
      categoryId: income.id,
      occurredAt: new Date().toISOString(),
    },
    '1',
  );
  await page.goto('/benefits');
  await page.getByRole('tab', { name: '返现', exact: true }).click();
  await page.getByRole('textbox', { name: '返现来源搜索' }).fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: '登记实际追回' }).click();
  const drawer = page.getByRole('dialog', { name: '登记实际返现追回' });
  await drawer.getByLabel('本次实际追回金额').fill('2');
  await drawer.getByLabel('追回原因与凭据').fill('浏览器追回验证');
  await drawer.getByRole('combobox', { name: '实际扣回账户' }).fill(name);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: name })
    .first()
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/cashbacks/${cashback.id}/recover`) &&
      r.request().method() === 'POST',
  );
  await drawer.getByRole('button', { name: '确认实际追回并记账' }).click();
  expect((await response).status()).toBe(200);
  await expect(row).toContainText('部分追回');
  await row.getByRole('button', { name: '追回历史' }).click();
  await page
    .getByRole('dialog', { name: '返现追回历史' })
    .getByRole('button', { name: '撤销错误追回' })
    .click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(
    page.getByRole('dialog', { name: '返现追回历史' }),
  ).toContainText('已撤销');
  const accounts = await api('/accounts');
  expect(
    accounts.find((a: { id: string }) => a.id === account.id).balance,
  ).toBe('95.00');
  await page.goto(`/transactions/${expense.id}`);
  await expect(
    page.getByRole('heading', { name: '关联返现', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '查看返现管理' })).toBeVisible();
});
test('补贴草稿确认与复合撤销真实资金核对', async ({ page }) => {
  const api = await realApi(page),
    name = 'G2浏览器补贴-' + Date.now();
  const cats = await api('/categories'),
    income = cats.find(
      (c: { kind: string; parentId?: string; status: string }) =>
        c.kind === 'Income' && c.parentId && c.status === 'Active',
    );
  const account = await api('/accounts', {
    name: name + '-付款',
    type: 'Bank',
    currency: 'CNY',
    openingBalance: '200',
  });
  const target = await api('/accounts', {
    name: name + '-到账',
    type: 'WeChat',
    currency: 'CNY',
  });
  await api('/promotions/transfer-drafts', {
    accountId: account.id,
    toAccountId: target.id,
    paidAmount: '95',
    receivedAmount: '100',
    subsidyAmount: '5',
    source: name,
    evidence: '浏览器真实业务凭据',
    occurredAt: new Date().toISOString(),
  });
  await page.goto('/benefits?tab=drafts');
  await page.getByRole('textbox', { name: '补贴来源搜索' }).fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: '确认补贴并过账' }).click();
  const drawer = page.getByRole('dialog', { name: '确认第三方补贴业务' });
  await drawer
    .getByRole('combobox', { name: '已确认的活动奖励收入分类' })
    .fill(income.name);
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: income.name })
    .first()
    .click();
  await drawer.getByRole('button', { name: '确认奖励性质并过账' }).click();
  await expect(row).toContainText('已过账');
  let accounts = await api('/accounts');
  expect(
    accounts.find((a: { id: string }) => a.id === account.id).balance,
  ).toBe('105.00');
  expect(accounts.find((a: { id: string }) => a.id === target.id).balance).toBe(
    '100.00',
  );
  await row.getByRole('button', { name: '撤销业务' }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(row).toContainText('已撤销');
  accounts = await api('/accounts');
  expect(
    accounts.find((a: { id: string }) => a.id === account.id).balance,
  ).toBe('200.00');
  expect(accounts.find((a: { id: string }) => a.id === target.id).balance).toBe(
    '0.00',
  );
});
test('移动优惠界面和金额隐私', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/benefits');
  await expect(page.getByRole('heading', { name: '优惠与权益' })).toBeVisible();
  const privacy = page.getByRole('button', { name: /隐藏金额|隐私/ }).first();
  await expect(privacy).toBeVisible();
  await privacy.click();
  await expect(page.locator('.money').first()).toContainText('••••••');
  await page.screenshot({
    path: 'test-results/g1/mobile-benefits.png',
    fullPage: true,
  });
});
test('深色模式优惠分析与隐私趋势', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'finance-ui',
      JSON.stringify({
        state: { hidden: true, theme: 'dark', defaultAccount: '' },
        version: 0,
      }),
    ),
  );
  await page.goto('/benefits?tab=reports');
  await expect(page.locator('[data-theme="dark"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '优惠与权益' })).toBeVisible();
  await expect(
    page.getByText('隐私模式下隐藏金额趋势。', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: '财务统计图表' })).toHaveCount(0);
  await expect(page.locator('.money').first()).toContainText('••••••');
  await page.screenshot({
    path: 'test-results/g1/dark-private-analysis.png',
    fullPage: true,
  });
});
test('快速记账优惠计算与真实过账', async ({ page }) => {
  await page
    .getByRole('button', { name: /记一笔/ })
    .first()
    .click();
  const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
  await drawer.getByText('优惠信息', { exact: true }).click();
  await drawer.getByLabel('优惠前金额（含运费）').fill('100.00');
  await drawer.getByRole('button', { name: '新增优惠', exact: true }).click();
  await drawer
    .getByRole('textbox', { name: '优惠金额1', exact: true })
    .fill('20.00');
  await expect(
    drawer.getByLabel('实际金额 · CNY', { exact: true }),
  ).toHaveValue('80.00');
  await drawer
    .getByRole('combobox', { name: '账户', exact: true })
    .fill('G1资金-');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: 'G1资金-' })
    .first()
    .click();
  await drawer
    .getByRole('combobox', { name: '分类', exact: true })
    .fill('日常午餐');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '日常午餐' })
    .first()
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/transactions/expense') &&
      r.request().method() === 'POST',
  );
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON().amount).toBe('80.00');
  expect(saved.request().postDataJSON().promotion.lines[0].amount).toBe(
    '20.00',
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
