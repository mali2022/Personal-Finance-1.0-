import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';

for (const width of [320, 1440]) {
  test.describe(`${width}px expense product name`, () => {
    test.use({ viewport: { width, height: 960 }, isMobile: width < 768, hasTouch: width < 768 });
    test('expense product name is optional, submitted and cleared for the next entry', async ({ page }) => {
      await page.goto('/transactions');
      if (width < 768) await page.getByRole('button', { name: '快速记账', exact: true }).click();
      else await page.locator('.header-entry').click();
      const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
      const product = drawer.getByLabel('商品名', { exact: true });
      await expect(product).toBeVisible();
      await expect(product).toHaveAttribute('maxlength', '200');
      await product.fill('午餐套餐');
      if (width < 768) {
        await drawer.getByRole('combobox', { name: '记账类型', exact: true }).locator('..').locator('..').click();
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '收入' }).click();
      } else await drawer.getByRole('tab', { name: '收入', exact: true }).click();
      await expect(product).toHaveCount(0);
      if (width < 768) {
        await drawer.getByRole('combobox', { name: '记账类型', exact: true }).locator('..').locator('..').click();
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^支出$/ }).click();
      } else await drawer.getByRole('tab', { name: '支出', exact: true }).click();
      await expect(product).toHaveValue('午餐套餐');
      await drawer.getByPlaceholder('0.00').first().fill('38.90');
      await drawer.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '日常午餐' }).click();
      await product.scrollIntoViewIfNeeded();
      const bounds = (await product.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      fs.mkdirSync('verification/expense-product-name', { recursive: true });
      await page.screenshot({ path: `verification/expense-product-name/${width}.png` });
      const saving = page.waitForRequest(request => request.url().endsWith('/api/transactions/expense') && request.method() === 'POST');
      await drawer.getByRole('button', { name: '保存并继续', exact: true }).click();
      expect((await saving).postDataJSON()).toMatchObject({ type: 'Expense', productName: '午餐套餐', amount: '38.90' });
      await expect(product).toHaveValue('');
    });
  });
}
