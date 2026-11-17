import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';
import catalog from '../src/data/releases.json' with { type: 'json' };
for (const width of [320, 768, 1440]) {
  test.describe(`${width}px release notes`, () => {
    test.use({ viewport: { width, height: 960 }, isMobile: width < 768, hasTouch: width < 768 });
    test('public release notes search, pagination and update checking', async ({ page }) => {
      await page.context().route('**/release-info.json', route => route.fulfill({ json: catalog }));
      await page.goto('/updates');
      await expect(page.getByRole('heading', { name: '版本更新', exact: true })).toBeVisible();
      await expect(page.getByText('支出新增商品名', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.getByLabel('搜索更新内容').fill('Agent');
      await expect(page.getByRole('heading', { name: '自主财务 Agent', exact: true })).toBeVisible();
      await page.getByLabel('搜索更新内容').fill('');
      await page.getByRole('button', { name: /检查更新/ }).click();
      await expect(page.getByText('当前已是最新版本', { exact: true })).toBeVisible();
      await page.locator('.ant-pagination-next').click();
      await expect(page.getByRole('heading', { name: '自主财务 Agent', exact: true })).toBeVisible();
      fs.mkdirSync('verification/releases', { recursive: true });
      await page.screenshot({ path: `verification/releases/${width}.png`, fullPage: true });
      if (width === 1440) {
        await page.goto('/settings');
        await page.getByRole('link', { name: '版本更新', exact: true }).last().click();
        await expect(page).toHaveURL(/\/settings\/updates$/);
        await expect(page.getByRole('heading', { name: '版本更新', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '用户菜单', exact: true }).click();
        await page.locator('.ant-dropdown:visible').getByRole('menuitem', { name: /版本更新/ }).click();
        await expect(page).toHaveURL(/\/settings\/updates$/);
      }
    });
  });
}
