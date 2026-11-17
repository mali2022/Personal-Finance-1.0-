import { App, Button, Form, Input, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale } from '../../i18n';
import { smartApi, type Statement } from './api';
export function CorrectionPanel({ statement }: { statement: Statement }) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const fields = await form.validateFields();
      const body = {
        ...fields,
        postedAt: fields.postedAt || null,
        version: statement.version,
      };
      await smartApi.correct(statement.id, body, crypto.randomUUID());
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['smart-reconciliation'] });
      message.success(
        t(
          '规范化字段已修正，原始文件和来源行保留',
          'Normalized fields corrected; original file and source row retained',
        ),
      );
    },
    onError: (e: Error) => message.error(e.message),
  });
  return (
    <details className="mt20 mb16">
      <summary>{t('修正规范化字段', 'Correct normalized fields')}</summary>
      <Form
        name="reconciliationCorrection"
        form={form}
        layout="vertical"
        style={{ marginTop: 8 }}
        disabled={statement.state !== 'Pending'}
        initialValues={{
          amount: statement.amount,
          occurredAt: statement.occurredAt,
          postedAt: statement.postedAt || '',
          merchant: statement.merchant,
          note: statement.note,
          type: statement.type,
          paymentSource: statement.paymentSource || '',
          reason: '',
        }}
      >
        <Form.Item
          name="amount"
          label={t('来源金额（带符号）', 'Signed source amount')}
          rules={[{ required: true }]}
        >
          <Input inputMode="decimal" />
        </Form.Item>
        <Form.Item
          name="occurredAt"
          label={t('来源交易时间', 'Source transaction time')}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="postedAt"
          label={t('来源银行入账时间', 'Source bank posting time')}
        >
          <Input />
        </Form.Item>
        <Form.Item name="merchant" label={t('来源商户', 'Source merchant')}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="note" label={t('来源备注', 'Source note')}>
          <Input.TextArea maxLength={2000} />
        </Form.Item>
        <Form.Item
          name="type"
          label={t('来源交易类型', 'Source transaction type')}
        >
          <Select
            options={[
              'Expense',
              'Income',
              'Transfer',
              'Refund',
              'CreditCardPayment',
              'Adjustment',
            ].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item
          name="paymentSource"
          label={t('来源付款渠道', 'Source payment channel')}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          name="reason"
          label={t('修正原因', 'Correction reason')}
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea maxLength={1000} />
        </Form.Item>
        <Button
          disabled={statement.state !== 'Pending'}
          loading={save.isPending}
          onClick={() =>
            modal.confirm({
              title: t(
                '确认修正对账工作副本？',
                'Correct this reconciliation working copy?',
              ),
              onOk: () => save.mutateAsync().catch(() => undefined),
            })
          }
        >
          {t('保存规范化修正', 'Save normalized correction')}
        </Button>
      </Form>
    </details>
  );
}
