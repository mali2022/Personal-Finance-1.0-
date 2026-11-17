import { Select } from '../../components/TouchSelect';
import { localizedPair } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { useEffect } from 'react';
import { Button, Collapse, Form, Input, Space } from 'antd';
import type { FormInstance } from 'antd';
import type { Currency, PromotionInput } from '../../types';
import { minor, decimal } from '../../utils/finance';
import { Money } from '../../components/Money';
import { useQuery } from '@tanstack/react-query';
import { promotionsApi } from '../../api/promotions';
export const promotionTypes = [
  localizedPair('ProductDiscount','商品折扣'),
  localizedPair('MerchantCoupon','商家优惠券'),
  localizedPair('PlatformCoupon','平台优惠券'),
  localizedPair('PromoCode','优惠码'),
  localizedPair('OrderDiscount','订单立减'),
  localizedPair('PaymentRedPacket','支付红包'),
  localizedPair('BankDiscount','银行卡立减'),
  localizedPair('CreditCardDiscount','信用卡立减'),
  localizedPair('PlatformSubsidy','平台补贴'),
  localizedPair('ShippingDiscount','运费减免'),
  localizedPair('PointDeduction','积分抵扣'),
  localizedPair('GiftCredit','赠送消费权益'),
  localizedPair('OtherDiscount','其他抵价'),
];
export function PromotionFields({
  form,
  currency,
  fee = false,
}: {
  form: FormInstance;
  currency: Currency;
  fee?: boolean;
}) {
  useLocale();
  const benefits = useQuery({
    queryKey: ['promotions'],
    queryFn: promotionsApi.list,
  });
  const promotion = Form.useWatch('promotion', form) as
    PromotionInput | undefined;
  let total = 0n;
  let net: string | undefined;
  try {
    total = (promotion?.lines || []).reduce(
      (sum, line) => sum + minor(line.amount || '0'),
      0n,
    );
    if (promotion?.originalAmount)
      net = decimal(minor(promotion.originalAmount) - total);
  } catch {
    /* Validate incomplete input on submission. */
  }
  useEffect(() => {
    if (net !== undefined && minor(net) >= 0n)
      form.setFieldValue(fee ? 'fee' : 'amount', net);
  }, [net, form, fee]);
  useEffect(() => {
    try {
      if (!promotion?.originalAmount) return;
      let shipping = minor(promotion.shippingAmount || '0');
      let goods = minor(promotion.originalAmount) - shipping;
      for (const [i, line] of (promotion.lines || []).entries()) {
        const benefit = benefits.data?.find((b) => b.id === line.benefitId);
        let amount = minor(line.amount || '0');
        if (benefit?.discountRate) {
          const eligible = line.type === 'ShippingDiscount' ? shipping : goods;
          amount =
            (eligible * (10000n - minor(benefit.discountRate)) + 5000n) /
            10000n;
          if (
            benefit.maximumDiscount &&
            amount > minor(benefit.maximumDiscount)
          )
            amount = minor(benefit.maximumDiscount);
          if (amount >= 0n && decimal(amount) !== line.amount)
            form.setFieldValue(
              ['promotion', 'lines', i, 'amount'],
              decimal(amount),
            );
        }
        if (line.type === 'ShippingDiscount') shipping -= amount;
        else goods -= amount;
      }
    } catch {
      /* Incomplete input is validated by the server on save. */
    }
  }, [promotion, benefits.data, form]);
  return (
    <Collapse
      items={[
        {
          key: 'promotion',
          label: fee ? tr("手续费与优惠") : tr("优惠信息"),
          children: (
            <>
              <Form.Item
                name={['promotion', 'originalAmount']}
                label={fee ? tr("原手续费") : tr("优惠前金额（含运费）")}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              {!fee && (
                <Form.Item
                  name={['promotion', 'shippingAmount']}
                  label={tr("其中运费")}
                >
                  <Input inputMode="decimal" placeholder="0.00" />
                </Form.Item>
              )}
              <Form.List name={['promotion', 'lines']}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <div key={field.key}>
                        <Space wrap>
                          <Form.Item
                            name={[field.name, 'type']}
                            rules={[{ required: true }]}
                          >
                            <Select
                              style={{ width: 160 }}
                              options={(fee
                                ? [localizedPair('FeeWaiver','手续费减免')]
                                : promotionTypes
                              ).map(([value, label]) => ({ value, label }))}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'amount']}
                            rules={[{ required: true }]}
                          >
                            <Input
                              aria-label={tr("优惠金额{0}", field.name + 1)}
                              style={{ width: 110 }}
                              inputMode="decimal"
                              placeholder={tr("抵扣金额")}
                            />
                          </Form.Item>
                          <Button onClick={() => remove(field.name)}>
                            {tr("删除")}</Button>
                        </Space>
                        <Form.Item
                          name={[field.name, 'source']}
                          label={tr("优惠来源")}
                        >
                          <Input maxLength={200} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'benefitId']}
                          label={tr("关联库存权益")}
                        >
                          <Select
                            allowClear
                            options={benefits.data
                              ?.filter(
                                (b) =>
                                  b.state === 'Available' &&
                                  b.currency === currency,
                              )
                              .map((b) => ({
                                value: b.id,
                                label: `${b.name} · ${b.platform}`,
                              }))}
                            onChange={(id) => {
                              const b = benefits.data?.find((b) => b.id === id);
                              form.setFieldValue(
                                [
                                  'promotion',
                                  'lines',
                                  field.name,
                                  'benefitVersion',
                                ],
                                b?.version,
                              );
                              if (b) {
                                form.setFieldValue(
                                  ['promotion', 'lines', field.name, 'type'],
                                  b.type,
                                );
                                form.setFieldValue(
                                  ['promotion', 'lines', field.name, 'source'],
                                  b.platform,
                                );
                              }
                            }}
                          />
                        </Form.Item>
                        <Form.Item name={[field.name, 'benefitVersion']} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'activity']}
                          label={tr("活动名称")}
                        >
                          <Input maxLength={200} />
                        </Form.Item>
                      </div>
                    ))}
                    <Button
                      onClick={() =>
                        add({
                          type: fee ? 'FeeWaiver' : 'MerchantCoupon',
                          amount: '0.00',
                          source: '',
                          activity: '',
                        })
                      }
                    >
                      {tr("新增优惠")}</Button>
                  </>
                )}
              </Form.List>
              <p>
                {tr("优惠合计：")}<Money value={decimal(total)} currency={currency} />；
                {fee ? tr("实际手续费") : tr("实际支付")}：
                <Money value={net || '0'} currency={currency} />
              </p>
              <Button
                onClick={() => form.setFieldValue('promotion', undefined)}
              >
                {tr("清除优惠信息")}</Button>
            </>
          ),
        },
      ]}
    />
  );
}
