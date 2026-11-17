import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button, Form, InputNumber } from 'antd';
import FuelReceiptFields from '../features/fuel/FuelReceiptFields';
import { recognizePayrollImage } from '../features/payroll/ocr';
vi.mock('../features/payroll/ocr', () => ({ recognizePayrollImage: vi.fn() }));
const values = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recognizePayrollImage).mockResolvedValue({
    text: 'Amount paid:150.00\nLitres:20.000\nOdometer:12345',
    confidence: 95,
  });
});
function Entry() {
  const [form] = Form.useForm();
  return (
    <Form name="receipt-test" form={form} initialValues={{ amount: 100 }}>
      <Form.Item name="amount" label="Amount">
        <InputNumber />
      </Form.Item>
      <FuelReceiptFields form={form} english />
      <Button onClick={() => values(form.getFieldsValue(true))}>
        Read draft
      </Button>
    </Form>
  );
}
function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Entry />
    </QueryClientProvider>,
  );
}
async function upload() {
  const file = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    'receipt.png',
    { type: 'image/png' },
  );
  fireEvent.change(screen.getByLabelText('Choose fuel receipt'), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Recognize image locally/ }),
    ).toBeEnabled(),
  );
  return file;
}
it('keeps OCR in a review draft, applies only after confirmation and preserves its source', async () => {
  show();
  await upload();
  fireEvent.click(
    screen.getByRole('button', { name: /Recognize image locally/ }),
  );
  await screen.findByLabelText('Recognized text');
  expect(screen.getByLabelText('Amount')).toHaveValue('100');
  expect(
    screen.getByRole('button', { name: 'Apply reviewed fields' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply reviewed fields' }),
  );
  expect(screen.getByLabelText('Amount')).toHaveValue('150');
  fireEvent.click(screen.getByRole('button', { name: 'Read draft' }));
  expect(values).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 150,
      litres: 20,
      odometer: 12345,
      quantityMode: 'manual',
      receipt: expect.objectContaining({
        fileName: 'receipt.png',
        ocrEngine: 'tesseract-browser',
        fieldsConfirmed: true,
        ocrText: expect.stringContaining('Amount paid'),
      }),
    }),
  );
});
it('reports OCR failure while retaining manual fields and the original receipt', async () => {
  vi.mocked(recognizePayrollImage).mockRejectedValue(
    new Error('OCR unavailable'),
  );
  show();
  await upload();
  fireEvent.click(
    screen.getByRole('button', { name: /Recognize image locally/ }),
  );
  await screen.findByText('OCR unavailable');
  expect(screen.getByLabelText('Amount')).toHaveValue('100');
  fireEvent.click(screen.getByRole('button', { name: 'Read draft' }));
  expect(values).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 100,
      receipt: expect.objectContaining({ fileName: 'receipt.png' }),
    }),
  );
});
