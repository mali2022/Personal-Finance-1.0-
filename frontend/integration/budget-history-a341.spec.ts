import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('历史停用预算展示、并发冲突不丢表单、取消修改确认', async ({ page }) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  const fixture = JSON.parse(
    await readFile('../backend/test-results/a341-fixture.json', 'utf8'),
  ) as { database: string; name: string };
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
  expect(fixture.database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  expect(((await context.json()) as { database: string }).database).toBe(
    fixture.database,
  );
  await page.goto('/budgets');
  await page.getByLabel('预算月份').fill('2037-02');
  await page.getByLabel('预算月份').press('Enter');
  await expect(
    page.getByText('2037-02 月度预算', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(fixture.name + ' / ' + fixture.name + '-子（已停用）', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: '编辑预算' }).click();
  const modal = page.getByRole('dialog', { name: '2037-02 预算计划' });
  await expect(page.getByLabel('预算月份')).toBeDisabled();
  await expect(modal.getByText(/预算包含已停用或不可用分类/)).toBeVisible();
  await modal.getByRole('button', { name: '保存预算' }).click();
  await expect(modal.getByText('请替换或移除已停用的分类')).toBeVisible();
  await modal.getByRole('button', { name: '删除分类预算' }).click();
  await modal.getByLabel('月度预算总额').fill('1200');
  const current = await page.request.get('/api/budgets/2037-02', { headers });
  const version = ((await current.json()) as { data: { version: string } }).data
    .version;
  expect(
    (
      await page.request.put('/api/budgets/2037-02', {
        headers: { ...headers, 'If-Match': version },
        data: { total: '1300', items: [] },
      })
    ).ok(),
  ).toBeTruthy();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/budgets/2037-02') &&
      r.request().method() === 'PUT',
  );
  await modal.getByRole('button', { name: '保存预算' }).click();
  expect((await saved).status()).toBe(409);
  await expect(modal.getByLabel('月度预算总额')).toHaveValue('1200');
  await modal.getByRole('button', { name: /^取\s*消$/ }).click();
  const confirm = page.getByRole('dialog', { name: '放弃未保存的预算修改？' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '继续编辑' }).click();
  await expect(modal.getByLabel('月度预算总额')).toHaveValue('1200');
  await modal.getByRole('button', { name: /^取\s*消$/ }).click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByLabel('预算月份')).toBeEnabled();
});
