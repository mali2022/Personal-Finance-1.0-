import { test, expect } from '@playwright/test';
for (const width of [360, 1440])
  test(`physical asset center ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const asset = {
      id: '11111111-1111-4111-8111-111111111111',
      name: '摄影设备',
      type: 'Other',
      currency: 'CNY',
      acquiredDate: '2026-01-01',
      note: '',
      version: '4',
      categoryName: '数码设备',
      profile: null,
      value: {
        quantity: 2,
        state: 'Active',
        originalCost: 10000,
        remainingCost: 10000,
        bookValue: 10000,
        value: 8000,
        method: 'Manual',
        marketValue: null,
        netRealizableValue: null,
      },
      usageCost: 200,
      ownershipCost: 200,
      depreciation: 0,
      anomalies: ['未分类'],
      costs: [],
      events: [],
      rules: [],
      valuations: [],
    };
    let saved: Record<string, unknown> | undefined;
    await page.route(/^http:\/\/127\.0\.0\.1:5182\/api\//, async (route) => {
      const r = route.request(),
        path = new URL(r.url()).pathname;
      let data: unknown = [];
      if (path === '/api/auth/profile') data = { preferredCurrency: 'CNY' };
      else if (path === '/api/auth/me')
        data = { id: 'test', displayName: '测试', permissions: [] };
      else if (path === '/api/physical-center')
        data = {
          date: '2026-10-22',
          scope: '按统计日计算，原币分组；不重复创建支出。',
          items: [asset],
          groups: [
            {
              currency: 'CNY',
              totalValue: 8000,
              originalCost: 10000,
              remainingCost: 10000,
              bookValue: 10000,
              depreciation: 0,
              quantity: 2,
              missing: 0,
              retentionPercent: 80,
              usageCost: 200,
              ownershipCost: 200,
              idlePercent: 0,
              concentrationPercent: 100,
              replacementCost: 0,
              replacementMissing: 1,
              valueChange: null,
              distribution: [
                { name: '数码设备', value: 8000, missing: 0, quantity: 2 },
              ],
              trend: [{ date: '2026-10-22', value: 8000, missing: 0 }],
            },
          ],
          reminders: [
            {
              assetId: asset.id,
              name: asset.name,
              kind: 'Inventory',
              due: '2026-10-22',
              overdue: false,
            },
          ],
        };
      else if (path.endsWith('/rules')) {
        saved = r.postDataJSON();
        expect(r.headers()['if-match']).toBe('4');
        expect(r.headers()['idempotency-key']).toBeTruthy();
        data = { id: 'rule', version: '5' };
      } else if (path.startsWith('/api/operations/'))
        data = { state: 'Unknown' };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/physical-assets');
    await expect(
      page.getByRole('heading', { name: '实物资产中心' }),
    ).toBeVisible();
    await expect(page.getByText('总估值（已覆盖）')).toBeVisible();
    await expect(page.locator('.finance-chart canvas')).toHaveCount(2);
    await page.screenshot({
      path: `test-results/physical-overview-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('tab', { name: '资产档案', exact: true }).click();
    await page.getByRole('button', { name: /估\s*值/, exact: true }).click();
    await page.getByText('手动估值', { exact: true }).click();
    await page.getByText('数量 × 单价', { exact: true }).click();
    await page.getByLabel('单价', { exact: true }).fill('300');
    await page
      .getByLabel('估值依据 / 市场观察来源', { exact: true })
      .fill('实地观察记录');
    await page.screenshot({
      path: `test-results/physical-rule-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: /保\s*存/, exact: true }).click();
    await expect.poll(() => saved).toBeTruthy();
    expect(saved).toMatchObject({
      method: 'QuantityPrice',
      amount: 300,
      source: '实地观察记录',
      marketValue: null,
    });
    expect(errors).toEqual([]);
  });
