import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('四万条数据服务端分页、深页刷新与手机隐私模式', async ({ page }) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  const fixture = JSON.parse(
    await readFile('../backend/test-results/a35-fixture.json', 'utf8'),
  ) as { database: string; total: number; prefix: string };
  expect(fixture.database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const login = page.waitForResponse('**/api/auth/login');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  const auth = (await (await login).json()) as {
    data: { accessToken: string };
  };
  const context = await page.request.get('/api/verification-context', {
    headers: { Authorization: `Bearer ${auth.data.accessToken}` },
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toBe(
    fixture.database,
  );
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/transactions' &&
      new URL(r.url()).searchParams.get('page') === '800',
  );
  await page.goto('/transactions?page=800&pageSize=50');
  const data = (
    (await (await response).json()) as {
      data: { total: number; items: { id: string }[] };
    }
  ).data;
  expect(data.total).toBe(fixture.total);
  expect(data.items).toHaveLength(50);
  await expect(
    page.getByText(`共 ${fixture.total} 笔`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(
    50,
  );
  await page.reload();
  await expect(page.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(
    50,
  );
  await expect(page).toHaveURL(/page=800/);
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await expect(
    page
      .locator('.ant-table-tbody')
      .getByText(/••••••/)
      .first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: '每一笔，都清楚' }),
  ).toBeVisible();
  const keyword = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/transactions' &&
      new URL(r.url()).searchParams.get('keyword') === fixture.prefix,
  );
  await page.goto(
    '/transactions?pageSize=20&keyword=' + encodeURIComponent(fixture.prefix),
  );
  expect(
    (
      (await (await keyword).json()) as {
        data: { total: number; items: unknown[] };
      }
    ).data.total,
  ).toBe(40000);
  await expect(page.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(
    20,
  );
});
