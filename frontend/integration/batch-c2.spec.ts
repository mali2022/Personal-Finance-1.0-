import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const credentials = JSON.parse(
  await readFile(
    '../backend/src/PersonalFinance.Api/c2-credentials.local.json',
    'utf8',
  ),
);
const database = (
  await readFile('../backend/test-results/c2/database.txt', 'utf8')
).trim();
let token: string, merchant: string, unknownId: string;
async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch('http://127.0.0.1:5082/api' + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(r.status).toBe(200);
  return (await r.json()).data;
}
test.beforeAll(async () => {
  token = (await api('/auth/login', 'POST', credentials)).accessToken;
  const context = await fetch(
    'http://127.0.0.1:5082/api/verification-context',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect((await context.json()).database).toBe(database);
  merchant = 'C2-browser-' + Date.now();
  const account = (await api('/accounts')).find(
    (a: { type: string }) => a.type === 'Cash',
  );
  const categories = await api('/categories');
  const category = categories.find(
    (c: { name: string }) => c.name === '日常午餐',
  );
  const unknown = categories.find(
    (c: { name: string }) => c.name === '不明消费',
  );
  for (let i = 0; i < 25; i++)
    await api('/transactions/expense', 'POST', {
      type: 'Expense',
      amount: '13.57',
      accountId: account.id,
      categoryId: category.id,
      merchant,
      note: 'browser-private-note',
      occurredAt: `2026-10-09T08:${String(i).padStart(2, '0')}:00Z`,
    });
  unknownId = (
    await api('/transactions/expense', 'POST', {
      type: 'Expense',
      amount: '9.99',
      accountId: account.id,
      categoryId: unknown.id,
      merchant: merchant + 'review',
      occurredAt: '2026-10-09T09:00:00Z',
    })
  ).id;
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(
    page.getByRole('heading', { name: '欢迎回到你的账本' }),
  ).toHaveCount(0);
}
test('桌面跨页选择、批量真实API、隐私深色', async ({ page }) => {
  await login(page);
  await page.goto('/transactions?merchant=' + encodeURIComponent(merchant));
  await expect(page.getByText('共 25 笔')).toBeVisible();
  await page.locator('thead input[type=checkbox]').check();
  await expect(page.getByText('已选择 20 笔', { exact: false })).toBeVisible();
  await page.getByTitle('下一页').click();
  await expect(
    page.locator('tbody tr.ant-table-row input[type=checkbox]'),
  ).toHaveCount(5);
  await page
    .locator('tbody tr.ant-table-row input[type=checkbox]')
    .first()
    .check();
  await expect(page.getByText('已选择 21 笔', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '清空选择', exact: true }).click();
  await expect(page.getByText('已选择 0 笔', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('finance-ui') || '{}');
    v.state.theme = 'dark';
    localStorage.setItem('finance-ui', JSON.stringify(v));
  });
  await page.reload();
  await page
    .locator('tbody tr.ant-table-row input[type=checkbox]')
    .first()
    .check();
  await page.getByRole('button', { name: '批量编辑', exact: true }).click();
  await page
    .getByRole('checkbox', { name: '修改备注（可清空，受保护原因除外）' })
    .check();
  await page.getByLabel('批量备注').fill(merchant + 'changed');
  const selected = (
    await api(
      '/transactions?merchant=' +
        encodeURIComponent(merchant) +
        '&page=2&pageSize=20',
    )
  ).items[0];
  const before = await api('/transactions/' + selected.id);
  await page.getByRole('button', { name: '预览修改', exact: true }).click();
  await expect(page.getByText('选中 1，允许 1，拒绝 0')).toBeVisible();
  await expect(page.locator('.ant-drawer-body')).not.toContainText(
    'browser-private-note',
  );
  expect(await api('/transactions/' + selected.id)).toEqual(before);
  const apply = page.waitForResponse(
    (r) => r.url().endsWith('/transactions/batch-apply') && r.status() === 200,
  );
  await page.getByRole('button', { name: '执行整批', exact: true }).click();
  const response = await (await apply).json();
  await expect(
    page.getByText('批量操作编号：' + response.data.batchId),
  ).toBeVisible();
  await page.getByRole('button', { name: '查看结果', exact: true }).click();
  await expect(page.getByText('Completed，1 笔')).toBeVisible();
  const after = await api('/transactions/' + selected.id);
  expect(after.amount).toBe(before.amount);
  expect(after.entries).toEqual(before.entries);
  await page.screenshot({
    path: '../backend/test-results/c2/desktop-dark-private.png',
    fullPage: true,
  });
});
test('手机卡片多选与跨页保留', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/transactions?merchant=' + encodeURIComponent(merchant));
  await expect(page.getByRole('checkbox', { name: /选择交易/ })).toHaveCount(
    20,
  );
  await page
    .getByRole('checkbox', { name: '选择当前页' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.getByRole('checkbox', { name: '选择当前页' }).check();
  await expect(page.getByText('已选择 20 笔', { exact: false })).toBeVisible();
  await page.getByTitle('下一页').click();
  await expect(page.getByRole('checkbox', { name: /选择交易/ })).toHaveCount(5);
  await page
    .getByRole('checkbox', { name: /选择交易/ })
    .first()
    .check();
  await expect(page.getByText('已选择 21 笔', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '清空选择', exact: true }).click();
  await expect(page.getByText('已选择 0 笔', { exact: false })).toBeVisible();
  await page.screenshot({
    path: '../backend/test-results/c2/mobile-select.png',
    fullPage: true,
  });
});
test('待整理原因、忽略、重开及处理历史', async ({ page }) => {
  await login(page);
  await page.goto(
    '/transactions/review?merchant=' + encodeURIComponent(merchant + 'review'),
  );
  await page.getByRole('button', { name: '处理问题', exact: true }).click();
  await expect(
    page.getByText('原有待整理标记', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('问题处理动作').first().click();
  await page.getByText('忽略', { exact: true }).click();
  await page.getByLabel('处理说明').fill('浏览器人工忽略');
  await page.getByRole('button', { name: '保存处理', exact: true }).click();
  await expect
    .poll(
      async () => (await api('/transactions/' + unknownId + '/review')).state,
    )
    .toBe('Ignored');
  await expect(page.getByRole('heading', { name: '处理历史' })).toBeVisible();
  await expect(
    page.getByText('问题状态：待处理 → 已忽略', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('问题处理动作').first().click();
  await page.getByText('重新打开', { exact: true }).last().click();
  await page.getByLabel('处理说明').fill('浏览器重新处理');
  await page.getByRole('button', { name: '保存处理', exact: true }).click();
  await expect
    .poll(
      async () => (await api('/transactions/' + unknownId + '/review')).state,
    )
    .toBe('Open');
  await page.screenshot({
    path: '../backend/test-results/c2/review-history.png',
    fullPage: true,
  });
});
test('退款拒绝原因与版本冲突后的失败编号可查询', async ({ page }) => {
  const account = (await api('/accounts')).find(
    (a: { type: string }) => a.type === 'Cash',
  );
  const category = (await api('/categories')).find(
    (c: { name: string }) => c.name === '日常午餐',
  );
  const input = {
    type: 'Expense',
    amount: '10',
    accountId: account.id,
    categoryId: category.id,
    merchant: merchant + 'protected',
    occurredAt: '2026-10-09T08:00:00Z',
    note: '保持',
  };
  const protectedTx = await api('/transactions/expense', 'POST', input);
  await api('/transactions/refund', 'POST', {
    type: 'Refund',
    amount: '1',
    accountId: account.id,
    originalTransactionId: protectedTx.id,
    occurredAt: '2026-10-09T09:00:00Z',
  });
  await login(page);
  await page.goto(
    '/transactions?type=Expense&merchant=' + encodeURIComponent(input.merchant),
  );
  await expect(
    page.locator('tbody tr.ant-table-row input[type=checkbox]'),
  ).toHaveCount(1);
  await page.locator('tbody tr.ant-table-row input[type=checkbox]').check();
  await page.getByRole('button', { name: '批量编辑', exact: true }).click();
  await page
    .getByRole('checkbox', { name: '修改备注（可清空，受保护原因除外）' })
    .check();
  await page.getByLabel('批量备注').fill('禁止更改');
  await page.getByRole('button', { name: '预览修改', exact: true }).click();
  await expect(page.getByText('选中 1，允许 0，拒绝 1')).toBeVisible();
  await expect(
    page.getByText('退款及存在有效退款的原交易受保护'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '执行整批', exact: true }),
  ).toBeDisabled();
  const conflictTx = await api('/transactions/expense', 'POST', {
    ...input,
    merchant: merchant + 'conflict',
  });
  await page.goto(
    '/transactions?merchant=' + encodeURIComponent(merchant + 'conflict'),
  );
  await expect(
    page.locator('tbody tr.ant-table-row input[type=checkbox]'),
  ).toHaveCount(1);
  await page.locator('tbody tr.ant-table-row input[type=checkbox]').check();
  await page.getByRole('button', { name: '批量编辑', exact: true }).click();
  await page
    .getByRole('checkbox', { name: '修改备注（可清空，受保护原因除外）' })
    .check();
  await page.getByLabel('批量备注').fill('陈旧请求');
  await page.getByRole('button', { name: '预览修改', exact: true }).click();
  await expect(page.getByText('选中 1，允许 1，拒绝 0')).toBeVisible();
  const tx = await api('/transactions/' + conflictTx.id);
  await api('/transactions/batch-apply', 'POST', {
    items: [{ id: tx.id, version: tx.version }],
    changes: { setNote: true, note: '另一客户端已修改' },
  });
  await page.getByRole('button', { name: '执行整批', exact: true }).click();
  await expect(page.getByText(/失败批量编号：/)).toBeVisible();
  await page.getByRole('button', { name: '查看失败结果', exact: true }).click();
  await expect(page.getByText('执行失败，已修改 0 笔')).toBeVisible();
  expect((await api('/transactions/' + conflictTx.id)).note).toBe(
    '另一客户端已修改',
  );
  await page.screenshot({
    path: '../backend/test-results/c2/batch-conflict.png',
    fullPage: true,
  });
});

