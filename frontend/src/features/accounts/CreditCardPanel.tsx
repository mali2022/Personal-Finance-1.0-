import { DatePicker } from '../../components/ResponsiveDatePicker';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Button, Card, Descriptions, Skeleton, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { accountApi } from '../../api/finance';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
import { DebtPlanningPanel } from '../planning/DebtPlanningPanel';
export function CreditCardPanel({ id, title = '信用卡账单' }: { id: string; title?:string }) {
  useLocale();
  const [month, setMonth] = useState<string>();
  const q = useQuery({
    queryKey: ['accounts', 'credit-card', id, month],
    queryFn: () => accountApi.statement(id, month),
  });
  return (
    <Card
      className="mt20"
      title={title}
      extra={
        <DatePicker
          picker="month"
          placeholder={tr("最近已出账单")}
          value={month ? dayjs(month + '-01') : null}
          disabledDate={(d) => d.isAfter(dayjs(), 'month')}
          onChange={(d) => setMonth(d?.format('YYYY-MM'))}
        />
      }
    >
      {q.isPending ? (
        <Skeleton active />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <p className="muted">
            {tr("账期")}{q.data.cycleStart} {tr("至")}{q.data.statementDate} {tr("· 还款日期")}{' '}
            {q.data.dueDate}
          </p>
          <Descriptions
            column={{ xs: 1, sm: 2, md: 3 }}
            items={[
              {
                key: 'purchases',
                label: tr("本期消费"),
                children: (
                  <Money value={q.data.purchases} currency={q.data.currency} />
                ),
              },
              {
                key: 'refund',
                label: tr("本期退款"),
                children: (
                  <Money value={q.data.refunds} currency={q.data.currency} />
                ),
              },
              {
                key: 'bill',
                label: tr("账单金额"),
                children: (
                  <Money
                    value={q.data.statementAmount}
                    currency={q.data.currency}
                  />
                ),
              },
              {
                key: 'paid',
                label: tr("账后已还款"),
                children: (
                  <Money value={q.data.repaid} currency={q.data.currency} />
                ),
              },
              {
                key: 'remaining',
                label: tr("待还款"),
                children: (
                  <Money value={q.data.remaining} currency={q.data.currency} />
                ),
              },
              {
                key: 'postStatementCredits',
                label: tr("账后退款及其他冲减"),
                children: (
                  <Money
                    value={q.data.postStatementCredits || '0.00'}
                    currency={q.data.currency}
                  />
                ),
              },
              {
                key: 'unbilled',
                label: tr("未出账消费净额"),
                children: (
                  <Money value={q.data.unbilled} currency={q.data.currency} />
                ),
              },
            ]}
          />
          <Space className="mt16">
            <Button
              type="primary"
              onClick={() => {
                useUI.getState().openEntry('CreditCardPayment');
                useUI.getState().setEntryAccount(id);
              }}
            >
              {tr("去还款")}</Button>
            <Button
              onClick={() => {
                useUI.getState().openEntry('Expense');
                useUI.getState().setEntryAccount(id);
              }}
            >
              {tr("信用卡消费")}</Button>
            <Button onClick={() => useUI.getState().openEntry('Refund')}>
              {tr("消费退款")}</Button>
          </Space>
          <DebtPlanningPanel key={id} kind="CreditInstallment" accountId={id} currency={q.data.currency} />
        </>
      )}
    </Card>
  );
}
