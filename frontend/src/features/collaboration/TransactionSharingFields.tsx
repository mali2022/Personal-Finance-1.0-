import { useEffect } from 'react';
import { Alert, Button, Form, Input, Select, Space, Spin } from 'antd';
import type { FormInstance } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { collaborationApi } from './api';
export function TransactionSharingFields({
  form,
  transactionId,
  expense,
}: {
  form: FormInstance;
  transactionId?: string;
  expense: boolean;
}) {
  const books = useQuery({
    queryKey: ['spaces'],
    queryFn: collaborationApi.list,
  });
  const current = useQuery({
    queryKey: ['transaction-sharing', transactionId],
    queryFn: () => collaborationApi.assignment(transactionId!),
    enabled: !!transactionId,
  });
  const bookId = Form.useWatch(['collaboration', 'bookId'], form);
  const book = books.data?.find((b) => b.id === bookId);
  const scope = book?.familyId || bookId;
  const members = useQuery({
    queryKey: ['space-report', scope, dayjs().format('YYYY-MM')],
    queryFn: () => collaborationApi.report(scope, dayjs().format('YYYY-MM')),
    enabled: !!scope,
  });
  useEffect(() => {
    if (!current.isSuccess) return;
    const timer = setTimeout(
      () =>
        form.setFieldValue(
          'collaboration',
          current.data ?? { bookId: null, rule: 'Equal', shares: [] },
        ),
      0,
    );
    return () => clearTimeout(timer);
  }, [current.data, current.isSuccess, form]);
  const options =
    members.data?.members
      .filter((m) => m.active)
      .map((m) => ({ value: m.id, label: m.name })) ?? [];
  return (
    <div
      style={{
        borderTop: '1px solid var(--border-color, #eee)',
        paddingTop: 12,
      }}
    >
      <Form.Item
        name={['collaboration', 'bookId']}
        label="账本归属"
        rules={[
          {
            validator: async () => {
              if (books.isError || (transactionId && !current.isSuccess))
                throw new Error('请等待账本归属加载完成；失败时请重新打开');
            },
          },
        ]}
      >
        <Select
          allowClear
          placeholder="个人交易（未归属账本）"
          loading={books.isPending}
          options={books.data
            ?.filter(
              (b) => b.kind === 'Book' && !b.archived && b.role !== 'Viewer',
            )
            .map((b) => ({ value: b.id, label: b.name }))}
          onChange={() => {
            form.setFieldsValue({
              collaboration: {
                consumerId: undefined,
                payerId: undefined,
                rule: 'Equal',
                shares: [],
              },
            });
          }}
        />
      </Form.Item>
      {(books.isError || current.isError || members.isError) && (
        <Alert type="error" message="账本归属加载失败，请重新打开后再保存" />
      )}
      {transactionId && current.isPending && <Spin />}
      {bookId && (
        <>
          <Alert
            type="info"
            showIcon
            message="该交易的金额、商户、备注及分摊信息会向账本和所属家庭成员共享。私人账户信息不共享。"
            style={{ marginBottom: 12 }}
          />
          <Form.Item name={['collaboration', 'consumerId']} label="消费人">
            <Select allowClear options={options} />
          </Form.Item>
          <Form.Item name={['collaboration', 'payerId']} label="付款人">
            <Select allowClear options={options} />
          </Form.Item>
          {expense && (
            <>
              <Form.Item
                name={['collaboration', 'rule']}
                label="分摊规则"
                initialValue="Equal"
              >
                <Select
                  options={[
                    { value: 'Equal', label: '均分（尾差自动分配）' },
                    { value: 'Percent', label: '按比例（合计100%）' },
                    { value: 'Amount', label: '按金额（合计等于支出）' },
                  ]}
                />
              </Form.Item>
              <Form.List name={['collaboration', 'shares']}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space
                        key={field.key}
                        align="baseline"
                        style={{ display: 'flex' }}
                      >
                        <Form.Item
                          name={[field.name, 'memberId']}
                          rules={[{ required: true, message: '请选择承担人' }]}
                        >
                          <Select
                            placeholder="费用承担人"
                            options={options}
                            style={{ minWidth: 140 }}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'value']}
                          initialValue="1"
                        >
                          <Input
                            placeholder="金额或比例；均分忽略"
                            style={{ width: 130 }}
                          />
                        </Form.Item>
                        <Button
                          danger
                          type="text"
                          onClick={() => remove(field.name)}
                        >
                          移除
                        </Button>
                      </Space>
                    ))}
                    <Button
                      onClick={() => add({ value: '1' })}
                      style={{ marginBottom: 16 }}
                    >
                      添加费用承担人
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}
        </>
      )}
    </div>
  );
}
