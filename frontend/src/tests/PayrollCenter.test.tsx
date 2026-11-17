import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App, Button, Form } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { Fields, itemsField, defaultItem } from '../features/payroll/Forms';
import { printPayroll } from '../features/payroll/Payslips';
import { useUI } from '../stores/ui';
import {
  pendingOperations,
  prepareOperation,
} from '../stores/operationJournal';
vi.mock('../features/payroll/catalog', () => ({
  usePayrollCatalog: () =>
    Object.fromEntries(
      [
        'employers',
        'employments',
        'plans',
        'policies',
        'funds',
        'taxRules',
        'accounts',
      ].map((k) => [k, { data: [], isPending: false }]),
    ),
}));
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  useUI.setState({ language: 'zh-CN' });
});
function show(element: React.ReactNode) {
  return render(
    <App>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
it('preserves explicit pay item attributes in nested dynamic forms', async () => {
  const submitted = vi.fn();
  show(
    <Form
      layout="vertical"
      initialValues={{
        items: [
          { ...defaultItem, name: '基本工资', code: 'BASE', amount: '10000' },
        ],
      }}
      onFinish={submitted}
    >
      <Fields fields={[itemsField]} />
      <Button htmlType="submit">Submit test</Button>
    </Form>,
  );
  fireEvent.change(screen.getByLabelText('项目金额'), {
    target: { value: '11000.50' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit test' }));
  await waitFor(() => expect(submitted).toHaveBeenCalled());
  expect(submitted.mock.calls[0][0].items[0]).toMatchObject({
    code: 'BASE',
    amount: '11000.50',
    taxTreatment: 'Taxable',
    insuranceBasis: true,
    housingBasis: true,
  });
});
it('retains nested versioned tax bands as decimal strings', async () => {
  const submitted = vi.fn();
  show(
    <Form
      initialValues={{
        rules: {
          annualBrackets: [{ upper: '36000', rate: '0.03', quick: '0' }],
        },
      }}
      onFinish={submitted}
    >
      <Fields
        prefix={['rules']}
        fields={[
          {
            name: 'annualBrackets',
            label: ['税率表', 'Tax bands'],
            type: 'list',
            fields: [
              { name: 'upper', label: ['上限', 'Upper'], required: true },
              { name: 'rate', label: ['税率', 'Rate'], required: true },
              {
                name: 'quick',
                label: ['速算扣除数', 'Quick deduction'],
                required: true,
              },
            ],
          },
        ]}
      />
      <Button htmlType="submit">Submit test</Button>
    </Form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit test' }));
  await waitFor(() => expect(submitted).toHaveBeenCalled());
  expect(submitted.mock.calls[0][0].rules.annualBrackets).toEqual([
    { upper: '36000', rate: '0.03', quick: '0' },
  ]);
});
it('escapes user content in printable salary reports', () => {
  const write = vi.fn();
  const close = vi.fn();
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write, close },
  } as unknown as Window);
  printPayroll(
    '<script>alert(1)</script>',
    ['Name', 'Amount'],
    [['<img src=x onerror=alert(2)>', '100.00']],
    ['<svg onload=alert(3)>'],
  );
  const html = write.mock.calls[0][0] as string;
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<svg');
  expect(html).toContain('&lt;script&gt;');
  expect(close).toHaveBeenCalledOnce();
});
it('retains and reuses payroll operation keys for retry recovery', async () => {
  const user = 'payroll-test';
  const input = {
    key: 'key-payroll',
    method: 'post',
    path: '/payroll-center/slips',
    body: { month: '2026-10', items: [] },
  };
  const first = await prepareOperation(user, input);
  expect(pendingOperations(user)).toHaveLength(1);
  const second = await prepareOperation(user, { ...input, key: 'another-key' });
  expect(second.operation.key).toBe(first.operation.key);
  expect(second.reused).toBe(true);
});
