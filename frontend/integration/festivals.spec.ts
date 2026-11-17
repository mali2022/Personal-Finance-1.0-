import { test, expect } from '@playwright/test';
test('festival plan persists, links ledger, approves and reviews on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(180000);
  const database = process.env.PF_DELETION_TEST_DATABASE;
  test.skip(
    !database ||
      !/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/.test(database),
    'isolated database required',
  );
  page.setDefaultTimeout(15000);
  await page.goto('/login');
  await page
    .getByPlaceholder('请输入邮箱')
    .fill('approval-browser@isolated.test');
  await page
    .getByPlaceholder('请输入密码')
    .fill('Approval-Isolated-Only-2026!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  let authorization = '';
  page.on('request', (r) => {
    if (r.url().includes('/api/festivals') && r.headers().authorization)
      authorization = r.headers().authorization;
  });
  await page.goto('/festivals');
  await expect(
    page.getByRole('heading', { name: '节日与纪念日财务中心' }),
  ).toBeVisible();
  await expect.poll(() => authorization).toBeTruthy();
  const csrf = (await page.context().cookies()).find(
    (c) => c.name === 'XSRF-TOKEN',
  );
  const headers = {
    Authorization: authorization,
    'X-XSRF-TOKEN': decodeURIComponent(csrf?.value ?? ''),
  };
  const context = await page.request.get('/api/verification-context', {
    headers,
  });
  expect((await context.json()).database).toBe(database);
  await page.getByRole('button', { name: '创建节日计划', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '创建节日计划' });
  await editor.getByLabel('名称', { exact: true }).fill('验收春节');
  await editor.getByLabel('开始日期', { exact: true }).fill('2026-12-30');
  await editor.getByLabel('结束日期', { exact: true }).fill('2027-01-03');
  await editor.getByLabel('总预算', { exact: true }).fill('1000');
  await editor.getByRole('button', { name: '添加采购项目' }).click();
  await editor.getByLabel('名称', { exact: true }).last().fill('家庭礼物');
  await editor.getByLabel('预计金额').fill('600');
  await editor.getByLabel('收礼对象').fill('父母');
  await editor.getByRole('button', { name: /确.*定/ }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '查看计划', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '节日详情' });
  await expect(detail.getByText('验收春节', { exact: true })).toBeVisible();
  const list = (
    await (
      await page.request.get('/api/festivals?pageSize=100', { headers })
    ).json()
  ).data.items;
  const plan = list.find(
    (x: { input: { name: string } }) => x.input.name === '验收春节',
  );
  expect(plan).toBeTruthy();
  const post = async (path: string, data: unknown, version = '0') => {
    const r = await page.request.post('/api' + path, {
      headers: {
        ...headers,
        'If-Match': version,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).data;
  };
  const account = await post('/accounts', {
    name: '节日验收现金',
    type: 'Cash',
    currency: 'CNY',
    openingBalance: '5000',
  });
  const categories = (
    await (await page.request.get('/api/categories', { headers })).json()
  ).data;
  const leaf = categories.find(
    (x: { kind: string; parentId?: string; status: string }) =>
      x.kind === 'Expense' && x.parentId && x.status === 'Active',
  );
  expect(leaf).toBeTruthy();
  const tx = await post('/transactions/expense', {
    type: 'Expense',
    amount: '600',
    accountId: account.id,
    occurredAt: new Date().toISOString(),
    categoryId: leaf.id,
    note: '节日验收真实流水',
  });
  await detail.getByRole('tab', { name: '真实流水' }).click();
  await detail.getByRole('button', { name: '关联已有交易 / 退款' }).click();
  const link = page.getByRole('dialog', { name: '关联真实交易' });
  await link.getByLabel('交易编号').fill(tx.id);
  await link.getByLabel('原币归属金额').fill('600');
  await link.getByLabel('节日分类').fill('Gift');
  await link.getByLabel('对应采购（可选）').click();
  await page.getByText('家庭礼物', { exact: true }).last().click();
  await link.getByRole('button', { name: /确.*定/ }).click();
  await expect(link).not.toBeVisible();
  let current = (
    await (
      await page.request.get('/api/festivals/' + plan.id, { headers })
    ).json()
  ).data;
  expect(current.report.net).toBe('600.00');
  const refund = await post('/transactions/refund', {
    type: 'Refund',
    amount: '100',
    accountId: account.id,
    occurredAt: new Date().toISOString(),
    originalTransactionId: tx.id,
    note: '节日验收退款',
  });
  await post(
    `/festivals/${plan.id}/allocations`,
    {
      transactionId: refund.id,
      amount: '100',
      category: 'Gift',
      rate: 1,
      rateSource: 'SameCurrency',
      note: '',
    },
    current.document.version,
  );
  await page.reload();
  await page.getByRole('button', { name: '查看计划', exact: true }).click();
  current = (
    await (
      await page.request.get('/api/festivals/' + plan.id, { headers })
    ).json()
  ).data;
  expect(current.report.net).toBe('500.00');
  await detail.getByRole('tab', { name: '采购清单' }).click();
  await detail.getByRole('button', { name: '交给 AI 审批' }).click();
  await expect(
    page.getByText('已创建审批草稿，请前往 AI 消费审批提交'),
  ).toBeVisible();
  await detail.getByRole('tab', { name: '复盘报告' }).click();
  await detail
    .getByPlaceholder('记录实际体验与明年优化建议')
    .fill('实际购买，退款已关联');
  await detail.getByRole('button', { name: '保存复盘快照' }).click();
  await expect(
    page.getByText('操作成功', { exact: true }).first(),
  ).toBeVisible();
  if (process.env.PF_APPROVAL_LIVE_AI === 'true') {
    const privacy = await page.request.put('/api/ai/privacy', {
      headers,
      data: {
        enabled: true,
        allowSummary: true,
        allowDetails: false,
        allowPayroll: false,
        allowFamily: false,
        allowRecognitionText: false,
        saveHistory: false,
        personalReadAccess: false,
        fullFinancialAccess: false,
      },
    });
    expect(privacy.ok()).toBeTruthy();
    await detail.getByRole('tab', { name: 'AI 规划' }).click();
    await detail
      .getByRole('button', { name: 'AI 生成三种方案 / 调整' })
      .click();
    await page
      .getByRole('button', { name: /确.*定/ })
      .last()
      .click();
    await expect(detail.getByRole('button', { name: '确认采纳' })).toHaveCount(
      3,
      { timeout: 120000 },
    );
  }
  await detail.getByRole('tab', { name: '采购清单' }).click();
  await detail
    .getByRole('button', { name: '比较哪个更值得买', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: '候选采购价值比较' }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: '候选采购价值比较' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await detail.getByRole('tab', { name: '复盘报告' }).click();
  await detail.locator('input[type=file]').setInputFiles('public/icon-192.png');
  await expect(
    detail.getByRole('button', { name: 'icon-192.png' }),
  ).toBeVisible();
  await page.screenshot({
    path: '../verification/festival-desktop.png',
    fullPage: true,
  });
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('finance-ui') || '{}');
    localStorage.setItem(
      'finance-ui',
      JSON.stringify({
        ...ui,
        state: { ...ui.state, hidden: true, theme: 'dark' },
      }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '节日与纪念日财务中心' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await expect(page.getByText('••••').first()).toBeVisible();
  await page.screenshot({
    path: '../verification/festival-mobile.png',
    fullPage: true,
  });
});
