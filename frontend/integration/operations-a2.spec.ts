import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
    'utf8',
  ),
) as { email: string; password: string };
test('真实过账后丢失响应，刷新查询确认且不重复提交；审计支持隐私模式', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const loginResponse = page.waitForResponse('**/api/auth/login');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  const auth = (await (await loginResponse).json()) as {
    data: { accessToken: string; user: { id: string } };
  };
  const apiHeaders = { Authorization: `Bearer ${auth.data.accessToken}` };
  const context = await page.request.get('/api/verification-context', {
    headers: apiHeaders,
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  await expect(page.locator('.home-page')).toBeVisible();
  const accounts = (await (
    await page.request.get('/api/accounts', { headers: apiHeaders })
  ).json()) as {
    data: {
      id: string;
      name: string;
      type: string;
      status: string;
      currency: string;
    }[];
  };
  const categories = (await (
    await page.request.get('/api/categories', { headers: apiHeaders })
  ).json()) as {
    data: {
      id: string;
      name: string;
      parentId?: string;
      kind: string;
      status: string;
    }[];
  };
  const account = accounts.data.find(
    (a) =>
      a.name === '现金' &&
      a.type === 'Cash' &&
      a.status === 'Active' &&
      a.currency === 'CNY',
  )!;
  const category = categories.data.find(
    (c) =>
      c.name === '日常午餐' &&
      c.parentId &&
      c.kind === 'Expense' &&
      c.status === 'Active',
  )!;
  let committedId = '';
  let posts = 0;
  // Fault injection only: forward to the real SQL-backed API, then deliberately lose the response.
  await page.route('**/api/transactions/expense', async (route) => {
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committedId = ((await response.json()) as { data: { id: string } }).data.id;
    await route.abort('failed');
  });
  const amount = '17.23';
  await page.getByRole('button', { name: '记支出' }).click();
  const drawer = page.locator('.ant-drawer-content').last();
  await drawer.getByPlaceholder('0.00').first().fill(amount);
  // Fill controlled selectors through the normal browser UI, using seeded category names.
  await drawer.getByLabel('账户', { exact: true }).focus();
  await drawer.getByLabel('账户', { exact: true }).fill('现金');
  await drawer.getByLabel('账户', { exact: true }).press('ArrowDown');
  await drawer.getByLabel('账户', { exact: true }).press('Enter');
  await drawer.getByLabel('分类', { exact: true }).focus();
  await drawer.getByLabel('分类', { exact: true }).fill('日常午餐');
  await drawer.getByLabel('分类', { exact: true }).press('ArrowDown');
  await drawer.getByLabel('分类', { exact: true }).press('Enter');
  await drawer.getByLabel('备注', { exact: true }).fill('PRIVATE-BROWSER-A2');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect.poll(() => committedId).not.toBe('');
  await page.unroute('**/api/transactions/expense');
  await page.reload();
  await expect(
    page.getByRole('button', { name: '查看提交记录' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '查看提交记录' }).click();
  await page.getByRole('button', { name: '查询结果', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看提交记录' })).toHaveCount(
    0,
  );
  expect(posts).toBe(1);
  const stored = await page.evaluate(
    (user) =>
      JSON.parse(
        sessionStorage.getItem(`pf.operations.v1:${user}`) || '[]',
      ) as unknown[],
    auth.data.user.id,
  );
  expect(stored).toEqual([]);
  await page.goto(`/transactions/${committedId}`);
  await page.getByRole('button', { name: '查看历史', exact: true }).click();
  const history = page
    .locator('.ant-card')
    .filter({ has: page.getByText('操作历史', { exact: true }) })
    .last();
  await expect(
    history.getByText('创建', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    history.getByText('[内容已脱敏]', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    history.getByText('PRIVATE-BROWSER-A2', { exact: false }),
  ).toHaveCount(0);
  await page.goto('/transactions');
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await page.goto(`/transactions/${committedId}`);
  await page.getByRole('button', { name: '查看历史', exact: true }).click();
  await expect(page.getByText('历史内容已隐藏').first()).toBeVisible();
  // Each response is real; audit values and transaction count are checked on the server.
  const detail = (await (
    await page.request.get(`/api/transactions/${committedId}`, {
      headers: apiHeaders,
    })
  ).json()) as {
    data: { accountId: string; categoryId: string; amount: string };
  };
  expect(detail.data).toMatchObject({
    accountId: account.id,
    categoryId: category.id,
    amount,
  });
});
