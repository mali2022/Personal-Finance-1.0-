import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('备份演练后正式应用可登录、查询与刷新，且不提交财务写请求', async ({ page }) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/bootstrap-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith('/api/') &&
      !path.startsWith('/api/auth/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    )
      writes.push(`${request.method()} ${path}`);
  });
  const health = await page.request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()) as { status: string }).toEqual({ status: 'healthy' });
  const anonymous = await page.request.get('/api/accounts');
  expect(anonymous.status()).toBe(401);
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const dashboard = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/dashboard',
  );
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  expect((await dashboard).status()).toBe(200);
  await expect(page.locator('.home-page')).toBeVisible();
  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: '每一笔，都清楚' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '每一笔，都清楚' })).toBeVisible();
  for (const [path, title] of [
    ['/recurring', '周期交易'],
    ['/subscriptions', '订阅管理'],
    ['/automation', '自动分类规则'],
    ['/calendar', '财务日历'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('保存失败', { exact: true })).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});
