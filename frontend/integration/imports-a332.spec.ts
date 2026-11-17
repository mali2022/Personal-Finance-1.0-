import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('疑似重复人工保留、撤销及跳过，深色手机和隐私模式', async ({ page }) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const login = page.waitForResponse('**/api/auth/login');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  const token = (
    (await (await login).json()) as { data: { accessToken: string } }
  ).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  const context = await page.request.get('/api/verification-context', {
    headers,
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  async function create(path: string, data: object) {
    const response = await page.request.post('/api' + path, { headers, data });
    expect(response.status()).toBe(200);
    return (await response.json()).data as { id: string; version: string };
  }
  const suffix = crypto.randomUUID();
  const account = await create('/accounts', {
    name: 'A332浏览器-' + suffix,
    type: 'Cash',
    currency: 'CNY',
    openingBalance: '100',
  });
  const parent = await create('/categories', {
    name: 'A332浏览器父-' + suffix,
    kind: 'Expense',
  });
  const category = 'A332浏览器子-' + suffix;
  await create('/categories', {
    name: category,
    kind: 'Expense',
    parentId: parent.id,
  });
  const merchant = '双笔真实消费-' + suffix;
  const csv =
    '日期,类型,金额,分类,商户\n' +
    [1, 2, 3]
      .map(() => `2035-02-01 12:30:00,支出,27,${category},${merchant}`)
      .join('\n');
  const upload = await page.request.post('/api/imports', {
    headers,
    multipart: {
      source: 'CSV',
      file: {
        name: 'a332-browser.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      },
    },
  });
  expect(upload.status()).toBe(200);
  const job = (await upload.json()).data as { id: string; version: string };
  const mapped = await page.request.put(`/api/imports/${job.id}/mapping`, {
    headers: { ...headers, 'If-Match': job.version },
    data: {
      accountId: account.id,
      mapping: {
        occurredAt: '日期',
        type: '类型',
        amount: '金额',
        category: '分类',
        merchant: '商户',
      },
    },
  });
  expect(mapped.status()).toBe(200);
  await page.goto('/settings');
  await page.getByRole('radio', { name: '深色', exact: true }).check();
  await page.goto('/import?job=' + job.id);
  await expect(page.locator('[data-theme="dark"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /确认导入$/ })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '核对重复', exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  const row = (index: number) =>
    page.locator('tbody tr').filter({
      has: page
        .locator('td:first-child')
        .filter({ hasText: new RegExp(`^${index}$`) }),
    });
  async function decide(index: number, action: string, open = '核对重复') {
    await row(index).getByRole('button', { name: open, exact: true }).click();
    const drawer = page.getByRole('dialog', {
      name: '核对疑似重复',
      exact: true,
    });
    await expect(drawer.locator('.money')).toContainText('••••••');
    if (index === 2 && action === '保留为独立交易') {
      await expect(
        drawer.getByText('本批次第 1 行', { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: 'test-results/a332/duplicate-dark.png',
        animations: 'disabled',
        fullPage: true,
      });
    }
    await drawer.getByRole('button', { name: action, exact: true }).click();
    await page
      .getByRole('dialog')
      .filter({
        has: page.getByRole('button', { name: '确认判定', exact: true }),
      })
      .getByRole('button', { name: '确认判定', exact: true })
      .click();
    await expect(drawer).not.toBeVisible();
  }
  await decide(2, '保留为独立交易');
  await decide(2, '撤销判定', '查看判定');
  await expect(page.getByRole('button', { name: /确认导入$/ })).toBeDisabled();
  await decide(2, '保留为独立交易');
  await page.setViewportSize({ width: 390, height: 844 });
  await decide(3, '跳过本次导入');
  await page.screenshot({
    path: 'test-results/a332/duplicate-mobile.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.getByRole('button', { name: /确认导入$/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确认导入$/ })
    .click();
  await expect(
    page.getByText('导入完成 · 2 笔；跳过 1 笔', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('跳过 · 人工确认', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('已导入', { exact: true })).toHaveCount(2);
  const result = await page.request.get(
    `/api/transactions?importJobId=${job.id}`,
    { headers },
  );
  expect(
    ((await result.json()) as { data: { total: number } }).data.total,
  ).toBe(2);
});
