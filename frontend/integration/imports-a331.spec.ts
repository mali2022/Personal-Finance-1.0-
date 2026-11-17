import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('导入失败后重新检查、确认、逐行报告及刷新恢复', async ({ page }) => {
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
      'utf8',
    ),
  ) as { email: string; password: string };
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  const login = page.waitForResponse('**/api/auth/login');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  const auth = (await (await login).json()) as {
    data: { accessToken: string };
  };
  const headers = { Authorization: `Bearer ${auth.data.accessToken}` };
  const context = await page.request.get('/api/verification-context', {
    headers,
  });
  expect(context.status()).toBe(200);
  expect(((await context.json()) as { database: string }).database).toMatch(
    /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/,
  );
  async function create(path: string, data: object) {
    const response = await page.request.post('/api' + path, { headers, data });
    expect(response.status()).toBe(200);
    return (await response.json()).data as { id: string; version: string };
  }
  const suffix = crypto.randomUUID();
  const account = await create('/accounts', {
    name: '导入浏览器-' + suffix,
    type: 'Cash',
    currency: 'CNY',
    openingBalance: '100',
  });
  const parent = await create('/categories', {
    name: '导入父-' + suffix,
    kind: 'Expense',
  });
  const name = '导入子-' + suffix;
  await create('/categories', { name, kind: 'Expense', parentId: parent.id });
  async function parentStatus(status: string) {
    const response = await page.request.get('/api/categories', { headers });
    const categories = (await response.json()).data as {
      id: string;
      version: string;
    }[];
    const current = categories.find((c) => c.id === parent.id)!;
    const changed = await page.request.put('/api/categories/' + parent.id, {
      headers: { ...headers, 'If-Match': current.version },
      data: { ...current, status },
    });
    expect(changed.status()).toBe(200);
  }
  const csv = `日期,类型,金额,分类,编号\n2033-02-01,支出,2,${name},${suffix}-1\n2033-02-01,支出,3,${name},${suffix}-2\n2033-02-01,支出,2,${name},${suffix}-1\n2033-02-01,支出,-1,${name},${suffix}-3`;
  const upload = await page.request.post('/api/imports', {
    headers,
    multipart: {
      source: 'CSV',
      file: {
        name: 'a331-browser.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      },
    },
  });
  expect(upload.status()).toBe(200);
  const job = (await upload.json()).data as { id: string; version: string };
  const mapping = await page.request.put(`/api/imports/${job.id}/mapping`, {
    headers: { ...headers, 'If-Match': job.version },
    data: {
      accountId: account.id,
      mapping: {
        occurredAt: '日期',
        type: '类型',
        amount: '金额',
        category: '分类',
        externalId: '编号',
      },
    },
  });
  expect(mapping.status()).toBe(200);
  await parentStatus('Disabled');
  try {
    await page.goto('/import?job=' + job.id);
    await page.getByRole('button', { name: /确认导入$/ }).click();
    const failed = page.waitForResponse(`**/api/imports/${job.id}/commit`);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /确认导入$/ })
      .click();
    expect((await failed).status()).toBe(409);
    await expect(page.getByText('未完成', { exact: true })).toBeVisible();
    // A rejected confirmation remains open for recovery; close it before rechecking.
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /取\s*消/ })
      .click();
    const recheck = page.waitForResponse(`**/api/imports/${job.id}/recheck`);
    await page.getByRole('button', { name: '重新检查预览' }).click();
    expect((await recheck).status()).toBe(200);
    await expect(
      page.getByRole('button', { name: /确认导入$/ }),
    ).toBeDisabled();
    await parentStatus('Active');
    const recovered = page.waitForResponse(`**/api/imports/${job.id}/recheck`);
    await expect(
      page.getByRole('button', { name: /重新检查预览$/ }),
    ).toBeEnabled();
    await page.getByRole('button', { name: /重新检查预览$/ }).click();
    expect((await recovered).status()).toBe(200);
    await expect(page.getByRole('button', { name: /确认导入$/ })).toBeEnabled();
    await page.getByRole('button', { name: /确认导入$/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /确认导入$/ })
      .click();
    await expect(
      page.getByText('导入完成 · 2 笔；跳过 2 笔', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('已导入', { exact: true })).toHaveCount(2);
    await expect(page.getByText('跳过 · 重复', { exact: true })).toBeVisible();
    await expect(page.getByText('跳过 · 异常', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看逐行报告' }).first().click();
    await expect(
      page.getByRole('dialog', { name: '导入处理明细' }),
    ).toBeVisible();
    await page
      .getByRole('dialog', { name: '导入处理明细' })
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    await page.reload();
    await expect(page.getByText('已导入', { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: '查看逐行报告' }),
    ).toHaveCount(2);
    await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
    await expect(page.locator('.money').first()).toContainText('••••••');
  } finally {
    await parentStatus('Active');
  }
});
