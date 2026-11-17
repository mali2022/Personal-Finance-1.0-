import { test, expect } from '@playwright/test';

test('isolated spending application cooling and independent decision', async ({ page }) => {
  if (process.env.PF_APPROVAL_LIVE_AI === 'true') test.setTimeout(120000);
  const database = process.env.PF_DELETION_TEST_DATABASE;
  test.skip(!database || !/^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/.test(database), 'Requires isolated approval verification runner');
  await page.goto('/login');
  await page.getByPlaceholder('请输入邮箱').fill('approval-browser@isolated.test');
  await page.getByPlaceholder('请输入密码').fill('Approval-Isolated-Only-2026!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  let authorization: string | undefined;
  page.on('request', request => { if (request.url().includes('/api/spending-approvals') && request.headers().authorization) authorization = request.headers().authorization; });
  await page.goto('/spending-approvals');
  await expect(page.getByRole('heading', { name: 'AI 消费审批中心' })).toBeVisible();
  await expect.poll(() => authorization).toBeTruthy();
  const verified = await page.request.get('/api/verification-context', { headers: { Authorization: authorization! } });
  expect(verified.ok()).toBeTruthy(); expect((await verified.json()).database).toBe(database);
  await page.getByPlaceholder('我想买一个5000元的手机，旧手机还能用……').fill('我想花5000元购买手机');
  await page.getByRole('button', { name: 'AI 提取申请' }).click();
  await expect(page.getByRole('dialog', { name: '将这段需求发送给当前 AI 模型？' })).toBeVisible();
  await page.getByRole('button', { name: /确.*定/ }).click();
  await expect(page.getByText('AI 提取未完成', { exact: true })).toBeVisible();
  if (process.env.PF_APPROVAL_LIVE_AI === 'true') {
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'XSRF-TOKEN');
    const privacy = await page.request.put('/api/ai/privacy', { headers: { Authorization: authorization!, 'X-XSRF-TOKEN': decodeURIComponent(csrf?.value ?? '') }, data: { enabled: true, allowSummary: true, allowDetails: false, allowPayroll: false, allowFamily: false, allowRecognitionText: true, saveHistory: false, personalReadAccess: false, fullFinancialAccess: false } });
    expect(privacy.ok()).toBeTruthy();
    await page.getByRole('button', { name: 'AI 提取申请' }).click();
    await page.getByRole('button', { name: /确.*定/ }).click();
    await expect(page.getByRole('dialog', { name: '消费申请', exact: true })).toBeVisible({ timeout: 90000 });
    await expect(page.getByLabel('预计价格')).toHaveAttribute('aria-valuenow', '5000');
    await page.getByRole('button', { name: /取.*消/ }).click();
  }
  await page.getByRole('button', { name: '发起消费申请' }).click();
  await page.getByLabel('商品或服务').fill('隔离测试耳机');
  await page.getByLabel('预计价格').fill('100');
  await page.getByLabel('购买理由').fill('验证真实保存及冷静期，不写入实际支出');
  await page.getByRole('button', { name: /确.*定/ }).click();
  await expect(page.getByText('状态：草稿', { exact: false })).toBeVisible();
  await page.getByLabel('需要澄清的问题').fill('旧耳机是否还能用？');
  await page.getByLabel('你的回答').fill('已经损坏，需要工作使用');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/answers') && r.request().method() === 'POST' && r.ok()), page.getByRole('button', { name: '保存回答并重新审查' }).click()]);
  await page.getByLabel('分期首付', { exact: true }).fill('0');
  await page.getByLabel('融资本金', { exact: true }).fill('100');
  await page.getByLabel('分期期数', { exact: true }).fill('3');
  await page.getByLabel('全期手续费及利息总额（须明确，未知请勿填零）').fill('2');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/installment') && r.request().method() === 'POST' && r.ok()), page.getByRole('button', { name: '保存分期并计算总成本' }).click()]);
  await expect(page.getByText(/状态：草稿；版本：3/)).toBeVisible();
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/images') && r.request().method() === 'POST' && r.ok()), page.locator('input[type=file]').setInputFiles('public/icon-192.png')]);
  await expect(page.getByRole('button', { name: /下载商品图片/ })).toBeVisible();
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByText('状态：已提交', { exact: false })).toBeVisible();
  if (process.env.PF_APPROVAL_LIVE_AI === 'true') {
    await page.getByRole('button', { name: 'AI 审批 / 重新评估' }).click();
    await page.getByRole('button', { name: /确.*定/ }).click();
    await expect(page.getByText('DEFERRED', { exact: true })).toBeVisible({ timeout: 90000 });
    const headers = { Authorization: authorization! };
    const second = await page.request.get('http://127.0.0.1:5294/api/verification-context', { headers });
    expect((await second.json()).database).toBe(database);
    const applications = (await (await page.request.get('/api/spending-approvals', { headers })).json()).data.items;
    const current = applications.find((item: { content: { application: { name: string } } }) => item.content.application.name === '隔离测试耳机');
    expect(current).toBeTruthy();
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'XSRF-TOKEN');
    const requestHeaders = { ...headers, 'If-Match': current.version, 'X-XSRF-TOKEN': decodeURIComponent(csrf?.value ?? '') };
    const responses = await Promise.all([
      page.request.post(`/api/spending-approvals/${current.id}/evaluate`, { headers: { ...requestHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { confirmTransmission: true }, timeout: 90000 }),
      page.request.post(`http://127.0.0.1:5294/api/spending-approvals/${current.id}/evaluate`, { headers: { ...requestHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { confirmTransmission: true }, timeout: 90000 }),
    ]);
    expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
    await page.reload();
    await page.getByRole('button', { name: '隔离测试耳机', exact: true }).click();
  }
  await page.getByRole('button', { name: '暂缓（小时）' }).click();
  await expect(page.getByText('状态：冷静期', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '结束冷静期' }).click();
  await page.getByRole('button', { name: '决定购买' }).click();
  await expect(page.getByText('状态：已决定购买', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存复盘' })).toHaveCount(0);
  await page.getByRole('button', { name: '我已购买，尚未记账' }).click();
  await expect(page.getByText('状态：已购买，尚未记账', { exact: false })).toBeVisible();
});
