import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const credentials = JSON.parse(
  fs.readFileSync(
    '../.local-run/spending-value/credentials.local.json',
    'utf8',
  ),
);
for (const width of [360, 1440])
  test(`value lab v2 complete real workflow ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    const section = async (name: string) => {
      if (width < 768) {
        await page
          .getByRole('combobox', { name: '实验室页面', exact: true })
          .selectOption({ label: name });
      } else await page.getByRole('tab', { name, exact: true }).click();
    };
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/planning/spending-value');
    await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: /^登\s*录$/ }).click();
    await expect(page).not.toHaveURL(/login/);
    await page.goto('/planning/spending-value');
    await expect(
      page.getByRole('heading', {
        name: '消费价值决策实验室 2.0',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('spinbutton', { name: '预算', exact: true })
      .fill('1000');
    await page
      .getByRole('spinbutton', { name: '可用现金（未知则留空）', exact: true })
      .fill('2000');
    await page
      .getByRole('spinbutton', { name: '预算最低保留', exact: true })
      .fill('100');
    await page
      .getByRole('spinbutton', { name: '最大小时', exact: true })
      .fill('20');
    await page
      .getByRole('spinbutton', { name: '最大精力单位', exact: true })
      .fill('20');
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole('button', { name: '添加候选项目', exact: true })
        .click();
      await page
        .getByLabel(`candidate-name-${i}`, { exact: true })
        .fill(['课程', '放松体验', '设备'][i]);
      await page
        .getByRole('spinbutton', { name: `unit-price-${i}`, exact: true })
        .fill(String((i + 1) * 100));
      await page
        .getByRole('spinbutton', { name: `score-${i}-0-${i}`, exact: true })
        .fill('8');
      await page
        .getByRole('checkbox', { name: `confirm-${i}-0`, exact: true })
        .check();
    }
    const generated = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/spending-value/optimize') &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /生成组合并保存分析快照/ }).click();
    expect((await generated).ok()).toBeTruthy();
    await expect(page.getByRole('table').first()).toContainText('可行');
    await section('多目标与敏感性');
    await page
      .getByRole('button', {
        name: '仅重排已保存方案（不扫描账本）',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: /分析情景范围/ }).click();
    await expect(
      page.getByText('情景范围不是发生概率', { exact: true }),
    ).toBeVisible();
    await section('个人偏好');
    await page
      .getByRole('button', { name: '读取个人偏好与依据', exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: '主动授权偏好学习', exact: true })
      .check();
    await page
      .getByRole('button', { name: '保存授权状态与当前手动权重', exact: true })
      .click();
    await section('资金对比');
    await page
      .getByRole('button', {
        name: '执行此方案并开始复盘（不记账）',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: '搜索真实支出', exact: true })
      .click();
    await page.getByRole('combobox', { name: '购买交易', exact: true }).click();
    await page
      .getByText('Value purchase (200)', { exact: true })
      .last()
      .click();
    await page.keyboard.press('Escape');
    await page
      .getByRole('spinbutton', { name: 'actualUses', exact: true })
      .fill('10');
    await page
      .getByRole('spinbutton', { name: 'satisfaction', exact: true })
      .fill('8');
    await page.getByLabel('购买后评价', { exact: true }).fill('Browser review');
    await page
      .getByRole('checkbox', { name: /主动授权将当前重要性权重/ })
      .check();
    const reviewed = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/spending-value/feedback') &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /保存消费反馈/ }).click();
    expect((await reviewed).ok()).toBeTruthy();
    await expect(page.getByText('真实消费复盘', { exact: true })).toBeVisible();
    await section('智能生成');
    const next = page.waitForResponse(
      (r) =>
        /\/runs\/.*\/reevaluate$/.test(r.url()) &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /生成组合并保存分析快照/ }).click();
    expect((await next).ok()).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    expect(errors).toEqual([]);
    await page.evaluate(() => {
      const key = 'finance-ui';
      const state = JSON.parse(
        localStorage.getItem(key) || '{"state":{},"version":0}',
      );
      state.state.language = 'en';
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Spending Value Lab 2.0',
        exact: true,
      }),
    ).toBeVisible();
  });
