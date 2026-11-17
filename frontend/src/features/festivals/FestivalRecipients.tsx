import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, List, Modal, Space, App } from 'antd';
import { read, write, errorText } from './api';
type Recipient = {
  name: string;
  relationship: string;
  preferences: string;
  avoid: string;
  currency: string;
  minBudget: string;
  maxBudget: string;
};
export function FestivalRecipients() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<Recipient>();
  const q = useQuery({
    queryKey: ['festival-recipients'],
    queryFn: () => read<{ id: string; input: Recipient }[]>('/recipients'),
  });
  return (
    <Card
      title="常用送礼对象"
      extra={<Button onClick={() => setOpen(true)}>新增对象</Button>}
    >
      <List
        loading={q.isLoading}
        dataSource={q.data}
        renderItem={(x) => (
          <List.Item>
            <List.Item.Meta
              title={`${x.input.name} · ${x.input.relationship}`}
              description={`偏好：${x.input.preferences}；不适合：${x.input.avoid}`}
            />
          </List.Item>
        )}
      />
      {q.isError && <Button onClick={() => q.refetch()}>重试</Button>}
      <Modal
        open={open}
        title="登记对象偏好"
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={busy}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            currency: 'CNY',
            minBudget: '0',
            maxBudget: '0',
            relationship: '',
            preferences: '',
            avoid: '',
          }}
          onFinish={async (v) => {
            setBusy(true);
            try {
              await write('/recipients', v, '0');
              await qc.invalidateQueries({ queryKey: ['festival-recipients'] });
              setOpen(false);
              form.resetFields();
              message.success('已保存');
            } catch (e) {
              message.error(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="昵称"
            rules={[{ required: true, max: 100 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="relationship" label="关系">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="preferences" label="用户明确记录的偏好">
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          <Form.Item name="avoid" label="禁忌 / 不适合">
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          <Space>
            <Form.Item name="currency" label="币种">
              <Input />
            </Form.Item>
            <Form.Item name="minBudget" label="最低预算">
              <Input />
            </Form.Item>
            <Form.Item name="maxBudget" label="最高预算">
              <Input />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
