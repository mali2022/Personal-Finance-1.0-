import { test, expect } from '@playwright/test';
for (const width of [360, 1440]) {
  test(`loan schedule editor ${width}`, async ({ page }) => {
    page.on('pageerror', error => console.error('Page error:', error.message));
    await page.setViewportSize({ width, height: 1000 });
    const input = {
      name: '测试还款计划',
      principal: '1000.00',
      borrowDate: '2026-01-01',
      firstDate: '2026-02-01',
      periods: 1,
      annualRate: 6,
      overdueDailyRate: 0.05,
      mode: 'InterestOnly',
      overrides: [],
      note: '',
    };
    const id = '22222222-2222-4222-8222-222222222222';
    const row = {
      sequence: 1,
      date: '2026-02-01',
      principal: 1000,
      interest: 5,
      overdueInterest: 10,
      total: 1015,
      remainingPrincipal: 0,
      paidDate: null,
      overdueDays: 20,
      status: '逾期',
    };
    let saved: Record<string, unknown> | undefined;
    await page.route(/http:\/\/127\.0\.0\.1:5176\/api\/.*/, async (route) => {
      const r = route.request(),
        path = new URL(r.url()).pathname;
      let data: unknown = [];
      if (path === '/api/auth/me')
        data = { id: 'test', displayName: '测试', permissions: [] };
      else if (path === '/api/auth/profile')
        data = { preferredCurrency: 'CNY' };
      else if (path === '/api/loan-schedules')
        data = [{ id, version: '1', input }];
      else if (path === '/api/loan-schedules/preview')
        data = [{ ...row, interest: 0, overdueInterest: 2.5, total: 1002.5 }];
      else if (path === '/api/loan-schedules/' + id) {
        if (r.method() === 'PUT') {
          saved = r.postDataJSON();
          data = { id, version: '2' };
        } else data = { id, version: '1', input, schedule: [row] };
      } else if (path.startsWith('/api/operations/'))
        data = { state: 'Unknown' };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/loan-schedules');
    await page
      .getByRole('button', { name: '查看 / 修改', exact: true })
      .click();
    await page.getByRole('button', { name: '修改金额', exact: true }).click();
    await page.getByLabel('利息（元）', { exact: true }).fill('0');
    await page.getByLabel('逾期利息（元）', { exact: true }).fill('2.50');
    await page.screenshot({
      path: `test-results/loan-schedule-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '应用修改', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '应用修改', exact: true }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: '保存计划', exact: true }).click();
    await expect.poll(() => saved).toBeTruthy();
    expect(saved?.overrides).toEqual([
      expect.objectContaining({
        sequence: 1,
        interest: '0',
        overdueInterest: '2.50',
      }),
    ]);
  });
}
