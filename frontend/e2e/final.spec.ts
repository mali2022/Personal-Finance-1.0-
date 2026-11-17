import { test, expect, openNavigationGroup } from './fixtures';
import { accounts, categories, transactions } from '../src/mocks/seed';
test('收入一级分类可查，重置与浏览器后退同步金额筛选', async ({ page }) => {
  await page.goto('/transactions?type=Income&categoryId=salary&min=1000');
  await expect(
    page.getByRole('row').filter({ hasText: '工资薪酬' }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('row').filter({ hasText: '职业收入' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: '高级筛选', exact: true }).click();
  await expect(page.getByLabel('最低金额')).toHaveValue(/^1000(?:\.00)?$/);
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.getByLabel('最低金额')).toHaveValue('');
  await expect(page).toHaveURL(/\/transactions$/);
  await page.goBack();
  await expect(page.getByLabel('最低金额')).toHaveValue(/^1000(?:\.00)?$/);
  await expect(
    page.getByRole('row').filter({ hasText: '工资薪酬' }),
  ).toHaveCount(1);
});
test('资产损失独立记账并可删除恢复', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: '更多交易', exact: true }).click();
  await page.getByRole('menuitem', { name: '资产损失', exact: true }).click();
  const entry = page.getByRole('dialog', { name: '记一笔', exact: true });
  await expect(entry.getByText(/资产损失会减少余额与净资产/)).toBeVisible();
  await expect(entry.getByPlaceholder('0.00').first()).toBeFocused();
  await entry.getByPlaceholder('0.00').first().fill('20.50');
  await entry.getByLabel('分类', { exact: true }).fill('资产损失');
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: '资产损失' })
    .click();
  await entry.getByLabel('备注', { exact: true }).fill('最终验收现金遗失');
  await entry.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await openNavigationGroup(page, '记账');
  await page
    .locator('.shell-panel .panel-link[data-path="/transactions"]')
    .click();
  await page
    .getByRole('searchbox', { name: '搜索交易', exact: true })
    .fill('最终验收现金遗失');
  await page
    .getByRole('searchbox', { name: '搜索交易', exact: true })
    .press('Enter');
  const row = page.getByRole('row').filter({ hasText: '最终验收现金遗失' });
  await row.getByRole('button', { name: '详情' }).click();
  const detail = page.getByRole('dialog', { name: '交易详情' });
  await detail.getByRole('button', { name: /^删\s*除$/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: '高级筛选', exact: true }).click();
  await page.getByRole('combobox', { name: '记录状态' }).click();
  await page.getByText('回收站', { exact: true }).click();
  await row.getByRole('button', { name: '详情' }).click();
  await detail.getByRole('button', { name: '恢复交易' }).click();
  await expect(page.getByText('操作成功').last()).toBeVisible();
  await expect(row).toHaveCount(0);
});
test('生产 API 接入：退出后新会话不会复用上个会话的交易缓存', async ({
  page,
}) => {
  let loggedIn = true;
  let nextUser = false;
  let newSessionRequests = 0;
  const user = () => ({
    id: nextUser ? 'u2' : 'u1',
    displayName: nextUser ? '第二用户' : '林予安',
    email: 'demo@example.com',
    permissions: ['finance:read', 'finance:write'],
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/logout') {
      loggedIn = false;
      return route.fulfill({ json: { data: null } });
    }
    if (path === '/api/auth/login') {
      loggedIn = true;
      nextUser = true;
      return route.fulfill({
        json: { data: { user: user(), accessToken: 'new-session' } },
      });
    }
    if (!loggedIn)
      return route.fulfill({
        status: 401,
        json: { code: 'UNAUTHORIZED', message: '请先登录' },
      });
    if (path === '/api/auth/me')
      return route.fulfill({ json: { data: user() } });
    if (path === '/api/auth/refresh')
      return route.fulfill({
        json: {
          data: { accessToken: nextUser ? 'new-session' : 'old-session' },
        },
      });
    if (path === '/api/accounts')
      return route.fulfill({ json: { data: accounts } });
    if (path === '/api/categories')
      return route.fulfill({ json: { data: categories } });
    if (path === '/api/transactions') {
      if (
        nextUser &&
        route.request().headers().authorization === 'Bearer new-session'
      )
        newSessionRequests++;
      return route.fulfill({
        json: {
          data: {
            items: nextUser ? [] : [transactions[0]],
            total: nextUser ? 0 : 1,
            page: 1,
            pageSize: 20,
          },
        },
      });
    }
    if (path.startsWith('/api/directory/'))
      return route.fulfill({
        json: { data: { items: [], total: 0, page: 1, pageSize: 100 } },
      });
    return route.fulfill({
      status: 503,
      json: { code: 'TEST_UNSUPPORTED', message: '未提供测试接口' },
    });
  });
  await page.goto('http://127.0.0.1:4173/transactions');
  await expect(
    page.getByRole('row').filter({ hasText: '工资薪酬' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: '用户菜单' }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel('邮箱', { exact: true }).fill('next@example.com');
  await page.getByLabel('密码', { exact: true }).fill('password-test');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await openNavigationGroup(page, '记账');
  await page
    .locator('.shell-panel .panel-link[data-path="/transactions"]')
    .click();
  await expect(page.getByText('暂无交易，试试调整筛选条件')).toBeVisible();
  await expect.poll(() => newSessionRequests).toBeGreaterThan(0);
  await expect(
    page.getByRole('row').filter({ hasText: '工资薪酬' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '用户菜单' })).toContainText(
    '第二用户',
  );
});
test('无效收藏链接给出说明；手机特殊交易与键盘入口可用', async ({ page }) => {
  await page.goto('/transactions?min=oops&type=Bad&page=Infinity');
  await expect(page.getByRole('alert').filter({ hasText: '金额筛选无效' })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await page.locator('body').press('/');
  await expect(page.getByLabel('全局搜索')).toBeFocused();
  await page.getByLabel('全局搜索').fill('麦当劳');
  await page.getByLabel('全局搜索').press('e');
  await expect(page.getByRole('dialog', { name: '记一笔' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('navigation', { name: '手机导航' })
    .getByRole('button', { name: '打开全部功能' })
    .click();
  const mobileMenu = page.getByRole('dialog', { name: '全部功能' });
  await mobileMenu.locator('.ant-drawer-close').click();
  await page.getByRole('button', { name: '快速记账', exact: true }).click();
  await page
    .getByRole('combobox', { name: '记账类型', exact: true })
    .locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')
    .click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('资产损失', { exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '记一笔' })).toBeVisible();
  await expect(page.getByText(/资产损失会减少余额与净资产/)).toBeVisible();
});
