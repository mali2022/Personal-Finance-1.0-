import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import type { ImportJob, ImportRow } from '../src/types';
import { parseCsv } from '../src/utils/valuationCsv';
for (const width of [360, 1440])
  test.describe(`standard CSV ${width}`, () => {
    test.use({
      viewport: { width, height: 1000 },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    test('downloads the revised template, maps distinct fields and edits goods and discount', async ({
      page,
    }) => {
      const accountId = '11111111-1111-4111-8111-111111111111',
        jobId = '22222222-2222-4222-8222-222222222222';
      const csv = fs.readFileSync('public/import-template.csv', 'utf8'),
        raw = parseCsv(csv);
      let job: ImportJob = {
        id: jobId,
        fileName: 'standard.csv',
        source: 'CSV',
        headers: raw[0],
        sampleRows: raw.slice(1),
        total: 2,
        version: '1',
        state: 'Uploaded',
      };
      const rows: ImportRow[] = [
        {
          id: 'r1',
          index: 1,
          occurredAt: '2026-10-07T04:30:00Z',
          amount: '25.50',
          type: 'Expense',
          accountId,
          currency: 'CNY',
          merchant: '麦当劳',
          productName: '午餐套餐',
          discountAmount: '4.50',
          originalAmount: '30.00',
          sourceStatus: '交易成功',
          note: '工作日午餐',
          categoryId: 'expense',
          recommendation: '餐饮食品 / 日常午餐',
          status: 'Ready',
          issues: [],
          needsReview: false,
        },
      ];
      let mapped = false,
        patched = false;
      await page.route(/http:\/\/127\.0\.0\.1:5175\/api\/.*/, async (route) => {
        const request = route.request(),
          p = new URL(request.url()).pathname.slice(4);
        let data: unknown = { items: [], total: 0, page: 1, pageSize: 20 };
        if (p === '/auth/me')
          data = { id: 'test', displayName: '测试', permissions: [] };
        else if (p === '/accounts')
          data = [
            {
              id: accountId,
              name: '测试银行卡',
              type: 'Bank',
              currency: 'CNY',
              balance: '1000.00',
              status: 'Active',
            },
          ];
        else if (p === '/categories')
          data = [
            {
              id: 'root',
              name: '餐饮食品',
              kind: 'Expense',
              status: 'Active',
              sortOrder: 0,
              version: '1',
            },
            {
              id: 'expense',
              parentId: 'root',
              name: '日常午餐',
              kind: 'Expense',
              status: 'Active',
              sortOrder: 1,
              version: '1',
            },
          ];
        else if (p === '/imports' && request.method() === 'POST') data = job;
        else if (p === '/imports/' + jobId) data = job;
        else if (p === '/imports/' + jobId + '/mapping') {
          expect(request.postDataJSON().mapping).toMatchObject({
            productName: '商品',
            note: '备注',
            category: '分类',
            category2: '二级分类',
            category3: '三级分类',
            discountAmount: '优惠金额',
          });
          mapped = true;
          job = {
            ...job,
            state: 'Preview',
            version: '2',
            accountId,
            summary: {
              total: 1,
              ready: 1,
              duplicate: 0,
              invalid: 0,
              skipped: 0,
              suspected: 0,
              needsReview: 0,
            },
          };
          data = job;
        } else if (p === '/imports/' + jobId + '/rows')
          data = { items: rows, total: 1, page: 1, pageSize: 20 };
        else if (
          p === '/imports/' + jobId + '/rows/r1' &&
          request.method() === 'PATCH'
        ) {
          expect(request.postDataJSON()).toMatchObject({
            productName: '修正后的商品',
            discountAmount: '5.00',
          });
          patched = true;
          rows[0] = {
            ...rows[0],
            productName: '修正后的商品',
            discountAmount: '5.00',
            originalAmount: '30.50',
          };
          job = { ...job, version: '3' };
          data = job;
        }
        await route.fulfill({ json: { data } });
      });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/import');
      await expect(
        page.getByRole('link', { name: '下载标准 CSV 模板' }),
      ).toBeVisible();
      const template = await page.request.get('/import-template.csv');
      expect(await template.text()).toContain(
        '商户,商品,分类,二级分类,三级分类,备注',
      );
      await page
        .locator('input[type=file]')
        .setInputFiles({
          name: 'standard.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        });
      await expect(
        page.getByText('字段映射 · standard.csv', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel('三级分类（可空）', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: '生成预览并检测重复' }).click();
      await expect.poll(() => mapped).toBe(true);
      await expect(
        page.getByRole('cell', { name: '午餐套餐', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: '工作日午餐', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: '修改分类/类型', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: '修改导入记录' });
      await dialog.getByLabel('商品（仅支出）').fill('修正后的商品');
      await dialog.getByLabel('优惠金额', { exact: true }).fill('5.00');
      await dialog.getByRole('button', { name: /确\s*定|OK/ }).click();
      await expect.poll(() => patched).toBe(true);
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole('cell', { name: '修正后的商品', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  });
