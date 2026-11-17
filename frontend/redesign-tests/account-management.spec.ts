import { test, expect } from '@playwright/test';
import fs from 'node:fs';
for (const width of [360, 768, 1440])
  test(`account management ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const accounts = [
      {
        id: 'a',
        name: '工资卡',
        institution: '招商银行',
        type: 'Bank',
        currency: 'CNY',
        balance: '1000.00',
        availableBalance: '800.00',
        status: 'Active',
        lastFourDigits: '8826',
        cardNumberMasked: '•••• 8826',
        version: '1',
        sortOrder: 0,
      },
      {
        id: 'b',
        name: '备用卡',
        type: 'Bank',
        currency: 'CNY',
        balance: '0.00',
        availableBalance: '0.00',
        status: 'Active',
        version: '1',
        sortOrder: 1,
      },
      {
        id: 'c',
        name: '信用卡',
        type: 'CreditCard',
        currency: 'CNY',
        balance: '-200.00',
        availableBalance: '-200.00',
        creditLimit: '30000.00',
        status: 'Active',
        version: '1',
        sortOrder: 2,
      },
      {
        id: 'd',
        name: '异常余额',
        type: 'Bank',
        currency: 'USD',
        balance: '-1.00',
        availableBalance: '-1.00',
        status: 'Active',
        version: '1',
        sortOrder: 3,
      },
    ];
    let reordered = false;
    const writes: string[] = [];
    await page.route(/http:\/\/127\.0\.0\.1:5175\/api\/.*/, async (route) => {
      const p = new URL(route.request().url()).pathname.slice(4),
        method = route.request().method();
      let data: unknown = [];
      if (method !== 'GET') writes.push(p);
      if (p === '/auth/me')
        data = {
          id: 'test',
          displayName: '账户测试',
          email: 'fixture@example.test',
          permissions: [],
        };
      else if (p === '/auth/profile') data = { preferredCurrency: 'CNY' };
      else if (p === '/accounts' && method === 'GET') data = accounts;
      else if (p === '/account-groups') data = [];
      else if (p === '/accounts/reorder') {
        const ids = route
          .request()
          .postDataJSON()
          .items.map((a: { id: string }) => a.id);
        accounts.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        reordered = true;
        data = { updated: 4 };
      } else if (p === '/currencies')
        data = [
          { code: 'CNY', enabled: true },
          { code: 'USD', enabled: true },
        ];
      else if (p.endsWith('/delete-preview'))
        data = {
          allowed: false,
          balance: '1000.00',
          historicalTransactionCount: 1,
          ledgerEntryCount: 2,
          reasons: ['存在历史交易'],
          version: '1',
        };
      else if (p === '/auth/refresh') data = { accessToken: 'test' };
      await route.fulfill({ json: { data } });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.log('PAGE ERROR', e.stack);
    });
    await page.goto('/accounts');
    await expect(page.getByRole('heading', { name: '账户总览' })).toBeVisible();
    await expect(page.getByText(/当前欠款 · CNY/)).toBeVisible();
    await expect(page.getByText(/异常负余额 · USD/)).toBeVisible();
    await page.getByRole('button', { name: '折叠摘要' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: '展开摘要' })).toBeVisible();
    await page.getByRole('button', { name: '展开摘要' }).click();
    await page.getByRole('checkbox', { name: '隐藏零余额账户' }).check();
    await expect(page.locator('[data-account-id="b"]')).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: '保存筛选偏好' }).click();
    await page.reload();
    await expect(
      page.getByRole('checkbox', { name: '隐藏零余额账户' }),
    ).toBeChecked();
    await page.getByRole('button', { name: '清空筛选' }).click();
    await expect(page.locator('[data-account-id="b"]')).toBeVisible();
    await page
      .getByRole('button', { name: '排序 工资卡', exact: true })
      .focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => reordered).toBe(true);
    expect(writes).toEqual(['/accounts/reorder']);
    await page.locator('.ant-collapse-header').click();
    await expect(page.locator('[data-account-id="a"]')).not.toBeVisible();
    await page.reload();
    await expect(page.locator('[data-account-id="a"]')).not.toBeVisible();
    await page.locator('.ant-collapse-header').click();
    await expect(page.locator('[data-account-id="a"]')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({
      name: 'accounts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '账户名称,账户类型,币种,开户银行/机构,卡号末四位,银行网点,信用额度,账单日,还款日\n导入预览,Bank,CNY,银行,1234,网点,,,',
      ),
    });
    await expect(
      page.getByRole('dialog', { name: '预览账户导入' }),
    ).toBeVisible();
    await expect(page.getByText('导入预览', { exact: true })).toBeVisible();
    await page.locator('.ant-modal:visible .ant-modal-close').click();
    await page.getByRole('button', { name: '全部删除', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '永久删除全部账户' }),
    ).toBeDisabled();
    await page.locator('.ant-modal:visible .ant-modal-close').click();
    expect(writes).toEqual(['/accounts/reorder']);
    await page.getByRole('button', { name: '＋ 新增账户' }).click();
    await expect(page.getByLabel('开户银行', { exact: true })).toBeVisible();
    await expect(page.getByLabel('银行卡号', { exact: true })).toBeVisible();
    await expect(page.getByLabel('银行网点', { exact: true })).toBeVisible();
    await page.locator('.ant-drawer-close').click();
    await page.getByLabel('搜索账户', { exact: true }).fill('8826');
    await expect(page.locator('.account-manager-row')).toHaveCount(1);
    await page.getByLabel('搜索账户', { exact: true }).fill('');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    fs.mkdirSync('verification/accounts', { recursive: true });
    await page.screenshot({
      path: `verification/accounts/${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
for (const width of [360, 1440]) {
  test.describe(`group deletion ${width}`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    test('click selection, failed request feedback, refreshed retry and account preservation', async ({
      page,
    }) => {
      const groupId = '11111111-1111-4111-8111-111111111111';
      let groups = [
        { id: groupId, name: '生活账户', version: '1', sortOrder: 0 },
      ];
      const accounts = [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: '测试储蓄卡',
          type: 'Bank',
          currency: 'CNY',
          balance: '120.00',
          availableBalance: '120.00',
          status: 'Active',
          groupId: groupId,
          version: '1',
          sortOrder: 7,
        },
      ];
      let deletes = 0;
      await page.route(/http:\/\/127\.0\.0\.1:5175\/api\/.*/, async (route) => {
        const request = route.request(),
          p = new URL(request.url()).pathname.slice(4);
        let data: unknown = [];
        if (p === '/auth/me')
          data = { id: 'test', displayName: '测试', permissions: [] };
        else if (p === '/auth/profile') data = { preferredCurrency: 'CNY' };
        else if (p === '/accounts') data = accounts;
        else if (p === '/account-groups') data = groups;
        else if (
          p === '/account-groups/' + groupId &&
          request.method() === 'DELETE'
        ) {
          deletes++;
          expect(request.headers()['idempotency-key']).toBeTruthy();
          if (deletes === 1) {
            groups[0].version = '2';
            await route.fulfill({
              status: 409,
              json: { code: 'VERSION_CONFLICT', message: '分组已更新，请重试' },
            });
            return;
          }
          expect(request.headers()['if-match']).toBe('2');
          groups = [];
          accounts[0].groupId = '';
          data = { deleted: true, moved: 1 };
        }
        await route.fulfill({ json: { data } });
      });
      await page.goto('/accounts');
      await page.getByRole('button', { name: '删除分组', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: '选择要删除的账户分组' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: '删除分组 生活账户', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: '删除账户分组' })
        .getByRole('button', { name: '删除分组', exact: true })
        .click();
      await expect(
        page.getByText('分组已更新，请重试', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog', { name: '选择要删除的账户分组' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: '删除分组 生活账户', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: '删除账户分组' })
        .getByRole('button', { name: '删除分组', exact: true })
        .click();
      await expect(
        page.getByText('账户分组已删除，账户已移至未分组', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.ant-collapse-header')).toContainText(
        '未分组',
      );
      await expect(page.locator('[data-account-id]')).toHaveCount(1);
      await expect(page.locator('[data-account-id]')).toContainText('120.00');
      await expect(
        page.getByRole('button', { name: '删除分组', exact: true }),
      ).toBeDisabled();
      expect(deletes).toBe(2);
    });
  });
}
