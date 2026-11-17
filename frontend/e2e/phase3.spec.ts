import type { Page } from '@playwright/test';
import { expect, test, openNavigationGroup } from './fixtures';
async function account(page: Page, label = '资金账户') {
  await page.getByLabel(label, { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '支付宝' })
    .first()
    .click();
}
test('借出分次归还并阻止超额', async ({ page }) => {
  await page.goto('/loans');
  await page.getByRole('button', { name: '新增借出', exact: true }).click();
  await page.getByLabel('借给谁', { exact: true }).fill('浏览器借款人');
  await page.getByLabel('金额', { exact: true }).fill('100');
  await account(page);
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器借款人' })
    .getByRole('button', { name: '查看详情' })
    .click();
  await page.getByRole('button', { name: '登记收到还款' }).click();
  await page.getByLabel('金额', { exact: true }).fill('101');
  await account(page, '收款账户');
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('金额必须大于 0 且不超过剩余额度')).toBeVisible();
  await page.getByLabel('金额', { exact: true }).fill('40');
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('部分完成')).toBeVisible();
  await expect(
    page.locator('.ant-drawer-content:visible').getByText('¥60.00').first(),
  ).toBeVisible();
});
test('报销提交、到账和完整历史', async ({ page }) => {
  await page.goto('/reimbursements');
  await page.getByRole('button', { name: '新增垫付' }).click();
  await page.getByLabel('报销对象', { exact: true }).fill('浏览器公司');
  await page.getByLabel('金额', { exact: true }).fill('200');
  await account(page);
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器公司' })
    .getByRole('button', { name: '查看详情' })
    .click();
  await page.getByRole('button', { name: '标记已提交' }).click();
  await expect(page.getByText('已提交', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '登记报销到账' }).click();
  await account(page, '收款账户');
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已报销', { exact: true })).toBeVisible();
  await expect(page.getByText('完整资金记录')).toBeVisible();
});
test('模板预填快速记账，仍需确认保存', async ({ page }) => {
  await page.goto('/templates');
  await page.getByRole('button', { name: '新增记账模板' }).click();
  await page.getByLabel('名称', { exact: true }).fill('浏览器早餐');
  await page.getByLabel('默认金额', { exact: true }).fill('15');
  await account(page, '默认账户');
  await page.getByLabel('默认分类', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '日常午餐' })
    .first()
    .click();
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器早餐' })
    .getByRole('button', { name: '使用模板' })
    .click();
  await expect(page.getByPlaceholder('0.00').first()).toHaveValue('15');
  await page
    .locator('.ant-drawer-content:visible')
    .getByRole('button', { name: /^保\s*存$/ })
    .click();
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible();
});
test('项目分析与标签筛选保留 URL', async ({ page }) => {
  await page.goto('/projects');
  const row = page.getByRole('row').filter({ hasText: '日本旅行' });
  await row.getByRole('button', { name: '项目分析' }).click();
  await expect(page.getByText('月度支出趋势')).toBeVisible();
  await page.locator('.ant-drawer-close').click();
  await row.getByRole('button', { name: '交易明细' }).click();
  await expect(page).toHaveURL(/projectId=travel/);
  await openNavigationGroup(page, '记账');
  await page.locator('.shell-panel .panel-link[data-path="/tags"]').click();
  await page
    .getByRole('row')
    .filter({ hasText: '工作' })
    .getByRole('button', { name: '交易明细' })
    .click();
  await expect(page).toHaveURL(/tagId=work/);
});
test('商户推荐分类并关联项目、标签，可从 URL 查询', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '记支出' }).click();
  const drawer = page.getByRole('dialog', { name: '记一笔' });
  await expect(drawer.getByPlaceholder('0.00').first()).toBeFocused();
  await drawer.getByPlaceholder('0.00').first().fill('25');
  await drawer.getByLabel('商户 / 对象').fill('麦当劳');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '麦当劳' })
    .first()
    .click();
  await expect(
    drawer.getByText('餐饮食品 / 日常午餐', { exact: true }),
  ).toBeVisible();
  await drawer.getByText('更多选项 · 项目与标签').click();
  await drawer.getByLabel('项目', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '日本旅行' })
    .first()
    .click();
  await drawer.getByLabel('标签', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '工作' })
    .first()
    .click();
  await drawer.getByLabel('备注').click();
  await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(
    page.getByText('消费已保存 · 交易后余额', { exact: true }),
  ).toBeVisible();
  await openNavigationGroup(page, '记账');
  await page.locator('.shell-panel .panel-link[data-path="/projects"]').click();
  const row = page.getByRole('row').filter({ hasText: '日本旅行' });
  await expect(row.getByText('¥25.00', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '交易明细' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: '麦当劳' }),
  ).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: '麦当劳' })
    .getByRole('button', { name: '详情', exact: true })
    .click();
  await page.getByRole('button', { name: /^编\s*辑$/ }).click();
  const edit = page.getByRole('dialog', { name: '编辑交易' });
  await expect(edit.getByPlaceholder('0.00').first()).toBeFocused();
  await edit.getByPlaceholder('0.00').first().fill('26');
  await edit.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(
    page.getByRole('dialog', { name: '交易详情' }).getByText(/-\s*¥26\.00/),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: '交易详情' })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await openNavigationGroup(page, '记账');
  await page.locator('.shell-panel .panel-link[data-path="/projects"]').click();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: '日本旅行' })
      .getByText('¥26.00', { exact: true }),
  ).toBeVisible();
});
test('借入明确区分收款和偿还', async ({ page }) => {
  await page.goto('/loans');
  await page.getByRole('tab', { name: '借入 · 我欠别人' }).click();
  await page.getByRole('button', { name: '新增借入' }).click();
  await page.getByLabel('向谁借', { exact: true }).fill('浏览器出借人');
  await page.getByLabel('金额', { exact: true }).fill('300');
  await account(page);
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器出借人' })
    .getByRole('button', { name: '查看详情' })
    .click();
  await expect(page.getByRole('button', { name: '登记偿还' })).toBeEnabled();
});
test('手机我的页面可到报销，项目隐私模式隐藏图表', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('button', { name: '打开全部功能' }).click();
  const menu = page.locator('.shell-mobile-drawer');
  await menu
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: '账户与资产' })
    .click();
  await menu.getByRole('menuitem').filter({ hasText: '报销管理' }).click();
  await expect(page.getByRole('button', { name: '新增垫付' })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await page.getByRole('button', { name: '打开全部功能' }).click();
  await menu
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: '记账' })
    .click();
  await menu.getByRole('menuitem', { name: '项目', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: '项目分析' }) })
    .first()
    .getByRole('button', { name: '项目分析' })
    .click();
  await expect(page.getByText('金额已隐藏，统计图暂停显示。')).toBeVisible();
  await expect(page.getByRole('img', { name: '财务统计图表' })).toHaveCount(0);
});
