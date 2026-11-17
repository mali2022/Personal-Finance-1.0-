import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('保存筛选、刷新、应用与删除；待整理范围明确且不提交财务写入', async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/bootstrap-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/auth/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    )
      writes.push(request.method() + ' ' + url.pathname);
  });
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page.locator('.home-page')).toBeVisible();
  const name = '只读验收-' + Date.now();
  await page.goto(
    '/transactions?type=Expense&currency=CNY&min=9.50&sort=amount:desc&page=2&columns=date,type,amount,actions',
  );
  await page.getByRole('button', { name: '保存当前筛选' }).click();
  await page.getByLabel('视图名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByText('筛选视图已保存', { exact: true })).toBeVisible();
  await page.goto('/transactions');
  const selector = page.getByRole('combobox', { name: '已保存筛选视图' });
  await selector.focus();
  await selector.press('ArrowDown');
  await page.getByText(name, { exact: true }).last().click();
  await expect(page).toHaveURL(/type=Expense/);
  expect(new URL(page.url()).searchParams.get('min')).toBe('9.50');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await expect(
    page.getByRole('columnheader', { name: '商户 / 对象' }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('columnheader', { name: '金额' })).toBeVisible();
  await page.getByRole('combobox', { name: '已保存筛选视图' }).focus();
  await page
    .getByRole('combobox', { name: '已保存筛选视图' })
    .press('ArrowDown');
  await page.getByText(name, { exact: true }).last().click();
  await page.getByRole('button', { name: '删除视图', exact: true }).click();
  await page.getByRole('button', { name: /^确\s*定$/ }).click();
  await expect(page.getByText('筛选视图已删除', { exact: true })).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/transactions' &&
      new URL(r.url()).searchParams.get('status') === 'NeedsReview',
  );
  await page.goto('/transactions/review');
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: '待整理中心', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: '记录状态' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(writes).toEqual([]);
});

