import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const credentials = JSON.parse(
  fs.readFileSync(
    '../.local-run/spending-value/credentials.local.json',
    'utf8',
  ),
);
for (const width of [360, 1440])
  test(`spending value real API ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    const suffix = Date.now();
    const name = `Spending-browser-${width}-${suffix}`;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/planning/spending-value');
    await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: /^登\s*录$/ }).click();
    await expect(page).not.toHaveURL(/login/);
    await page.goto('/planning/spending-value');
    if (width < 768) {
      await page
        .getByRole('combobox', { name: '实验室页面', exact: true })
        .selectOption({ label: '手动对比' });
    } else
      await page.getByRole('tab', { name: '手动对比', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: '消费价值决策实验室 / Spending Value Lab',
      }),
    ).toBeVisible();
    await page.getByLabel('名称 / Name', { exact: true }).fill(name);
    await page
      .getByText('可用现金（用户假设）/ Cash assumption', { exact: true })
      .getByRole('spinbutton')
      .fill('2000');
    await page
      .getByText('可用小时 / Hours', { exact: true })
      .getByRole('spinbutton')
      .fill('10');
    await page
      .getByRole('button', { name: '添加组合分项 / Add item', exact: true })
      .nth(0)
      .click();
    await page
      .getByRole('button', { name: '添加组合分项 / Add item', exact: true })
      .nth(0)
      .click();
    await page
      .getByText('金额 / Cost', { exact: true })
      .nth(0)
      .getByRole('spinbutton')
      .fill('100');
    await page
      .getByText('金额 / Cost', { exact: true })
      .nth(1)
      .getByRole('spinbutton')
      .fill('200');
    await page
      .getByRole('checkbox', {
        name: '我确认主观评分 / I confirm these subjective scores',
      })
      .nth(0)
      .check();
    await page
      .getByRole('checkbox', {
        name: '我确认主观评分 / I confirm these subjective scores',
      })
      .nth(1)
      .check();
    await page.getByRole('button', { name: /比较 \/ Compare/ }).click();
    await expect(page.getByRole('table').last()).toContainText(
      '可行 / Feasible',
    );
    await expect(page.getByRole('table').last()).toContainText('700');
    await page
      .getByRole('button', { name: '权重敏感性 / Sensitivity', exact: true })
      .click();
    await expect(page.getByText(/偏好并列，无法明确排序/)).toBeVisible();
    const save = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/spending-value') &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /保存 \/ Save/ }).click();
    expect((await save).ok()).toBeTruthy();
    await page
      .getByRole('button', { name: '历史 / History', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: name, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: '消费价值决策实验室 / Spending Value Lab',
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
