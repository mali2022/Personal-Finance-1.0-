import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Space,
  TimePicker,
  Typography,
} from 'antd';
import { fuelPaymentPreview } from './calculation';
export default function FuelDiscountFields({ english }: { english: boolean }) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const form = Form.useFormInstance();
  const litres = Form.useWatch('litres', form),
    posted = Form.useWatch('postedUnitPrice', form),
    discount = Form.useWatch('discount', form),
    points = Form.useWatch('pointsRedemption', form),
    amount = Form.useWatch('amount', form);
  const preview = fuelPaymentPreview(litres, posted, discount, points);
  return (
    <>
      <Space wrap style={{ marginTop: 12 }}>
        {(
          [
            [
              'postedUnitPrice',
              '挂牌单价（每升）',
              'Posted price per litre',
              3,
            ],
            ['originalAmount', '优惠前金额', 'Gross amount', 2],
            ['discount', '现金优惠', 'Cash discount', 2],
            ['pointsRedemption', '积分抵扣金额', 'Points redeemed', 2],
          ] as const
        ).map(([name, zh, en, precision]) => (
          <Form.Item key={name} name={name} label={tr(zh, en)}>
            <InputNumber
              min={name === 'postedUnitPrice' ? 0.001 : 0}
              max={name === 'postedUnitPrice' ? 1000000 : 100000000}
              precision={precision}
            />
          </Form.Item>
        ))}
      </Space>
      <Typography.Paragraph>
        {tr('实际单位购油成本：', 'Actual paid price per litre: ')}
        {typeof litres === 'number' && litres > 0 && typeof amount === 'number'
          ? (amount / litres).toFixed(3)
          : '—'}
      </Typography.Paragraph>
      {preview && (
        <Space wrap>
          <Typography.Text>
            {tr(
              '按挂牌价及优惠计算：原价 / 实付',
              'From posted price and discounts: gross / paid',
            )}
            : {preview.gross} / {preview.paid}
          </Typography.Text>
          <Button
            onClick={() =>
              form.setFieldsValue({
                originalAmount: preview.gross,
                amount: preview.paid,
              })
            }
          >
            {tr('确认填入计算金额', 'Apply calculated amounts')}
          </Button>
        </Space>
      )}
      <Form.Item name="paymentMethod" label={tr('支付方式', 'Payment method')}>
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item
        name="drivingScene"
        label={tr('行驶场景', 'Driving conditions')}
      >
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item
        name="occurredTime"
        label={tr(
          '加油时间（选填，不补造历史时间）',
          'Time of fill (optional; do not invent historical times)',
        )}
      >
        <TimePicker format="HH:mm:ss" />
      </Form.Item>
      <Form.Item name="odometerReset" valuePropName="checked">
        <Checkbox>
          {tr(
            '里程表更换或重置（须在备注写明原因；不跨此记录计算油耗）',
            'Odometer replaced/reset (explain in notes; consumption cannot cross this record)',
          )}
        </Checkbox>
      </Form.Item>
    </>
  );
}
