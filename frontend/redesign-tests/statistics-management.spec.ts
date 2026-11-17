import { test, expect } from '@playwright/test';
import { managementDefaults } from '../src/features/reports/statisticsPolicyCatalog';
import type { ManagedPolicy } from '../src/features/reports/statisticsPolicyApi';
for (const [width, language, theme] of [
  [390, 'zh-CN', 'light'],
  [1440, 'zh-CN', 'dark'],
  [390, 'en', 'dark'],
  [1440, 'en', 'light'],
] as const) {
  test(`statistics policy ${width} ${language} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(
      ({ language, theme }) =>
        localStorage.setItem(
          'finance-ui',
          JSON.stringify({
            state: { language, theme, hidden: false },
            version: 0,
          }),
        ),
      { language, theme },
    );
    const en = language === 'en';
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let policy: ManagedPolicy = {
      version: '0',
      ledgerVersion: '1',
      ledgerRules: {
        includeFees: true,
        includeAssetLoss: false,
        includeDecreasingAdjustments: false,
      },
      options: { ...managementDefaults },
    };
    let saves = 0,
      previews = 0;
    await page.route('http://127.0.0.1:5186/api/**', async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      let data: unknown = [];
      if (path === '/api/auth/me')
        data = {
          id: 'statistics-test',
          displayName: 'Statistics',
          permissions: [],
        };
      else if (path === '/api/auth/profile')
        data = { preferredCurrency: 'CNY' };
      else if (path === '/api/settings/modules')
        data = { concerts: false, version: '0' };
      else if (path === '/api/settings/statistics/management') {
        if (req.method() === 'PUT') {
          const b = req.postDataJSON() as ManagedPolicy;
          expect(req.headers()['if-match']).toBe(policy.version);
          expect(b.ledgerVersion).toBe(policy.ledgerVersion);
          policy = {
            ...b,
            version: String(Number(policy.version) + 1),
            ledgerVersion: String(Number(policy.ledgerVersion) + 1),
          };
          saves++;
        }
        data = policy;
      } else if (path === '/api/settings/statistics/management/history')
        data = [];
      else if (path === '/api/settings/statistics/management/preview') {
        previews++;
        const daily = {
          income: '10000.00',
          grossExpense: '1000.00',
          refunds: '200.00',
          netExpense: '800.00',
          displayedExpense: '800.00',
          surplus: '9200.00',
          excludedIncome: '100.00',
          oneTimeIncome: '100.00',
          savingsIncome: '9900.00',
          savingsRate: '91.92',
          cashRewardIncome: '100.00',
          depositInterest: '0.00',
          investmentCashIncome: '0.00',
          savedLedgerExpense: '800.00',
          ledgerExpense: '800.00',
          ledgerExpenseDifference: '0.00',
        };
        data = {
          currency: 'CNY',
          start: '2026-09-15T00:00:00+08:00',
          endExclusive: '2026-10-15T00:00:00+08:00',
          plannedEndExclusive: '2026-10-15T00:00:00+08:00',
          generatedAt: '2026-10-22T00:00:00Z',
          isPeriodClosed: true,
          transactionCount: 6,
          daily,
          comparison: {
            start: '2026-09-01T00:00:00+08:00',
            endExclusive: '2026-10-01T00:00:00+08:00',
            daily,
            samePeriod: false,
          },
          accounts: {
            inflow: '12000.00',
            outflow: '5800.00',
            surplus: '6200.00',
            surplusRate: '51.67',
            items: [
              {
                id: 'bank',
                name: en ? 'Bank' : '银行账户',
                inflow: '12000',
                outflow: '5800',
                change: '6200',
              },
            ],
            note: '',
          },
          debt: {
            received: '2000',
            principalRepaid: '0',
            cardRepaid: '5000',
            interest: '0',
            serviceFees: '0',
            unclassifiedFees: '0',
            remainingPrincipal: '2000',
            plannedPrincipal: '2000',
            plannedFees: '0',
            plannedRemainingPayment: '2000',
            note: '',
          },
          investment: {
            summary: {
              realizedInPeriod: '200',
              incomeInPeriod: '20',
              unrealizedCovered: '100',
              remainingCost: '600',
              marketValueCovered: '700',
              missingValuations: 0,
            },
            scope: '',
          },
          wealth: {
            openingNetWorth: '10000',
            closingNetWorth: '19300',
            change: '9300',
            nonSurplusChange: '100',
            note: '',
            consolidatedValuation: {
              complete: false,
              uncovered: 1,
              groups: [
                {
                  currency: 'CNY',
                  assets: '20000',
                  liabilities: '2000',
                  netWorth: '18000',
                },
              ],
            },
          },
          payroll: {
            gross: '12000',
            deductions: '2500',
            net: '9500',
            displayedSalary: '9500',
            adjustments: '0',
            actual: '9500',
            tax: '1000',
            personalSocial: '500',
            personalHousing: '1000',
            annualBonus: '0',
            note: '',
          },
          quality: {
            unclassifiedExpense: '100',
            unclassifiedCount: 1,
            futureExcluded: 1,
            unsettledExcluded: 0,
            largeTransactions: [],
          },
          notes: [],
        };
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto('/settings/statistics');
    await expect(
      page.getByRole('switch', {
        name: en
          ? 'Include linked cash rewards in analysis income'
          : '已关联现金奖励参与分析收入',
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: en ? 'Comprehensive finances' : '综合财务模式',
        exact: false,
      })
      .click();
    expect(saves).toBe(0);
    await page
      .getByLabel(en ? 'Search statistics rules' : '搜索统计规则')
      .fill(en ? 'Monthly period' : '月度统计起始日');
    const day = page.getByRole('spinbutton', {
      name: en ? 'Monthly period starts on' : '月度统计起始日',
    });
    await day.fill('15');
    await day.press('Tab');
    await page
      .getByRole('button', {
        name: en ? 'Save policy' : '保存统计方案',
        exact: true,
      })
      .click();
    await expect.poll(() => saves).toBe(1);
    expect(policy.options.monthStartDay).toBe(15);
    await page
      .getByLabel(en ? 'Search statistics rules' : '搜索统计规则')
      .fill('');
    await expect(page.getByRole('tab')).toHaveCount(10);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `test-results/statistics-rules-${width}-${language}-${theme}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: en ? 'Preview current policy' : '预览当前方案',
        exact: true,
      })
      .click();
    await expect.poll(() => previews).toBe(1);
    for (const label of en
      ? [
          'Daily income, expenses and savings',
          'Debt cash flows and repayment pressure',
          'Investment performance schedule',
          'Wealth changes and consolidated valuation',
        ]
      : [
          '日常收支与储蓄',
          '债务现金流与还款压力',
          '投资损益附表',
          '财富变动与综合估值',
        ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `test-results/statistics-preview-${width}-${language}-${theme}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}
