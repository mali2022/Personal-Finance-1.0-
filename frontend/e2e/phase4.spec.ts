import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
test('CSV导入预览、去重、确认并查看本批次', async ({ page }) => {
  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles({
    name: 'ledger.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '日期,金额,交易类型,商户,交易单号\n2026-10-07 20:30:00,25.50,支出,导入测试餐厅,E2E-IMPORT-1\n2026-10-07 20:30:00,25.50,支出,导入测试餐厅,E2E-IMPORT-1\n2026-10-07 20:31:00,-1,支出,异常商户,E2E-IMPORT-2',
    ),
  });
  await page.getByRole('button', { name: '生成预览并检测重复' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: '异常商户' }),
  ).toContainText('金额必须大于 0');
  await page.getByRole('combobox', { name: '批量匹配分类' }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '日常午餐' })
    .first()
    .click();
  await page.getByRole('button', { name: '批量应用到待整理消费' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: '导入测试餐厅' }).first(),
  ).toContainText('手动匹配');
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认导入', exact: true })
    .click();
  await expect(page.getByText('导入完成 · 1 笔')).toBeVisible();
  await page.getByRole('link', { name: '查看本批次交易' }).click();
  await expect(page).toHaveURL(/importJobId=/);
  await expect(
    page.getByRole('row').filter({ hasText: '导入测试餐厅' }),
  ).toHaveCount(1);
});
test('对账预览后确认调整，净资产与余额更新', async ({ page }) => {
  await page.goto('/reconciliation?accountId=cash');
  await page.getByLabel('实际余额', { exact: true }).fill('330.00');
  await page.getByRole('button', { name: '计算差额' }).click();
  await expect(page.getByText('资产调整差额')).toContainText('¥30.00');
  await page.getByLabel('对账说明').fill('浏览器现金盘点');
  await page.getByRole('button', { name: '确认对账', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认对账', exact: true })
    .click();
  await expect(page.getByText('对账已完成')).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: '浏览器现金盘点' }),
  ).toContainText('¥330.00');
});
test('凭证上传、预览、下载及删除', async ({ page }) => {
  await page.goto('/transactions/t0');
  const drawer = page.getByRole('dialog', { name: '交易详情' });
  await drawer.locator('input[type=file]').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: readFileSync('public/icon-192.png'),
  });
  await expect(drawer.getByText('receipt.png', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: '查看附件' }).click();
  await expect(page.getByRole('img', { name: 'receipt.png' })).toBeVisible();
  await page.getByRole('button', { name: '关闭预览' }).click();
  const downloadPromise = page.waitForEvent('download');
  await drawer.getByRole('button', { name: '下载附件' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('receipt.png');
  await drawer.getByRole('button', { name: '删除附件' }).click();
  await page
    .getByRole('dialog', { name: '删除这个附件？' })
    .getByRole('button', { name: /^确\s*定$/ })
    .click();
  await expect(drawer.getByText('暂无附件')).toBeVisible();
});
test('后端生成CSV及Excel导出', async ({ page }) => {
  await page.goto('/settings');
  await page.getByText('全部时间', { exact: true }).click();
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 CSV' }).click();
  const csv = await csvPromise;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  await expect(page.getByText(/上次导出\s*\d+\s*笔/)).toBeVisible();
  const xlsxPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Excel' }).click();
  expect((await xlsxPromise).suggestedFilename()).toMatch(/\.xlsx$/);
});
test('高级商户、账户、项目报告可下钻', async ({ page }) => {
  await page.goto('/reports');
  await expect(page.getByText('更多分析', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '账户资金流动' }).click();
  const section = page
    .locator('.ant-card')
    .filter({ has: page.getByText('更多分析', { exact: true }) });
  await section
    .getByRole('row')
    .filter({ hasText: '支付宝' })
    .getByRole('button', { name: '交易明细' })
    .click();
  await expect(page).toHaveURL(/accountId=alipay/);
  await expect(page).toHaveURL(/currency=CNY/);
});
test('手机导入中心与对账入口可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('button', { name: '打开全部功能' }).click();
  const menu = page.locator('.shell-mobile-drawer');
  await menu
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: '记账' })
    .click();
  await menu.getByRole('menuitem', { name: '导入中心', exact: true }).click();
  await expect(page.getByText('点击或拖入 CSV / XLSX 账单')).toBeVisible();
  await page.goto('/accounts/cash');
  await page.getByRole('tab', { name: '资金趋势', exact: true }).click();
  await page.getByRole('link', { name: '核对实际余额' }).click();
  await expect(page).toHaveURL(/reconciliation\?accountId=cash/);
  await expect(page.getByRole('button', { name: '计算差额' })).toBeVisible();
});
