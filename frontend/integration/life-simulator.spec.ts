import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const credentials = JSON.parse(
  fs.readFileSync(
    '../.local-run/life-simulator/credentials.local.json',
    'utf8',
  ),
);
for (const width of [360, 1440])
  test(`isolated real API life decisions ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/planning/life-simulator');
    await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: /^登\s*录$/ }).click();
    await expect(page).not.toHaveURL(/login/);
    await page.goto('/planning/life-simulator');
    await expect(
      page.getByRole('heading', { name: '人生财务决策模拟器' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '读取并冻结财务基准' }).click();
    const suffix = `${width}-${Date.now()}`;
    const rent = `Rent-${suffix}`;
    const buy = `Buy-${suffix}`;
    await page.getByLabel('情景名称', { exact: true }).fill(rent);
    for (const [label, value] of [
      ['可用现金', '300000'],
      ['预计每月税后收入', '8000'],
      ['每月生活费用（不含还本及投资）', '5000'],
      ['模拟月数（1–480）', '120'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: '保存情景', exact: true }).click();
    await page
      .getByText('我已审核未来收入、费用、资产分类和贷款假设', { exact: true })
      .click();
    await page.getByRole('button', { name: '执行模拟并归档' }).click();
    await expect(page.getByText('财务决策报告', { exact: true })).toBeVisible();
    const rentalResult = await page
      .locator('.life-report')
      .getByText('¥660,000.00', { exact: true })
      .count();
    expect(rentalResult).toBeGreaterThan(0);
    await page.getByLabel('情景名称', { exact: true }).fill(buy);
    await page.getByRole('button', { name: '添加决策到时间线' }).click();
    await expect(page.getByLabel('事件名称', { exact: true })).toHaveCount(2);
    await page
      .getByText('我已审核未来收入、费用、资产分类和贷款假设', { exact: true })
      .click();
    await page.getByRole('button', { name: '执行模拟并归档' }).click();
    await expect(page.getByText('财务决策报告', { exact: true })).toBeVisible();
    const history = page
      .locator('.ant-card')
      .filter({ has: page.getByText('历史运行与多方案比较', { exact: true }) });
    for (const name of [rent, buy])
      await history
        .getByRole('row')
        .filter({ hasText: name })
        .getByRole('checkbox')
        .check();
    await history.getByRole('button', { name: '比较所选运行' }).click();
    await expect(
      history.getByRole('columnheader', { name: '相对基准差额', exact: true }),
    ).toBeVisible();
    const saved = page
      .locator('.ant-card')
      .filter({ has: page.getByText('已保存情景', { exact: true }) });
    await saved
      .getByRole('row')
      .filter({ hasText: rent })
      .getByRole('button', { name: /^打\s*开$/ })
      .click();
    await expect(page.getByLabel('事件名称', { exact: true })).toHaveCount(0);
    await page.getByLabel('情景名称', { exact: true }).fill(`Down40-${suffix}`);
    await page.getByLabel('首付百分比', { exact: true }).fill('40');
    await page.getByRole('button', { name: '添加决策到时间线' }).click();
    await page.getByRole('button', { name: '另存副本', exact: true }).click();
    await page
      .getByText('我已审核未来收入、费用、资产分类和贷款假设', { exact: true })
      .click();
    await page.getByRole('button', { name: '执行模拟并归档' }).click();
    await expect(page.getByText('财务决策报告', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 CSV', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('life-simulation.csv');

    await page.reload();
    await history
      .getByRole('row')
      .filter({ hasText: `Down40-${suffix}` })
      .getByRole('button', { name: '打开报告', exact: true })
      .first()
      .click();
    await expect(page.getByText('财务决策报告', { exact: true })).toBeVisible();
    await page.locator('.life-report').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/life-simulator/life-${width}.png`,
      fullPage: false,
    });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ))
    )
      console.log(
        'OVERFLOW',
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('body *'))
            .filter(
              (e) =>
                e.getBoundingClientRect().right > window.innerWidth + 1 &&
                !e.closest('.ant-table-content, .ant-table-body'),
            )
            .slice(0, 25)
            .map((e) => ({
              tag: e.tagName,
              className: e.className,
              width: e.getBoundingClientRect().width,
              right: e.getBoundingClientRect().right,
            })),
        ),
      );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test('retirement guide uses real computation and never spends home equity', async ({
  page,
}) => {
  await page.goto('/planning/life-simulator');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/planning/life-simulator');
  await page.getByRole('button', { name: '读取并冻结财务基准' }).click();
  for (const [label, value] of [
    ['可用现金', '0'],
    ['可投资金融资产', '10000'],
    ['其他可估值资产（非现金）', '1000000'],
    ['预计每月税后收入', '0'],
    ['每月生活费用（不含还本及投资）', '2000'],
    ['当前年龄', '60'],
    ['退休年龄', '60'],
    ['规划终点年龄', '61'],
    ['退休每月生活支出', '2000'],
    ['预计月养老金（用户假设）', '0'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  const computed = page.waitForResponse(
    (r) =>
      r.url().includes('/life-simulator/retirement-preview') &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '预览退休规划', exact: true }).click();
  const response = await computed;
  expect(response.status()).toBe(200);
  const plan = (await response.json()).data;
  expect(plan.targetRetirementAssets).toBeGreaterThanOrEqual(24000);
  expect(plan.targetRetirementAssets).toBeLessThanOrEqual(24000.02);
  expect(plan.additionalCapitalToday).toBeGreaterThanOrEqual(14000);
  expect(plan.result.months[0].otherAssets).toBe(1000000);
  await page
    .getByRole('button', {
      name: '应用退休计划到情景（审核后计算归档）',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('允许投资提款补足负现金（不含住房及受限资产）', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText('我已审核未来收入、费用、资产分类和贷款假设', { exact: true })
    .click();
  await page.getByRole('button', { name: '执行模拟并归档' }).click();
  await expect(page.getByText('财务决策报告', { exact: true })).toBeVisible();
});
