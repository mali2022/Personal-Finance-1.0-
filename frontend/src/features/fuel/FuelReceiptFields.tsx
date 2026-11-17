import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Popconfirm,
  Space,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import { recognizePayrollImage } from '../payroll/ocr';
import { parseFuelReceipt, readFuelReceipt, receiptApi } from './receipts';
export default function FuelReceiptFields({
  form,
  id,
  english,
}: {
  form: FormInstance;
  id?: string;
  english: boolean;
}) {
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const tr = (zh: string, en: string) => (english ? en : zh);
  const cache = useQueryClient();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState(0);
  const q = useQuery({
    queryKey: ['fuel', 'receipts', id],
    queryFn: () => receiptApi.list(id!),
    enabled: !!id,
  });
  async function select(value?: File) {
    const token = revision.current;
    setError(undefined);
    setText('');
    setChecked(false);
    setFile(undefined);
    form.setFieldValue('receipt', null);
    if (!value) return;
    setBusy(true);
    form.setFieldValue('receiptReading', true);
    try {
      const input = await readFuelReceipt(value);
      if (token !== revision.current) return;
      form.setFieldValue('receipt', input);
      setFile(value);
    } catch (e) {
      if (token === revision.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === revision.current) {
        setBusy(false);
        form.setFieldValue('receiptReading', false);
      }
    }
  }
  async function recognize() {
    const token = revision.current;
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setChecked(false);
    try {
      const r = await recognizePayrollImage(file, (p) => {
        if (token === revision.current) setProgress(p);
      });
      if (token !== revision.current) return;
      setText(r.text);
      form.setFieldValue('receipt', {
        ...form.getFieldValue('receipt'),
        ocrText: r.text,
        reviewedText: r.text,
        ocrEngine: 'tesseract-browser',
        fieldsConfirmed: false,
      });
      if (!r.text.trim() || Object.keys(parseFuelReceipt(r.text)).length === 0)
        setError(
          tr(
            '没有识别出可靠标签字段，请人工填写',
            'No reliable labeled fields recognized; enter values manually',
          ),
        );
    } catch (e) {
      if (token === revision.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === revision.current) setBusy(false);
    }
  }
  function apply() {
    form.setFieldValue('receipt', {
      ...form.getFieldValue('receipt'),
      reviewedText: text,
      fieldsConfirmed: true,
    });
    const fields = parseFuelReceipt(text);
    const date = fields.date;
    if (typeof date === 'string') {
      if (dayjs(date).format('YYYY-MM-DD') !== date) {
        setError(
          tr(
            '识别日期无效，请人工核实',
            'Invalid recognized date; verify manually',
          ),
        );
        return;
      }
      fields.date = dayjs(date) as never;
    }
    form.setFieldsValue({
      ...fields,
      ...('litres' in fields
        ? {
            quantityMode: 'manual',
            quantitySource: 'Manual',
            enteredUnitPrice: null,
          }
        : {}),
    });
  }
  return (
    <Card
      size="small"
      title={tr('凭证 / 里程照片', 'Receipt / odometer photo')}
    >
      <Form.Item name="receipt" hidden>
        <Input />
      </Form.Item>
      <Form.Item
        name="receiptReading"
        hidden
        rules={[
          {
            validator: (_, value) =>
              value
                ? Promise.reject(
                    new Error(
                      tr(
                        '请等待凭证读取完成',
                        'Wait for the receipt to finish loading',
                      ),
                    ),
                  )
                : Promise.resolve(),
          },
        ]}
      >
        <Input />
      </Form.Item>
      <input
        aria-label={tr('选择加油凭证', 'Choose fuel receipt')}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        disabled={busy}
        onChange={(e) => void select(e.target.files?.[0])}
      />
      {file && (
        <Space wrap>
          <Typography.Text>{file.name}</Typography.Text>
          <Button
            disabled={busy || file.type === 'application/pdf'}
            loading={busy}
            onClick={() => void recognize()}
          >
            {tr('本地识别图片', 'Recognize image locally')}{' '}
            {busy ? progress + '%' : ''}
          </Button>
          <Button disabled={busy} onClick={() => void select()}>
            {tr('移除待上传凭证', 'Remove pending receipt')}
          </Button>
        </Space>
      )}
      {error && <Alert type="error" message={error} />}
      {text && (
        <>
          <Input.TextArea
            aria-label={tr('识别原文', 'Recognized text')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setChecked(false);
            }}
            rows={4}
          />
          <Typography.Paragraph>
            {JSON.stringify(parseFuelReceipt(text))}
          </Typography.Paragraph>
          <Checkbox
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          >
            {tr(
              '已核对识别字段，填入后仍需确认保存',
              'I reviewed the recognized fields; saving still requires confirmation',
            )}
          </Checkbox>
          <Button disabled={!checked || busy} onClick={apply}>
            {tr('填入已核对字段', 'Apply reviewed fields')}
          </Button>
        </>
      )}
      {q.isError && <Alert type="error" message={q.error.message} />}
      {q.data?.map((r) => (
        <Space key={r.id} wrap>
          <Button
            onClick={() =>
              void receiptApi.download(id!, r).catch((e) => setError(String(e)))
            }
          >
            {r.name}
          </Button>
          <Popconfirm
            title={tr(
              '删除该凭证？原加油记录保留',
              'Delete receipt? Fuel log remains',
            )}
            onConfirm={async () => {
              try {
                await receiptApi.remove(id!, r);
                await cache.invalidateQueries({
                  queryKey: ['fuel', 'receipts', id],
                });
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Button danger>{tr('删除凭证', 'Delete receipt')}</Button>
          </Popconfirm>
        </Space>
      ))}
    </Card>
  );
}
