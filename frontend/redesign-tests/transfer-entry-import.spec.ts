import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';
for (const width of [320, 1440]) {
  test.describe(`${width}px transfers`, () => {
    test.use({ viewport: { width, height: 960 }, isMobile: width < 768, hasTouch: width < 768 });
    test('top-up and withdrawal submit as transfers and show purpose labels', async ({ page }) => {
      await page.goto('/transactions');
      if (width < 768) await page.getByRole('button', { name: '快速记账', exact: true }).click();
      else await page.locator('.header-entry').click();
      const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
      for (const [label, transferKind] of [['充值', 'TopUp'], ['提现', 'Withdrawal']]) {
        if (width < 768) {
          await drawer.getByRole('combobox', { name: '记账类型', exact: true }).locator('..').locator('..').click();
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).click();
        } else {
          const tab = drawer.getByRole('tab', { name: label, exact: true });
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
        }
        await drawer.getByPlaceholder('0.00').first().fill('12.34');
        await drawer.getByRole('combobox', { name: '转入账户', exact: true }).click();
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click();
        const saving = page.waitForRequest(r => r.method() === 'POST' && /\/api\/transactions\/transfer$/.test(r.url()));
        await drawer.getByRole('button', { name: '保存并继续', exact: true }).click();
        expect((await saving).postDataJSON()).toMatchObject({ type: 'Transfer', transferKind, amount: '12.34' });
        await expect(drawer.getByPlaceholder('0.00').first()).toHaveValue('');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      fs.mkdirSync('verification/transfers', { recursive: true });
      await page.screenshot({ path: `verification/transfers/entry-${width}.png` });
    });
    test('transfer template downloads and maps both account columns in preview', async ({ page }) => {
      await page.goto('/import');
      const download = page.getByRole('link', { name: '下载转账 / 充值 / 提现模板' });
      await expect(download).toBeVisible();
      const response = await page.request.get('/transfer-import-template.csv');
      expect(response.status()).toBe(200); expect(await response.text()).toContain('转出账户,转入账户');
      const accounts = await page.evaluate(async () => (await (await fetch('/api/accounts')).json()).data as {id: string; name: string; currency: string; status: string; type: string}[]);
      const usable = accounts.filter(a => a.status === 'Active' && a.currency === 'CNY' && ['Bank', 'WeChat', 'Cash', 'Alipay', 'ElectronicWallet'].includes(a.type));
      expect(usable.length).toBeGreaterThanOrEqual(2);
      const csv = `日期时间,交易类型,转出账户,转入账户,金额,币种,手续费,手续费分类,到账金额,汇率,订单/流水号,备注\n2026-10-07 10:00:00,充值,${usable[0].id},${usable[1].id},123.45,CNY,0,,,,BROWSER-TOPUP-1,测试\n2026-10-07 11:00:00,提现,${usable[1].id},${usable[0].id},23.45,CNY,0,,,,BROWSER-WITHDRAW-1,测试`;
      await page.locator('input[type=file]').setInputFiles({ name: 'transfer.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await expect(page.getByText(/字段映射 · transfer.csv/)).toBeVisible();
      await expect(page.getByRole('combobox', {name: '转出/资金账户', exact: true})).toBeVisible();
      await page.getByRole('button', { name: /生成预览|预览导入|应用映射/ }).click();
      await expect(page.getByRole('columnheader', {name: '账户流向', exact: true})).toBeVisible();
      await expect(page.getByRole('cell', {name: '充值', exact: true})).toBeVisible();
      await expect(page.getByRole('cell', {name: '提现', exact: true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      fs.mkdirSync('verification/transfers', { recursive: true });
      await page.screenshot({ path: `verification/transfers/import-${width}.png`, fullPage: true });
    });
  });
}
