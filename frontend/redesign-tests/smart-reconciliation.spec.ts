import { test, expect, type APIResponse } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
const session = JSON.parse(
  fs
    .readFileSync(process.env.PF_RECONCILIATION_SESSION!, 'utf8')
    .replace(/^\uFEFF/, ''),
);
async function data(response: APIResponse) {
  const text = await response.text();
  expect(response.ok(), `HTTP ${response.status()}: ${text}`).toBeTruthy();
  return JSON.parse(text).data;
}
for (const width of [360, 1440])
  test(`real API reconciliation lifecycle ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const area = async (name: string) => {
      if (width < 600) {
        await page
          .getByRole('combobox', { name: '对账工作区域', exact: true })
          .focus();
        await page
          .getByRole('combobox', { name: '对账工作区域', exact: true })
          .press('ArrowDown');
        await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
          )
          .getByText(name, { exact: true })
          .click();
      } else await page.getByRole('tab', { name, exact: true }).click();
    };
    const login = await data(
      await request.post(session.origin + '/api/auth/login', {
        data: { email: session.email, password: session.password },
      }),
    );
    const auth = { Authorization: 'Bearer ' + login.accessToken };
    const write = async (path: string, body: unknown) =>
      data(
        await request.post(session.origin + '/api' + path, {
          headers: { ...auth, 'Idempotency-Key': crypto.randomUUID() },
          data: body,
        }),
      );
    const accountName = `Smart E2E ${width} ${crypto.randomUUID().slice(0, 8)}`;
    const account = await write('/accounts', {
      name: accountName,
      type: 'Bank',
      currency: 'CNY',
      openingBalance: '1000',
    });
    const categories = await data(
      await request.get(session.origin + '/api/categories', { headers: auth }),
    );
    const category = categories.find(
      (c: { kind: string; parentId?: string; status: string }) =>
        c.kind === 'Expense' && c.parentId && c.status === 'Active',
    );
    expect(category).toBeTruthy();
    const merchant = `Smart-${width}-${crypto.randomUUID().slice(0, 8)}`;
    const tx = await write('/transactions/expense', {
      type: 'Expense',
      accountId: account.id,
      amount: '10',
      categoryId: category.id,
      merchant,
      occurredAt: '2026-10-20T12:00:00+08:00',
      note: 'Synthetic reconciliation acceptance',
    });
    const csv = `date,amount,type,merchant,currency,reference\n2026-10-20 12:00:00,10,Expense,${merchant},CNY,${crypto.randomUUID()}\n2026-10-21 12:00:00,5,Expense,Unmatched-${width},CNY,${crypto.randomUUID()}\n`;
    const job = await data(
      await request.post(session.origin + '/api/imports', {
        headers: auth,
        multipart: {
          source: 'CSV',
          file: {
            name: 'synthetic-smart.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csv),
          },
        },
      }),
    );
    const mapped = await data(
      await request.put(session.origin + `/api/imports/${job.id}/mapping`, {
        headers: { ...auth, 'If-Match': job.version },
        data: {
          accountId: account.id,
          purpose: 'Reconciliation',
          mapping: {
            occurredAt: 'date',
            amount: 'amount',
            type: 'type',
            merchant: 'merchant',
            currency: 'currency',
            externalId: 'reference',
          },
        },
      }),
    );
    expect(mapped.summary.total).toBe(2);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('Browser error:', m.text());
    });
    await page.goto('/login');
    await page.getByLabel('邮箱', { exact: true }).fill(session.email);
    await page.getByLabel('密码', { exact: true }).fill(session.password);
    await page.getByRole('button', { name: /登\s*录/, exact: true }).click();
    await expect(page).not.toHaveURL(/login/);
    await page.goto(`/import?purpose=reconciliation&accountId=${account.id}`);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'synthetic-smart.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(
      page.getByRole('button', { name: '预览外部流水', exact: true }),
    ).toBeVisible();
    await page.getByRole('combobox', { name: /默认资金账户/ }).focus();
    await page
      .getByRole('combobox', { name: /默认资金账户/ })
      .press('ArrowDown');
    if (width < 600)
      await page.getByLabel('搜索选项', { exact: true }).fill(accountName);
    else
      await page
        .getByRole('combobox', { name: /默认资金账户/ })
        .fill(accountName);
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
      )
      .filter({ hasText: accountName })
      .click();
    for (const [label, column] of [
      ['日期时间', 'date'],
      ['金额', 'amount'],
      ['交易类型', 'type'],
      ['商户/对象', 'merchant'],
      ['币种', 'currency'],
      ['订单/流水号', 'reference'],
    ]) {
      await page
        .getByRole('combobox', { name: new RegExp(label) })
        .first()
        .focus();
      await page
        .getByRole('combobox', { name: new RegExp(label) })
        .first()
        .press('ArrowDown');
      await page
        .locator(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
        )
        .getByText(column, { exact: true })
        .click();
    }
    const mappingSaved = page.waitForResponse(
      (r) => r.url().endsWith('/mapping') && r.request().method() === 'PUT',
    );
    await page
      .getByRole('button', { name: '预览外部流水', exact: true })
      .click();
    console.log(
      'Mapping submit diagnostics',
      await page.evaluate(() => ({
        forms: document.forms.length,
        invalid: [...document.querySelectorAll('input:invalid')].map((x) => ({
          id: x.id,
          message: (x as HTMLInputElement).validationMessage,
        })),
        formErrors: [
          ...document.querySelectorAll('.ant-form-item-explain-error'),
        ].map((x) => x.textContent),
      })),
      errors,
    );
    const mappingResponse = await mappingSaved;
    expect(mappingResponse.status(), await mappingResponse.text()).toBe(200);
    await page
      .getByRole('link', {
        name: '账户对账 · synthetic-smart.csv',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: '接收下一批流水', exact: true })
      .click();
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /确\s*定|OK/ })
      .click();
    const row = page.getByRole('row').filter({ hasText: merchant });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '复核与解释' }).click();
    const drawer = page.getByRole('dialog', {
      name: '人工复核与匹配解释',
      exact: true,
    });
    await expect(drawer.getByText('金额一致', { exact: true })).toBeVisible();
    await expect(drawer.getByText('商户一致', { exact: true })).toBeVisible();
    await drawer.getByLabel('复核说明').fill('核查合成来源与账务分录一致');
    await drawer.getByRole('button', { name: '确认匹配', exact: true }).click();
    let saved = page.waitForResponse(
      (r) =>
        r.url().includes('/smart-reconciliation/') &&
        r.url().endsWith('/confirm') &&
        r.request().method() === 'POST',
    );
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /确\s*定|OK/ })
      .click();
    expect((await saved).status()).toBe(200);
    await expect(drawer.getByText('Confirmed', { exact: true })).toBeVisible();
    await drawer.getByLabel('复核说明').fill('测试安全撤销');
    saved = page.waitForResponse(
      (r) => r.url().endsWith('/resolve') && r.request().method() === 'POST',
    );
    await drawer.getByRole('button', { name: '撤销 / 重新匹配' }).click();
    expect((await saved).status()).toBe(200);
    await expect(drawer.getByText('Revoked', { exact: true })).toBeVisible();
    await drawer.getByLabel('复核说明').fill('重新核查后匹配');
    await expect(
      drawer.getByRole('button', { name: '确认匹配', exact: true }),
    ).toBeEnabled();
    await drawer.getByRole('button', { name: '确认匹配', exact: true }).click();
    saved = page.waitForResponse(
      (r) => r.url().endsWith('/confirm') && r.request().method() === 'POST',
    );
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /确\s*定|OK/ })
      .click();
    expect((await saved).status()).toBe(200);
    await drawer.locator('.ant-drawer-close').click();
    await expect(
      page.getByRole('row').filter({ hasText: `Unmatched-${width}` }),
    ).toContainText('待复核');
    await area('差异与异常');
    await page.getByLabel('异常期间开始').fill('2026-10-01T00:00:00+08:00');
    await page.getByLabel('异常期间结束').fill('2026-10-26T23:59:59+08:00');
    await page.getByRole('button', { name: '查询差异', exact: true }).click();
    await expect(
      page.getByText('来源流水尚无已确认内部交易', { exact: true }),
    ).toBeVisible();
    await area('期间余额调节');
    await page
      .getByLabel('期间开始（含时区）')
      .fill('2026-10-01T00:00:00+08:00');
    await page
      .getByLabel('期间结束（含时区）')
      .fill('2026-10-26T23:59:59+08:00');
    await page.getByLabel('银行期初余额', { exact: true }).fill('1000');
    await page.getByLabel('银行期末余额', { exact: true }).fill('985');
    await page
      .getByRole('button', { name: '预览余额调节', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '完成并保存快照' }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: '未达与忽略项目复核', exact: true })
      .focus();
    await page
      .getByRole('combobox', { name: '未达与忽略项目复核', exact: true })
      .press('ArrowDown');
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
      )
      .getByText('已逐项复核并确认为未达或合理忽略项目', { exact: true })
      .click();
    await page
      .getByLabel('未达项目复核说明', { exact: true })
      .fill(
        '合成银行独有扣款5元已逐项核查，作为待补记未达项目保留，不创建账务',
      );
    await page
      .getByRole('button', { name: '预览余额调节', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '完成并保存快照' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '完成并保存快照' }).click();
    saved = page.waitForResponse(
      (r) =>
        r.url().endsWith('/balance/complete') &&
        r.request().method() === 'POST',
    );
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /确\s*定|OK/ })
      .click();
    expect((await saved).status()).toBe(200);
    const detail = await data(
      await request.get(session.origin + `/api/transactions/${tx.id}`, {
        headers: auth,
      }),
    );
    expect(detail.amount).toBe('10.00');
    const accounts = await data(
      await request.get(session.origin + '/api/accounts', { headers: auth }),
    );
    expect(
      accounts.find((a: { id: string }) => a.id === account.id).balance,
    ).toBe('990.00');
    const snapshots = await data(
      await request.get(
        session.origin +
          `/api/smart-reconciliation/balance/history?accountId=${account.id}`,
        { headers: auth },
      ),
    );
    expect(snapshots.total).toBe(1);
    const audit = await data(
      await request.get(
        session.origin +
          `/api/smart-reconciliation/history?accountId=${account.id}`,
        { headers: auth },
      ),
    );
    expect(audit.total).toBeGreaterThan(0);
    await area('任务与进度');
    await page
      .getByLabel('任务开始', { exact: true })
      .fill('2026-10-01T00:00:00+08:00');
    await page
      .getByLabel('任务结束', { exact: true })
      .fill('2026-10-26T23:59:59+08:00');
    await page
      .getByRole('button', { name: '创建建议任务', exact: true })
      .click();
    await page
      .getByRole('button', { name: '预览安全自动确认', exact: true })
      .click();
    await expect(
      page.locator('.ant-modal-confirm').getByText(/文件及映射未由服务器核准/),
    ).toBeVisible();
    await expect(
      page
        .locator('.ant-modal-confirm')
        .getByRole('button', { name: /确\s*定|OK/ }),
    ).toBeDisabled();
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /取\s*消|Cancel/ })
      .click();
    await page
      .getByRole('button', { name: '处理 / 继续下一批', exact: true })
      .click();
    await expect(page.getByText(/候选数: 0/)).toBeVisible();
    const secondTaskCreated = page.waitForResponse(
      (r) =>
        r.url().endsWith('/smart-reconciliation/tasks') &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: '创建建议任务', exact: true })
      .click();
    const secondTask = (await (await secondTaskCreated).json()).data;
    const runner = page.locator(`[data-task-id="${secondTask.id}"]`);
    await runner
      .getByRole('button', { name: '连续生成建议', exact: true })
      .click();
    await expect(
      runner.getByRole('button', { name: '连续生成建议', exact: true }),
    ).toBeDisabled();
    const resumedTasks = await data(
      await request.get(
        session.origin +
          `/api/smart-reconciliation/tasks?accountId=${account.id}`,
        { headers: auth },
      ),
    );
    expect(
      resumedTasks.find((x: { id: string }) => x.id === secondTask.id),
    ).toMatchObject({ state: 'Completed', processed: 1 });
    await area('匹配规则');
    await page
      .getByLabel('规则名称', { exact: true })
      .fill('Synthetic amount rule');
    await page
      .getByLabel('规则目标金额（绝对值，可空）', { exact: true })
      .fill('5');
    const rulePreviewResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/rules/preview') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: '预览当前规则', exact: true })
      .click();
    const previewResponse = await rulePreviewResponse;
    expect(previewResponse.status()).toBe(200);
    expect((await previewResponse.json()).data.evaluated).toBe(1);
    expect(
      (
        await data(
          await request.get(
            session.origin +
              `/api/smart-reconciliation/rules?accountId=${account.id}`,
            { headers: auth },
          ),
        )
      ).length,
    ).toBe(0);
    await page
      .getByRole('dialog', { name: '规则影响预览（不保存、不确认）' })
      .getByRole('button', { name: '关闭预览', exact: true })
      .click();
    const ruleSaved = page.waitForResponse(
      (r) => r.url().endsWith('/rules') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '保存规则', exact: true }).click();
    const ruleResponse = await ruleSaved;
    expect(ruleResponse.status()).toBe(200);
    expect((await ruleResponse.json()).data.expectedAmount).toBe('5.00');
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await area('流水与建议');
    await expect(
      page.getByRole('row').filter({ hasText: merchant }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: session.output + `/reconciliation-ui-${width}.png`,
      fullPage: true,
    });
    await page.goto('/settings');
    await page.getByRole('radio', { name: '深色', exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto(`/reconciliation?accountId=${account.id}`);
    await expect(
      page.getByRole('heading', { name: '智能对账中心', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('智能对账工作台', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: merchant }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: session.output + `/reconciliation-dark-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.goto('/settings');
    await page.getByRole('radio', { name: '跟随系统', exact: true }).check();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page
      .getByRole('main')
      .getByRole('combobox', { name: 'Language / 语言', exact: true })
      .focus();
    await page
      .getByRole('main')
      .getByRole('combobox', { name: 'Language / 语言', exact: true })
      .press('ArrowDown');
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
      )
      .getByText('English', { exact: true })
      .click();
    await page.goto(`/reconciliation?accountId=${account.id}`);
    await expect(
      page.getByRole('heading', {
        name: 'Smart reconciliation center',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Smart reconciliation workspace', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    fs.writeFileSync(
      session.output + `/reconciliation-ui-${width}.json`,
      JSON.stringify(
        { width, synthetic: true, passed: true, errors, ledgerUnchanged: true },
        null,
        2,
      ),
    );
  });
