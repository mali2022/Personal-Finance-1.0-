import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('预算父子互斥提示及二级分类保存', async ({ page }) => {
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
  const headers = { Authorization: `Bearer ${auth.data.accessToken}` };
  const context = await page.request.get('/api/verification-context', {
    headers,
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  const name = '浏览器预算-' + Date.now();
  const p = await page.request.post('/api/categories', {
    headers,
    data: { name, kind: 'Expense' },
  });
  expect(p.ok()).toBeTruthy();
  const parentId = ((await p.json()) as { data: { id: string } }).data.id;
  expect(
    (
      await page.request.post('/api/categories', {
        headers,
        data: { name: name + '-子', kind: 'Expense', parentId },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/budgets');
  await page.getByRole('button', { name: /创建预算|编辑预算/ }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('月度预算总额').fill('10000');
  // Replace any existing clone-only budget lines with two explicit selections.
  while (await modal.getByRole('button', { name: '删除分类预算' }).count())
    await modal.getByRole('button', { name: '删除分类预算' }).first().click();
  for (const [index, label] of [name, name + ' / ' + name + '-子'].entries()) {
    await modal.getByRole('button', { name: '添加分类预算' }).click();
    await modal
      .getByRole('combobox', { name: `预算分类 ${index + 1}`, exact: true })
      .click();
    const option = page
      .locator('.ant-select-item-option')
      .filter({ has: page.getByText(label, { exact: true }) });
    await modal
      .getByRole('combobox', { name: `预算分类 ${index + 1}`, exact: true })
      .fill(label);
    await option.last().click();
    await modal
      .getByLabel(`分类预算 ${index + 1}`, { exact: true })
      .fill('100');
  }
  await modal.getByRole('button', { name: '保存预算' }).click();
  await expect(
    modal.getByText('同月不能同时设置父分类及其子分类预算，请保留其中一层'),
  ).toBeVisible();
  await modal.getByRole('button', { name: '删除分类预算' }).first().click();
  await modal.getByRole('button', { name: '保存预算' }).click();
  await expect(modal).toBeHidden();
  await expect(
    page
      .getByRole('main')
      .getByText(name + ' / ' + name + '-子', { exact: true }),
  ).toBeVisible();
});
