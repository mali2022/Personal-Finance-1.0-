import { test, expect } from './fixtures';
const sample = {
  date: '2000-10-21',
  summaries: [
    {
      year: 2024,
      currency: 'CNY',
      expense: '80.00',
      income: '300.00',
      refund: '20.00',
      count: 3,
      categories: [{ name: '餐饮', amount: '80.00' }],
      merchants: [{ name: '时光咖啡', count: 3 }],
    },
    {
      year: 2022,
      currency: 'CNY',
      expense: '0.00',
      income: '0.00',
      refund: '0.00',
      count: 1,
      categories: [],
      merchants: [],
    },
  ],
  aggregates: [
    {
      currency: 'CNY',
      expense: '80.00',
      income: '300.00',
      refund: '20.00',
      count: 4,
      years: 2,
      average: '40.00',
      highestYear: 2024,
    },
  ],
  coveredYears: [2024, 2022],
  latestYear: 2024,
  categories: [{ name: '餐饮', amount: '80.00' }],
  merchants: [{ name: '时光咖啡', count: 3, years: 2 }],
  tags: [{ name: '日常', count: 2 }],
  highest: [{ id: 'memory-tx', currency: 'CNY', amount: '100.00' }],
  items: [
    {
      id: 'memory-tx',
      currency: 'CNY',
      amount: '100.00',
      type: 'Expense',
      occurredAt: '2024-10-20T16:30:00Z',
      merchant: '时光咖啡',
      note: '已有的消费备注',
      tags: ['日常'],
    },
  ],
  total: 4,
  page: 1,
  pageSize: 10,
};
async function prepare(page: import('@playwright/test').Page, empty = false) {
  const bookmarks: Record<string, unknown>[] = [];
  await page.context().route('**/api/memories/bookmarks', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      bookmarks.splice(0, bookmarks.length, {
        ...body,
        id: 'bookmark',
        version: '1',
      });
      await route.fulfill({ json: { data: bookmarks[0] } });
    } else await route.fulfill({ json: { data: bookmarks } });
  });
  await page.context().route('**/api/reports/on-this-day**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/candidate'))
      return route.fulfill({
        json: { data: { found: true, date: '2024-09-04', year: 2024 } },
      });
    if (url.pathname.endsWith('/analysis'))
      return route.fulfill({
        json: {
          data: {
            explanation: '2024年10月21日，记录净消费80元；未记录年份保持未知。',
          },
        },
      });
    const year = url.searchParams.get('years');
    const data = empty
      ? {
          ...sample,
          aggregates: [],
          summaries: [],
          coveredYears: [],
          items: [],
          total: 0,
        }
      : year
        ? {
            ...sample,
            summaries: sample.summaries.filter((x) => String(x.year) === year),
            coveredYears: [Number(year)],
          }
        : sample;
    await route.fulfill({ json: { data } });
  });
  await page.goto('/memories/on-this-day?date=2000-10-21&type=All');
  await expect(
    page.getByRole('heading', { name: '历史上的今天', exact: true }),
  ).toBeVisible();
}
test('timeline displays notes, income, refunds and recorded zero', async ({
  page,
}) => {
  await prepare(page);
  await expect(page.getByText('历史累计消费（净额）')).toBeVisible();
  await expect(page.getByText('历史收入', { exact: true })).toBeVisible();
  await expect(page.getByText('已有的消费备注')).toBeVisible();
  await expect(page.getByText('2022', { exact: true }).first()).toBeVisible();
  await page.getByText('趋势图', { exact: true }).click();
  await page.getByRole('button', { name: '全部折叠' }).click();
  await expect(page.getByText('已有的消费备注')).not.toBeVisible();
  await page.screenshot({
    path: 'test-results/memory-desktop.png',
    fullPage: true,
  });
});
test('filters survive refresh and back; random uses a real candidate', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('button', { name: '筛选历史记忆', exact: true }).click();
  const input = page.getByPlaceholder('商户名称关键词');
  await input.fill('咖啡');
  await input.press('Enter');
  await expect(page).toHaveURL(/merchant=/);
  await page.reload();
  await expect(page).toHaveURL(/merchant=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/merchant=/);
  await page.getByRole('button', { name: '随机回顾', exact: true }).click();
  await expect(page).toHaveURL(/date=2000-09-04/);
});
test('favorites and personal notes persist and can be removed', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('button', { name: '收藏 / 记忆备注' }).click();
  const modal = page.getByRole('dialog', { name: '收藏与个人记忆' });
  await modal.getByLabel('个人记忆备注').fill('我的真实记忆');
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect(page.getByText('我的记忆：我的真实记忆')).toBeVisible();
  await page.getByRole('button', { name: '查看收藏' }).click();
  const drawer = page.getByRole('dialog', { name: '我的收藏与记忆' });
  await expect(drawer.getByText('我的真实记忆', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: '编辑 / 取消收藏' }).click();
  await modal.getByLabel('收藏此回忆').uncheck();
  await modal.getByLabel('个人记忆备注').fill('');
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect(drawer.getByText('还没有收藏或记忆备注')).toBeVisible();
});
test('empty state offers nearest history without duplicate placeholders', async ({
  page,
}) => {
  await prepare(page, true);
  await expect(
    page.getByText(
      '没有找到符合条件的历史记录。其他日期或筛选范围可能仍有记录。',
    ),
  ).toBeVisible();
  await expect(page.getByText('暂无数据', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '最近有记录的日期' }).click();
  await expect(page).toHaveURL(/date=2000-09-04/);
});
test('mobile fits 390px, AI requires consent, PNG card downloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await expect(
    page.getByRole('button', { name: '生成消费回忆' }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: /同意向 AI/ }).check();
  await page.getByRole('button', { name: '生成消费回忆' }).click();
  await expect(
    page.getByText('2024年10月21日，记录净消费80元；未记录年份保持未知。'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/memory-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '生成回忆卡片' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 PNG 卡片' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
