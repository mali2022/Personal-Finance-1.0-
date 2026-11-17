import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { useState } from 'react';
import { Alert, App, Button, Drawer, Form, Input, Space, Switch, Table } from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { investmentApi } from '../api/investments';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { Money } from '../components/Money';
import type { ApiResponse, Currency } from '../types';

type Preview = {
  accountImpact: string;
  liabilityImpact: string;
  currency: Currency;
  cashImpact: string;
  expense: string;
  receivable: string;
  rule: string;
  shares: { person: string; own: boolean; amount: string }[];
};
export default function AdvanceGroupEditor({
  onSaved,
}: {
  onSaved: () => void;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<{
    body: Record<string, unknown>;
    result: Preview;
  }>();
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  async function calculate() {
    try {
      const values = await form.validateFields();
      setBusy(true);
      const body = {
        ...values,
        occurredAt: values.occurredAt + 'T12:00:00+08:00',
        note: values.note || '',
      };
      const response = await apiClient.post<ApiResponse<Preview>>(
        '/advances/group-preview',
        body,
      );
      setPreview({ body, result: response.data.data });
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview) return;
    try {
      setBusy(true);
      await investmentApi.save('/advances/groups', preview.body);
      message.success(tr("分摊已确认"));
      setOpen(false);
      setPreview(undefined);
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : tr("保存失败"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        onClick={() => {
          form.resetFields();
          setPreview(undefined);
          setOpen(true);
        }}
      >
        {tr("家庭多人分摊")}</Button>
      <Drawer
        title={tr("家庭多人分摊")}
        open={open}
        onClose={() => setOpen(false)}
        width="min(680px, 100vw)"
      >
        {preview ? (
          <>
            <p>
              {tr("现金变化")}{' '}
              <Money
                value={preview.result.cashImpact}
                currency={preview.result.currency}
              />
              {tr("；本人费用")}{' '}
              <Money
                value={preview.result.expense}
                currency={preview.result.currency}
              />
              {tr("；应收")}{' '}
              <Money
                value={preview.result.receivable}
                currency={preview.result.currency}
              />
            </p>
            <p>
              {tr("付款账户账面变化")}{' '}
              <Money
                value={preview.result.accountImpact}
                currency={preview.result.currency}
              />
              {tr("；信用卡负债变化")}{' '}
              <Money
                value={preview.result.liabilityImpact}
                currency={preview.result.currency}
              />
            </p>
            <Table
              scroll={{ x: 'max-content' }}
              pagination={false}
              rowKey="person"
              dataSource={preview.result.shares}
              columns={[
                { title: tr("人员"), dataIndex: 'person' },
                {
                  title: tr("承担金额"),
                  dataIndex: 'amount',
                  render: (value) => (
                    <Money value={value} currency={preview.result.currency} />
                  ),
                },
                {
                  title: tr("责任"),
                  dataIndex: 'own',
                  render: (own) => (own ? '本人费用' : '约定应收'),
                },
              ]}
            />
            <Alert message={preview.result.rule} />
            <Space>
              <Button onClick={() => setPreview(undefined)}>{tr("返回修改")}</Button>
              <Button type="primary" loading={busy} onClick={confirm}>
                {tr("确认实际付款与分摊")}</Button>
            </Space>
          </>
        ) : (
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              strategy: 'Equal',
              occurredAt: dayjs().format('YYYY-MM-DD'),
              shares: [
                { person: '本人', value: '1', own: true },
                { person: '', value: '1', own: false },
              ],
            }}
          >
            <Form.Item
              name="name"
              label={tr("商品或事项")}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="accountId"
              label={tr("实际付款账户")}
              rules={[{ required: true }]}
            >
              <AccountSelector />
            </Form.Item>
            <Form.Item
              name="amount"
              label={tr("实际付款总额")}
              rules={[{ required: true }]}
            >
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="occurredAt"
              label={tr("实际付款日期")}
              rules={[{ required: true }]}
            >
              <DateInput type="date" />
            </Form.Item>
            <Form.Item name="strategy" label={tr("分摊方式")}>
              <Select
                options={[
                  { value: 'Equal', label: tr("按人数平均") },
                  { value: 'Ratio', label: tr("按比例权重") },
                  { value: 'Fixed', label: tr("指定各人承担额") },
                ]}
              />
            </Form.Item>
            <Form.Item name="categoryId" label={tr("本人费用分类")}>
              <CategorySelector kind="Expense" />
            </Form.Item>
            <Form.List name="shares">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <div key={field.key}>
                      <Form.Item
                        name={[field.name, 'person']}
                        label={tr("第 {0} 人", field.name + 1)}
                        rules={[{ required: true }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'value']}
                        label={tr("指定金额或比例权重（平均分摊时忽略）")}
                        rules={[{ required: true }]}
                      >
                        <Input inputMode="decimal" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'own']}
                        label={tr("由本人承担")}
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      <Button onClick={() => remove(field.name)}>
                        {tr("移除人员")}</Button>
                    </div>
                  ))}
                  <Button
                    onClick={() => add({ person: '', value: '1', own: false })}
                  >
                    {tr("增加人员")}</Button>
                </>
              )}
            </Form.List>
            <Form.Item name="note" label={tr("备注")}>
              <Input.TextArea />
            </Form.Item>
            <Button type="primary" loading={busy} onClick={calculate}>
              {tr("预览资金与分摊")}</Button>
          </Form>
        )}
      </Drawer>
    </>
  );
}
