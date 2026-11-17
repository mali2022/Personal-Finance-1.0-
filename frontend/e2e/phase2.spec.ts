import { test, expect, openNavigationGroup } from './fixtures';
import type { Page } from '@playwright/test';
async function option(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: text })
    .first()
    .click();
}
test('保存预算并在首页显示新总额', async ({ page }) => {
  await page.goto('/budgets');
  await page.getByRole('button', { name: '编辑预算', exact: true }).click();
  await page.getByLabel('月度预算总额').fill('10000');
  await page.getByRole('button', { name: '保存预算', exact: true }).click();
  await expect(page.getByText('预算已保存')).toBeVisible();
  await openNavigationGroup(page, '总览');
  await page.locator('.shell-panel .panel-link[data-path="/"]').click();
  await expect(page.getByText('¥10,000.00')).toBeVisible();
});
test('统计分类逐级下钻保留日期与币种', async ({ page }) => {
  await page.goto('/reports');
  await page.getByRole('tab', { name: '分类分析' }).click();
  const row = page.getByRole('row').filter({ hasText: '餐饮食品' });
  await row.getByRole('button', { name: '下级分类' }).click();
  await expect(page.getByText('餐饮食品 / 下级分类')).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: '日常午餐' })
    .getByRole('button', { name: '交易明细' })
    .click();
  await expect(page).toHaveURL(/categoryId=lunch/);
  await expect(page).toHaveURL(/currency=CNY/);
  await expect(page).toHaveURL(/start=/);
});
test('跨币种转账显示转入金额并保存', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '账户间转账' }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('100');
  await option(page, '转入账户', '美元储蓄');
  await drawer.getByRole('textbox', { name: /^汇率/ }).fill('0.14');
  await expect(drawer.getByLabel('转入金额 · USD')).toHaveValue('14.00');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible();
});
test('信用卡账单展示并预选还款信用卡', async ({ page }) => {
  await page.goto('/accounts/credit');
  await expect(page.getByText('账单金额', { exact: true })).toBeVisible();
  await expect(page.getByText('待还款', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '去还款', exact: true }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(
    drawer.getByText('招商银行信用卡 · 欠款 ¥2,180.00', { exact: true }),
  ).toBeVisible();
});
test('拆分支出后按原分类退款', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '记支出' }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('200');
  await drawer.getByLabel('商户 / 对象').fill('浏览器拆分退款');
  await drawer.getByText('更多选项 · 拆分消费').click();
  await drawer.getByRole('switch', { name: '拆分为多个分类' }).click();
  await drawer.getByRole('button', { name: '添加拆分' }).click();
  await drawer.getByRole('button', { name: '添加拆分' }).click();
  const rows = drawer.locator('.split-row');
  await rows.nth(0).getByRole('combobox').click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('餐饮食品 / 日常午餐', { exact: true })
    .click();
  await rows.nth(0).getByPlaceholder('金额').fill('120');
  await rows.nth(1).getByRole('combobox').fill('日常用品');
  await rows.nth(1).getByRole('combobox').press('ArrowDown');
  await rows.nth(1).getByRole('combobox').press('Enter');
  await expect(
    rows.nth(1).getByTitle('购物消费 / 日常用品', { exact: true }),
  ).toBeVisible();
  await rows.nth(1).getByPlaceholder('金额').fill('80');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(
    page.getByText('消费已保存 · 交易后余额', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ant-drawer-content')).toHaveCount(0);
  await page.getByRole('button', { name: /^退\s*款$/ }).click();
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByLabel('原消费交易').fill('浏览器拆分退款');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '浏览器拆分退款' })
    .click();
  await expect(
    drawer.getByText('按原消费分类分配退款（不退款的分类填 0）'),
  ).toBeVisible();
  await drawer.getByRole('button', { name: '全额退还剩余金额' }).click();
  await expect(drawer.getByPlaceholder('0.00').first()).toHaveValue('200.00');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible();
});
