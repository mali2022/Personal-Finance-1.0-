import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('真实分类创建、修改、删除确认及有引用分类的删除保护', async ({ page }) => {
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
  const auth = (await (await login).json()) as {
    data: { accessToken: string };
  };
  const context = await page.request.get('/api/verification-context', {
    headers: { Authorization: `Bearer ${auth.data.accessToken}` },
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  await page.goto('/categories');
  const name = '浏览器分类-' + Date.now();
  await page.getByRole('button', { name: '＋ 一级分类' }).click();
  await page.getByLabel('分类名称', { exact: true }).fill(name);
  await page
    .locator('.ant-modal-content')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  let row = page.locator('.category-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^修\s*改$/ }).click();
  await page.getByLabel('分类名称', { exact: true }).fill(name + '-改');
  await page
    .locator('.ant-modal-content')
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  row = page.locator('.category-row').filter({ hasText: name + '-改' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^删\s*除$/ }).click();
  const confirm = page.locator('.ant-modal-content');
  await expect(
    confirm.getByText('删除后不能恢复此分类', { exact: false }),
  ).toBeVisible();
  await confirm.getByRole('button', { name: '删除分类', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator('.category-row').filter({ hasText: name }),
  ).toHaveCount(0);
  await page
    .locator('.category-row')
    .filter({ hasText: '餐饮食品' })
    .getByRole('button', { name: /^删\s*除$/ })
    .click();
  await expect(
    page.getByRole('dialog', { name: '分类仍被使用，不能删除', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('历史记录需要保留分类引用，可改为停用。', { exact: true }),
  ).toBeVisible();
  await page
    .locator('.ant-modal-content')
    .getByRole('button', { name: /^知\s*道\s*了$/ })
    .click();
  await expect(page.getByText('餐饮食品', { exact: true })).toBeVisible();
});
