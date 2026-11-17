import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import { accountApi, reportApi, transactionApi } from '../api/finance';
import {
  advancedApi,
  importApi,
  reconciliationApi,
  attachmentApi,
} from '../api/operations';
import { parseCsv, makeCsv, makeXlsx, parseXlsx } from '../mocks/files';
import { importDate } from '../mocks/imports';
import { attachmentMime } from '../mocks/operations';
import { decimal, minor } from '../utils/finance';
import type {
  ApiResponse,
  ImportJob,
  ImportMapping,
  Attachment,
} from '../types';
const server = setupServer(...handlers);
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('Blob', NodeBlob);
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
const range = {
  start: '2026-10-01',
  end: '2026-10-31',
  currency: 'CNY' as const,
  granularity: 'month' as const,
};
const mapping: ImportMapping = {
  occurredAt: '日期',
  amount: '金额',
  type: '类型',
  merchant: '商户',
  externalId: '订单号',
};
async function fileUpload(
  path: string,
  fileName: string,
  bytes: Uint8Array,
  source = 'CSV',
) {
  const boundary = 'pf-test-boundary';
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\n${source}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return fetch(window.location.origin + '/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: body.buffer,
  });
}
async function csvJob(text: string) {
  const response = await fileUpload(
    '/imports',
    'bill.csv',
    new TextEncoder().encode(text),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return ((await response.json()) as ApiResponse<ImportJob>).data;
}
describe('第四阶段业务边界', () => {
  it('疑似重复必须确认，保留合法双笔并允许撤销判定', async () => {
    const merchant = '疑似双笔-' + crypto.randomUUID();
    const job = await csvJob(
      `日期,金额,类型,商户,订单号\n2034-02-01 12:00:00,17,支出,${merchant},\n2034-02-01 12:01:00,17,支出,${merchant},`,
    );
    let preview = await importApi.map(job.id, mapping, 'alipay', job.version);
    expect(preview.summary).toMatchObject({
      ready: 1,
      suspected: 1,
      duplicate: 0,
    });
    await expect(
      importApi.commit(job.id, preview.version, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'IMPORT_DUPLICATE_REVIEW_REQUIRED' });
    const row = (await importApi.rows(job.id, 1)).items[1];
    preview = await importApi.reviewDuplicate(
      job.id,
      row.id,
      'Keep',
      preview.version,
    );
    expect(preview.summary?.ready).toBe(2);
    await expect(
      importApi.reviewDuplicate(job.id, row.id, 'Skip', '1'),
    ).rejects.toMatchObject({ message: '导入预览已更新，请刷新' });
    preview = await importApi.reviewDuplicate(
      job.id,
      row.id,
      'Clear',
      preview.version,
    );
    expect(preview.summary?.suspected).toBe(1);
    preview = await importApi.reviewDuplicate(
      job.id,
      row.id,
      'Keep',
      preview.version,
    );
    expect(
      (await importApi.commit(job.id, preview.version, crypto.randomUUID()))
        .imported,
    ).toBe(2);
    const another = await csvJob(
      `日期,金额,类型,商户,订单号\n2034-02-01 12:00:00,17,支出,${merchant},`,
    );
    let skipped = await importApi.map(
      another.id,
      mapping,
      'alipay',
      another.version,
    );
    skipped = await importApi.reviewDuplicate(
      another.id,
      (await importApi.rows(another.id, 1)).items[0].id,
      'Skip',
      skipped.version,
    );
    expect(
      (await importApi.commit(another.id, skipped.version, crypto.randomUUID()))
        .imported,
    ).toBe(0);
    expect((await importApi.rows(another.id, 1)).items[0].status).toBe(
      'Skipped',
    );
  });
  it('强身份冲突不可强制保留，相似候选变化使人工判定失效', async () => {
    const merchant = '身份测试-' + crypto.randomUUID(),
      id = crypto.randomUUID();
    const job = await csvJob(
      `日期,金额,类型,商户,订单号\n2034-02-02 12:00:00,19,支出,${merchant},${id}\n2034-02-02 12:00:00,20,支出,${merchant},${id}`,
    );
    const preview = await importApi.map(job.id, mapping, 'alipay', job.version);
    expect(preview.summary?.invalid).toBe(1);
    const conflict = (await importApi.rows(job.id, 1)).items[1];
    expect(conflict.duplicateKind).toBe('Conflict');
    await expect(
      importApi.reviewDuplicate(job.id, conflict.id, 'Keep', preview.version),
    ).rejects.toBeDefined();
    await importApi.commit(job.id, preview.version, crypto.randomUUID());
    const weak = await csvJob(
      `日期,金额,类型,商户,订单号\n2034-02-02 12:00:00,19,支出,${merchant},`,
    );
    let suspected = await importApi.map(
      weak.id,
      mapping,
      'alipay',
      weak.version,
    );
    const row = (await importApi.rows(weak.id, 1)).items[0];
    suspected = await importApi.reviewDuplicate(
      weak.id,
      row.id,
      'Keep',
      suspected.version,
    );
    await transactionApi.save(
      {
        type: 'Expense',
        amount: '19',
        accountId: 'alipay',
        categoryId: 'lunch',
        merchant,
        occurredAt: '2034-02-02T12:00:00+08:00',
        note: '',
        tagIds: [],
        fee: '0.00',
        splits: [],
      },
      undefined,
      crypto.randomUUID(),
    );
    await expect(
      importApi.commit(weak.id, suspected.version, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_STALE' });
    suspected = await importApi.recheck(weak.id, suspected.version);
    expect(suspected.summary?.suspected).toBe(1);
  });
  it('CSV 引号、换行及公式安全，Excel 精确字符串往返', async () => {
    const rows = [
      ['商户', '金额', '备注'],
      ['中文,商户', '9007199254740993.01', '换行\n"原文"'],
      ['=HYPERLINK("x")', '25', '@危险公式'],
    ];
    const csv = makeCsv(rows);
    expect(parseCsv(csv.replace(/^\ufeff/, ''))[1]).toEqual(rows[1]);
    expect(csv).toContain("'=HYPERLINK");
    expect(() => parseCsv('"未闭合')).toThrow();
    expect(await parseXlsx(makeXlsx(rows))).toEqual(rows);
  });
  it('时区、Excel 日期、非法日期处理', () => {
    expect(importDate('2026-10-07 12:30:00')).toBe('2026-10-07T04:30:00.000Z');
    expect(importDate('2026-10-07T12:30:00Z')).toBe('2026-10-07T12:30:00.000Z');
    expect(() => importDate('2026-02-30')).toThrow();
    expect(() => importDate('2026-10-07 25:00:00')).toThrow();
    expect(importDate('46302')).toMatch(/T16:00:00.000Z$/);
  });
  it('预览不改变余额，重复、异常、分类建议正确，确认幂等过账', async () => {
    const before = (await accountApi.list()).find(
      (a) => a.id === 'alipay',
    )!.balance;
    const job = await csvJob(
      '日期,金额,类型,商户,订单号\n2026-10-07 18:00:00,25.50,支出,麦当劳,UNIT-A\n2026-10-07 18:00:00,25.50,支出,麦当劳,UNIT-A\n2026-10-07 18:01:00,-10,支出,异常,UNIT-B\n',
    );
    const preview = await importApi.map(job.id, mapping, 'alipay', job.version);
    expect(preview.summary).toMatchObject({
      total: 3,
      ready: 1,
      duplicate: 1,
      invalid: 1,
    });
    expect(
      (await accountApi.list()).find((a) => a.id === 'alipay')!.balance,
    ).toBe(before);
    expect((await importApi.rows(job.id, 1)).items[0].categoryId).toBe('lunch');
    const key = crypto.randomUUID();
    const done = await importApi.commit(job.id, preview.version, key);
    await importApi.commit(job.id, preview.version, key);
    expect(done.imported).toBe(1);
    const completedAttempts = await importApi.attempts(job.id, 1);
    expect(completedAttempts.total).toBe(1);
    expect(completedAttempts.items[0]).toMatchObject({
      state: 'Completed',
      imported: 1,
      skipped: 2,
    });
    expect(
      (
        await importApi.attemptRows(job.id, completedAttempts.items[0].id, 1)
      ).items.map((row) => row.status),
    ).toEqual(['Imported', 'Duplicate', 'Invalid']);
    expect((await importApi.rows(job.id, 1)).items[0].status).toBe('Imported');
    expect(
      minor(before) -
        minor(
          (await accountApi.list()).find((a) => a.id === 'alipay')!.balance,
        ),
    ).toBe(2550n);
    const again = await csvJob(
      '日期,金额,类型,商户,订单号\n2026-10-07 18:00:00,25.50,支出,麦当劳,UNIT-A',
    );
    const duplicate = await importApi.map(
      again.id,
      mapping,
      'alipay',
      again.version,
    );
    expect(duplicate.summary?.duplicate).toBe(1);
  });
  it('待整理可批量分类，收入不能误用支出分类，XLSX上传可解析', async () => {
    const workbook = makeXlsx([
      ['日期', '金额', '类型', '商户', '订单号'],
      ['2026-10-07 18:30:00', '10.00', '支出', '未知商户', 'XLSX-A'],
      ['2026-10-07 18:31:00', '20', '收入', '兼职收入', 'XLSX-B'],
    ]);
    const response = await fileUpload(
      '/imports',
      'bill.xlsx',
      workbook,
      'Excel',
    );
    expect(response.status).toBe(200);
    const job = ((await response.json()) as ApiResponse<ImportJob>).data;
    let preview = await importApi.map(job.id, mapping, 'bank', job.version);
    expect(preview.summary).toMatchObject({
      ready: 1,
      needsReview: 1,
      invalid: 1,
    });
    preview = await importApi.categorize(job.id, 'lunch', preview.version);
    expect(preview.summary?.needsReview).toBe(0);
    const income = (await importApi.rows(job.id, 1)).items.find(
      (r) => r.type === 'Income',
    )!;
    preview = await importApi.patch(
      job.id,
      income.id,
      { categoryId: 'wage' },
      preview.version,
    );
    expect(preview.summary?.ready).toBe(2);
    await expect(
      importApi.patch(job.id, income.id, { categoryId: 'lunch' }, '1'),
    ).rejects.toMatchObject({ code: 'IMPORT_ERROR' });
  });
  it('确认时再次去重，账本变化要求重新核对', async () => {
    const text =
      '日期,金额,类型,商户,订单号\n2026-10-07 19:00:00,8,支出,并发商户,CONCURRENT-1';
    const a = await csvJob(text),
      b = await csvJob(text);
    const pa = await importApi.map(a.id, mapping, 'bank', a.version),
      pb = await importApi.map(b.id, mapping, 'bank', b.version);
    await importApi.commit(a.id, pa.version, crypto.randomUUID());
    await expect(
      importApi.commit(b.id, pb.version, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_STALE' });
    expect((await importApi.get(b.id)).summary?.ready).toBe(1);
    expect((await importApi.attempts(b.id, 1)).items[0].state).toBe('Failed');
    const refreshed = await importApi.recheck(b.id, pb.version);
    expect(refreshed.summary?.duplicate).toBe(1);
  });
  it('对账增加资产但不增加收入，重复确认不重复调整', async () => {
    const account = (await accountApi.list()).find((a) => a.id === 'wechat')!;
    const before = await reportApi.get(range);
    const snapshot = await reconciliationApi.preview(
      account.id,
      decimal(minor(account.balance) + 3000n),
    );
    const key = crypto.randomUUID();
    const body = { ...snapshot, reason: '期初余额核对' };
    const first = await reconciliationApi.commit(body, key);
    await reconciliationApi.commit(body, key);
    expect(first.difference).toBe('30.00');
    const after = await reportApi.get(range);
    expect(after.income).toBe(before.income);
    expect(after.expense).toBe(before.expense);
    expect(minor(after.netWorth) - minor(before.netWorth)).toBe(3000n);
  });
  it('资金变化、ABA与零差额对账版本保护', async () => {
    const account = (await accountApi.list()).find((a) => a.id === 'cash')!;
    const snapshot = await reconciliationApi.preview('cash', account.balance);
    const t = await transactionApi.save({
      type: 'Expense',
      amount: '1',
      accountId: 'cash',
      categoryId: 'lunch',
      occurredAt: '2026-10-07T10:00:00Z',
      note: 'ABA',
      tagIds: [],
      splits: [],
      fee: '0',
    });
    await transactionApi.remove(t.data.data.id, t.data.data.version);
    await expect(
      reconciliationApi.commit(
        { ...snapshot, reason: '旧快照' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'OPERATIONS_ERROR' });
    const fresh = await reconciliationApi.preview(
      'cash',
      (await accountApi.list()).find((a) => a.id === 'cash')!.balance,
    );
    const record = await reconciliationApi.commit(
      { ...fresh, reason: '盘点一致' },
      crypto.randomUUID(),
    );
    expect(record.transactionId).toBeUndefined();
  });
  it('信用卡对账使用负余额，禁止调整专用应收', async () => {
    const snapshot = await reconciliationApi.preview('credit', '-2000.00');
    expect(snapshot.actualBalance).toBe('-2000.00');
    expect(
      (await reconciliationApi.preview('credit', '100')).actualBalance,
    ).toBe('100.00');
    await expect(
      reconciliationApi.preview('demo-lent-account', '1200'),
    ).rejects.toMatchObject({ code: 'OPERATIONS_ERROR' });
  });
  it('附件校验、上传、授权关联路径和删除不改变金额', async () => {
    expect(() =>
      attachmentMime(new TextEncoder().encode('<script>'), 'x.pdf'),
    ).toThrow();
    const account = (await accountApi.list()).find(
      (a) => a.id === 'bank',
    )!.balance;
    const response = await fileUpload(
      '/transactions/t0/attachments',
      'receipt.pdf',
      new TextEncoder().encode('%PDF-1.4\n%%EOF'),
    );
    expect(response.status).toBe(200);
    const attachment = ((await response.json()) as ApiResponse<Attachment>)
      .data;
    expect((await transactionApi.detail('t0')).attachments).toHaveLength(1);
    const wrong = await fetch(
      window.location.origin +
        `/api/transactions/t1/attachments/${attachment.id}/content`,
    );
    expect(wrong.status).toBe(404);
    await attachmentApi.remove('t0', attachment);
    expect(await attachmentApi.list('t0')).toHaveLength(0);
    expect(
      (await accountApi.list()).find((a) => a.id === 'bank')!.balance,
    ).toBe(account);
  });
  it('导出按后端全部筛选数据，不受列表pageSize限制，Excel和CSV均为真实文件', async () => {
    const expected = await transactionApi.list({
      page: 1,
      pageSize: 1,
      sort: 'occurredAt:desc',
      type: 'Expense',
    });
    const job = await advancedApi.export(
      'Excel',
      { type: 'Expense' },
      crypto.randomUUID(),
    );
    expect(job.count).toBe(expected.total);
    const response = await fetch(
      window.location.origin + `/api/exports/${job.id}/file`,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const rows = await parseXlsx(new Uint8Array(await response.arrayBuffer()));
    expect(rows.length).toBe(expected.total + 1);
    const csvJob = await advancedApi.export(
      'CSV',
      { accountId: 'cash' },
      crypto.randomUUID(),
    );
    const csv = await fetch(
      window.location.origin + `/api/exports/${csvJob.id}/file`,
    ).then((r) => r.text());
    expect(csv).toContain('交易ID');
    expect(parseCsv(csv.replace(/^\ufeff/, ''))).toHaveLength(csvJob.count + 1);
  });
  it('高级报告币种与时间范围，统计规则仅影响统计不修改余额', async () => {
    const rules = await advancedApi.rules();
    const balances = await accountApi.list();
    const expense = await reportApi.get(range);
    await advancedApi.saveRules({
      ...rules,
      includeAssetLoss: true,
      includeDecreasingAdjustments: true,
    });
    await expect(advancedApi.saveRules(rules)).rejects.toMatchObject({
      code: 'OPERATIONS_ERROR',
    });
    expect(await accountApi.list()).toEqual(balances);
    const report = await advancedApi.report(range);
    expect(report.currency).toBe('CNY');
    expect(
      report.accounts.every(
        (a) => balances.find((b) => b.id === a.id)?.currency === 'CNY',
      ),
    ).toBe(true);
    expect(minor((await reportApi.get(range)).expense)).toBeGreaterThanOrEqual(
      minor(expense.expense),
    );
    const latest = await advancedApi.rules();
    await advancedApi.saveRules({
      ...latest,
      includeAssetLoss: rules.includeAssetLoss,
      includeDecreasingAdjustments: rules.includeDecreasingAdjustments,
    });
  });
});
