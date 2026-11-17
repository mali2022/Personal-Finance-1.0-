import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const book = {
  id: '11111111-1111-1111-1111-111111111111',
  name: '家庭日常账本',
  kind: 'Book',
  role: 'Owner',
  description: '日常生活与共同开销',
  sortOrder: 0,
  archived: false,
  version: '1',
};
const family = {
  ...book,
  id: '22222222-2222-2222-2222-222222222222',
  name: '我们的家',
  kind: 'Family',
};
const member = {
  id: '33333333-3333-3333-3333-333333333333',
  name: '家庭成员',
  role: 'Owner',
  profile: '共同管理家庭开销',
  active: true,
  version: '1',
};
for (const width of [390, 1440])
  test(`账本及家庭中心 ${width}px`, async ({ page }) => {
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') console.log('CONSOLE', e.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname === '/api/auth/me')
        data = {
          id: 'local-layout-user',
          displayName: '布局验证',
          email: 'layout@example.test',
          preferredCurrency: 'CNY',
          language: 'zh-CN',
        };
      if (url.pathname === '/api/optional-modules') data = { concerts: false };
      if (url.pathname === '/api/spaces') data = [book, family];
      if (
        url.pathname === `/api/spaces/${book.id}` ||
        url.pathname === `/api/spaces/${family.id}`
      )
        data = {
          space: url.pathname.endsWith(family.id) ? family : book,
          members: [member],
          ownMembers: [member],
          totals: [{ currency: 'CNY', income: '10000.00', expense: '3200.00' }],
          transactions: [],
          budgets: [
            {
              month: '2026-10',
              currency: 'CNY',
              amount: '5000.00',
              actual: '3200.00',
              version: '1',
            },
          ],
          balances: [],
          settlements: [],
          invitations: [],
        };
      return route.fulfill({ json: { data } });
    });
    await page.goto(`/books?id=${book.id}`);
    await expect(
      page.getByRole('heading', { name: '账本中心', exact: true }),
    ).toBeVisible();
    if (width < 760)
      await expect(
        page.getByRole('combobox', { name: '中心功能' }),
      ).toBeVisible();
    else
      await expect(page.getByRole('tab', { name: '账本概览' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: '新建账本', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: /取\s*消/ }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    fs.mkdirSync('verification/collaboration', { recursive: true });
    await page.screenshot({
      path: `verification/collaboration/books-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto(`/families?id=${family.id}`);
    await expect(
      page.getByRole('heading', { name: '家庭中心', exact: true }),
    ).toBeVisible();
    if (width < 760) {
      await page.locator('[aria-label="中心功能"].ant-select').click();
      await page.getByTitle('家庭预算', { exact: true }).click();
    } else
      await page.getByRole('tab', { name: '家庭预算', exact: true }).click();
    await expect(
      page.getByText('实际净支出 3,200.00 / 预算 5,000.00'),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `verification/collaboration/family-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
