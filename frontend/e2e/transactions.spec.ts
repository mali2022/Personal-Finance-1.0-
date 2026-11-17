import { test, expect, openNavigationGroup } from './fixtures';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-page')).toBeVisible();
});
async function choose(
  page: import('@playwright/test').Page,
  label: string,
  option: string,
) {
  const drawer = page.locator('.ant-drawer-body');
  await drawer.getByLabel(label, { exact: true }).click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: option })
    .last()
    .click();
}
test('创建支出并编辑、软删除、恢复', async ({ page }) => {
  await page.getByRole('button', { name: '记支出' }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('25.50');
  await choose(page, '分类', '日常午餐');
  await drawer.getByLabel('商户 / 对象').fill('验收午餐');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.locator('.dashboard-recent-row').filter({ hasText: '验收午餐' })).toBeVisible();
  await page.locator('.dashboard-recent-row').filter({ hasText: '验收午餐' }).click();
  await page.getByRole('button', { name: /^编\s*辑$/ }).click();
  await page
    .locator('.ant-drawer-content')
    .last()
    .getByPlaceholder('0.00')
    .first()
    .fill('30');
  await page
    .locator('.ant-drawer-content')
    .last()
    .getByRole('button', { name: /^保\s*存$/ })
    .click();
  await page.getByRole('button', { name: /^删\s*除$/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('操作成功')).toBeVisible();
  await openNavigationGroup(page, '记账');
  await page
    .locator('.shell-panel .panel-link[data-path="/transactions"]')
    .click();
  await page.getByRole('button', { name: '高级筛选', exact: true }).click();
  await page.getByRole('combobox', { name: '记录状态' }).click();
  await page.getByText('回收站', { exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '验收午餐' })
    .getByRole('button', { name: '详情' })
    .click();
  await page.getByRole('button', { name: '恢复交易' }).click();
  await expect(page.getByText('操作成功')).toBeVisible();
});
test('创建收入', async ({ page }) => {
  await page.getByRole('button', { name: '记收入' }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('1000');
  await choose(page, '分类', '工资薪酬');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
test('创建转账不计入支出', async ({ page }) => {
  await page.getByRole('button', { name: '账户间转账' }).click();
  await expect(
    page.getByText(/转账本金不计入收入或支出.*手续费/),
  ).toBeVisible();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('100');
  await choose(page, '转入账户', '招商银行 ·');
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
test('关联原消费退款', async ({ page }) => {
  await page.getByRole('button', { name: /^退\s*款$/ }).click();
  const drawer = page.locator('.ant-drawer-content');
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('1');
  await drawer.getByLabel('原消费交易').click();
  await page.locator('.ant-select-item-option-content').first().click();
  await expect(page.getByText('已退款', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
});
