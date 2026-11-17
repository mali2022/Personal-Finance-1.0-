import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
} from 'antd';
import { useEffect } from 'react';
import { blank, states, purchaseStates, type FestivalInput } from './api';
export function FestivalEditor({
  value,
  isNew,
  open,
  busy,
  onClose,
  onSave,
}: {
  value?: FestivalInput;
  isNew: boolean;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (v: FestivalInput) => void;
}) {
  const [form] = Form.useForm<FestivalInput>();
  useEffect(() => {
    if (open) form.setFieldsValue(value ?? blank());
  }, [open, value, form]);
  return (
    <Modal
      open={open}
      title={isNew ? '创建节日计划' : '编辑节日计划'}
      width={850}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={busy}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => onSave({ ...blank(), ...value, ...v })}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, max: 100 }]}
        >
          <Input />
        </Form.Item>
        <Space wrap>
          <Form.Item
            name="startsOn"
            label="开始日期"
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            name="endsOn"
            label="结束日期"
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="prepareOn" label="筹备日期">
            <Input type="date" />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item
            name="budget"
            label="总预算"
            rules={[{ required: true, pattern: /^\d+(\.\d{1,2})?$/ }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="currency" label="报告币种">
            <Select
              style={{ width: 100 }}
              options={['CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP'].map(
                (value) => ({ value, label: value }),
              )}
            />
          </Form.Item>
          <Form.Item name="state" label="状态">
            <Select
              style={{ width: 120 }}
              options={Object.entries(states).map(([value, label]) => ({
                value,
                isNew,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="kind" label="类型">
            <Select
              style={{ width: 120 }}
              options={[
                { value: 'Traditional', label: '传统节日' },
                { value: 'International', label: '国际节日' },
                { value: 'Shopping', label: '购物节' },
                { value: 'Personal', label: '个人纪念日' },
              ]}
            />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item name="recurrence" label="重复规则">
            <Select
              style={{ width: 130 }}
              options={[
                { value: 'Once', label: '单次' },
                { value: 'Yearly', label: '每年（确认创建）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="region" label="地区">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="savingTarget" label="提前储蓄目标">
            <InputNumber min={0} precision={2} />
          </Form.Item>
          <Form.Item name="reserved" label="计划预留（非实际存款）">
            <InputNumber min={0} precision={2} />
          </Form.Item>
        </Space>
        <Form.Item name="reminderDays" label="提前提醒天数">
          <Select
            mode="multiple"
            options={[90, 60, 30, 14, 7, 3, 0].map((value) => ({
              value,
              isNew,
              label: value === 0 ? '当天' : `${value}天`,
            }))}
          />
        </Form.Item>
        <Form.Item name="hidden" valuePropName="checked">
          <Checkbox>在日历隐藏</Checkbox>
        </Form.Item>
        <Form.List name="categories">
          {(fields, { add, remove }) => (
            <>
              <strong>分类预算</strong>
              {fields.map((f) => (
                <Space key={f.key} wrap>
                  <Form.Item
                    name={[f.name, 'category']}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="分类" />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'amount']}
                    rules={[{ required: true, pattern: /^\d+(\.\d{1,2})?$/ }]}
                  >
                    <Input placeholder="金额" />
                  </Form.Item>
                  <Button onClick={() => remove(f.name)}>移除</Button>
                </Space>
              ))}
              <p>
                <Button onClick={() => add({ category: 'Gift', amount: '0' })}>
                  添加分类预算
                </Button>
              </p>
            </>
          )}
        </Form.List>
        <Form.List name="purchases">
          {(fields, { add, remove }) => (
            <>
              <strong>礼物与活动采购</strong>
              {fields.map((f) => (
                <div
                  key={f.key}
                  style={{
                    borderBottom: '1px solid var(--ant-color-border, #ddd)',
                    paddingTop: 12,
                  }}
                >
                  <Form.Item name={[f.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Space wrap>
                    <Form.Item
                      name={[f.name, 'name']}
                      label="名称"
                      rules={[{ required: true, max: 100 }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item name={[f.name, 'recipient']} label="收礼对象">
                      <Input maxLength={100} />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'amount']}
                      label="预计金额"
                      rules={[{ required: true, pattern: /^\d+(\.\d{1,2})?$/ }]}
                    >
                      <Input inputMode="decimal" />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'category']}
                      label="分类"
                      rules={[{ required: true }]}
                    >
                      <Input maxLength={80} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'state']} label="状态">
                      <Select
                        style={{ width: 125 }}
                        options={Object.entries(purchaseStates).map(
                          ([value, label]) => ({ value, label }),
                        )}
                      />
                    </Form.Item>
                  </Space>
                  <Space wrap>
                    <Form.Item name={[f.name, 'url']} label="商品链接">
                      <Input type="url" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'deadline']} label="截止日期">
                      <Input type="date" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'note']} label="备注">
                      <Input maxLength={2000} />
                    </Form.Item>
                    <Button danger onClick={() => remove(f.name)}>
                      移除采购
                    </Button>
                  </Space>
                </div>
              ))}
              <p>
                <Button
                  onClick={() =>
                    add({
                      id: crypto.randomUUID(),
                      name: '',
                      recipient: '',
                      amount: '0',
                      category: 'Gift',
                      state: 'Idea',
                      note: '',
                    })
                  }
                >
                  添加采购项目
                </Button>
              </p>
            </>
          )}
        </Form.List>
        <Form.Item name="note" label="备注">
          <Input.TextArea maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
