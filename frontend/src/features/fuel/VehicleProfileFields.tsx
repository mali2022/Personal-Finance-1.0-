import {
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
} from 'antd';
import { CURRENCY_CODES } from '../../constants/currencies';
export const energyLabels: Record<string, [string, string]> = {
  Unknown: ['未知', 'Unknown'],
  Petrol: ['汽油', 'Petrol'],
  Diesel: ['柴油', 'Diesel'],
  Hybrid: ['油电混合', 'Hybrid'],
  PlugInHybrid: ['插电混合', 'Plug-in hybrid'],
  Electric: ['纯电', 'Electric'],
  Other: ['其他', 'Other'],
};
export default function VehicleProfileFields({
  english,
}: {
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  return (
    <>
      <Row gutter={12}>
        {(
          [
            ['brand', tr('品牌', 'Brand'), 100],
            ['model', tr('车型', 'Model'), 100],
            ['engine', tr('发动机（选填）', 'Engine (optional)'), 200],
          ] as const
        ).map(([name, label, max]) => (
          <Col xs={24} sm={12} key={name}>
            <Form.Item name={name} label={label}>
              <Input maxLength={max} />
            </Form.Item>
          </Col>
        ))}
        <Col xs={24} sm={12}>
          <Form.Item name="modelYear" label={tr('年款', 'Model year')}>
            <InputNumber
              min={1886}
              max={new Date().getFullYear() + 1}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="energyType" label={tr('能源类型', 'Energy type')}>
            <Select
              options={Object.entries(energyLabels).map(([value, labels]) => ({
                value,
                label: labels[english ? 1 : 0],
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="status" label={tr('车辆状态', 'Vehicle status')}>
            <Select
              options={[
                { value: 'Active', label: tr('使用中', 'Active') },
                { value: 'Archived', label: tr('已归档', 'Archived') },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="tankCapacity"
            label={tr('油箱容量 L', 'Tank capacity L')}
          >
            <InputNumber
              min={0.1}
              max={10000}
              precision={1}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="purchaseDate"
            label={tr('购置日期', 'Purchase date')}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="purchaseAmount"
            label={tr('原始购置金额', 'Original purchase amount')}
          >
            <InputNumber
              min={0}
              max={1000000000}
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="purchaseCurrency"
            label={tr('购置金额原币', 'Purchase currency')}
            dependencies={['purchaseAmount']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  getFieldValue('purchaseAmount') != null && !value
                    ? Promise.reject(
                        new Error(
                          tr(
                            '填写金额时须选择币种',
                            'Select currency for the purchase amount',
                          ),
                        ),
                      )
                    : Promise.resolve(),
              }),
            ]}
          >
            <Select
              allowClear
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
        </Col>
        {(
          [
            ['initialOdometer', tr('初始里程 km', 'Initial odometer km')],
            [
              'currentOdometer',
              tr('手填当前里程 km', 'Manual current odometer km'),
            ],
            [
              'annualDistance',
              tr('预计年里程 km', 'Expected annual distance km'),
            ],
          ] as const
        ).map(([name, label]) => (
          <Col xs={24} sm={12} key={name}>
            <Form.Item name={name} label={label}>
              <InputNumber
                min={0}
                max={10000000}
                precision={1}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        ))}
      </Row>
      <Form.Item name="note" label={tr('车辆备注', 'Vehicle notes')}>
        <Input.TextArea maxLength={1000} rows={2} />
      </Form.Item>
    </>
  );
}
