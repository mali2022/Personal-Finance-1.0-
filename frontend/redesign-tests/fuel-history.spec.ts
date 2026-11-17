import { test, expect } from '@playwright/test';
import fs from 'node:fs';
for (const width of [360, 1440])
  test.describe(`historical fuel ${width}`, () => {
    test.use({
      viewport: { width, height: 1000 },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    test('recent fill requires odometer; backfill stores null and can be edited', async ({
      page,
    }) => {
      const vehicleId = '11111111-1111-4111-8111-111111111111',
        recordId = '22222222-2222-4222-8222-222222222222';
      const records: Record<string, unknown>[] = [];
      const writes: Record<string, unknown>[] = [];
      await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00'));
      await page.route(/http:\/\/127\.0\.0\.1:5175\/api\/.*/, async (route) => {
        const request = route.request(),
          p = new URL(request.url()).pathname.slice(4);
        let data: unknown = [];
        if (p === '/auth/me')
          data = { id: 'test', displayName: '测试', permissions: [] };
        else if (p === '/auth/profile') data = { preferredCurrency: 'CNY' };
        else if (p === '/fuel/vehicles')
          data = [
            {
              id: vehicleId,
              name: '测试车辆',
              plate: 'TEST',
              fuelType: 'Petrol',
              version: '1',
            },
          ];
        else if (p === '/fuel/records' || p === '/fuel/records/' + recordId) {
          const body = request.postDataJSON();
          writes.push(body);
          records.splice(0, records.length, {
            ...body,
            id: recordId,
            version: String(writes.length),
            unitPrice: body.enteredUnitPrice || 7,
            interval: null,
          });
          data = { id: recordId };
        } else if (p === '/fuel/report')
          data = {
            records,
            summary: {
              count: records.length,
              litres: records.length ? 20 : 0,
              amount: records.length ? 140 : 0,
              currency: 'CNY',
              otherCurrencyCount: 0,
              completedIntervals: 0,
              distance: 0,
              consumedLitres: 0,
              litresPer100Km: null,
            },
            monthly: [],
          };
        await route.fulfill({ json: { data } });
      });
      await page.goto('/analytics/fuel');
      await page.getByRole('button', { name: '记录加油', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '加油记录' });
      await dialog.getByLabel('加油量（L）').fill('20');
      await dialog.getByLabel('实付金额', { exact: true }).fill('140');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(
        page.getByText('最近加油请填写累计里程', { exact: true }),
      ).toBeVisible();
      expect(writes).toHaveLength(0);
      await dialog
        .getByRole('checkbox', { name: '历史补录（里程可留空）', exact: true })
        .check();
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(
        page.getByText('无里程的历史补录日期须早于今天', { exact: true }),
      ).toBeVisible();
      expect(writes).toHaveLength(0);
      const date = dialog.getByLabel('加油日期', { exact: true });
      await date.fill('2026-01-10');
      await date.press('Enter');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        date: '2026-01-10',
        odometer: null,
        historicalBackfill: true,
        litres: 20,
        amount: 140,
      });
      await expect(page.getByText('未记录', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^编\s*辑$/ }).click();
      await expect(
        dialog.getByRole('checkbox', { name: '历史补录（里程可留空）' }),
      ).toBeChecked();
      await expect(dialog.getByLabel('累计里程（km）')).toHaveValue('');
      await dialog.getByLabel('累计里程（km）').fill('1200');
      fs.mkdirSync('verification/fuel-history', { recursive: true });
      await page.screenshot({
        path: `verification/fuel-history/${width}.png`,
        fullPage: true,
      });
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(writes[1].odometer).toBe(1200);
      await page.getByRole('button', { name: /^编\s*辑$/ }).click();
      await dialog.getByRole('radio', { name: '按金额和单价计算' }).check();
      await dialog.getByLabel('实付金额', { exact: true }).fill('200');
      await dialog.getByLabel('每升单价（所选币种/L）').fill('8');
      await expect(dialog.getByLabel('加油量（L）')).toHaveValue('25.000');
      await expect(dialog.getByText('92号汽油', { exact: true })).toBeVisible();
      await dialog.getByLabel('参考省份', { exact: true }).fill('广东');
      await page.getByText('广东', { exact: true }).last().click();
      await dialog
        .getByRole('button', { name: '采用参考价（估算）', exact: true })
        .click();
      await expect(dialog.getByLabel('每升单价（所选币种/L）')).toHaveValue(
        '8.630',
      );
      await expect(dialog.getByLabel('加油量（L）')).toHaveValue('23.175');
      await dialog.screenshot({
        path: `verification/fuel-history/price-${width}.png`,
      });
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(writes[2]).toMatchObject({
        enteredUnitPrice: 8.63,
        litres: 23.175,
        quantitySource: 'ReferenceSnapshot20261016',
      });
      await page.getByRole('button', { name: /^编\s*辑$/ }).click();
      await expect(dialog.getByLabel('每升单价（所选币种/L）')).toHaveValue(
        '8.630',
      );
      await dialog.getByLabel('每升单价（所选币种/L）').fill('8');
      await expect(dialog.getByLabel('加油量（L）')).toHaveValue('25.000');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(writes[3]).toMatchObject({
        enteredUnitPrice: 8,
        litres: 25,
        quantitySource: 'Calculated',
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    });
  });
