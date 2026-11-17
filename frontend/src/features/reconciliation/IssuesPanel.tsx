import { useState } from 'react';
import { Button, Form, Input, Table, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { smartApi } from './api';
export function IssuesPanel({
  accountId,
  currency,
  review,
}: {
  accountId: string;
  currency: string;
  review: (id: string) => void;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [period, setPeriod] = useState<{ startsAt: string; endsAt: string }>();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['smart-reconciliation', 'issues', accountId, period, page],
    queryFn: () =>
      smartApi.issues(accountId, period!.startsAt, period!.endsAt, page),
    enabled: !!period,
  });
  const labels: Record<string, string> = {
    AccountMismatch: t(
      '相同参考号出现在其他账户',
      'Same reference on another account',
    ),
    AmountMismatch: t(
      '可能候选金额不一致（显示带符号差额）',
      'Possible candidate amount differs (signed difference)',
    ),
    DateMismatch: t(
      '可能候选交易日相差超过3天',
      'Possible candidate transaction dates differ by over 3 days',
    ),
    DirectionMismatch: t(
      '可能候选资金方向相反',
      'Possible candidate has opposite account flow',
    ),
    MerchantMismatch: t(
      '相同参考号的商户不一致',
      'Same reference with different merchant',
    ),
    CurrencyMismatch: t(
      '可能候选账户币种不一致',
      'Possible candidate account currency differs',
    ),
    TypeNeedsReview: t(
      '来源类型与账务业务类型需复核',
      'Source and ledger business types need review',
    ),
    CounterpartyMismatch: t(
      '已知对方账号不一致',
      'Known counterparty account differs',
    ),
    PaymentSourceUnverified: t(
      '付款来源需人工核实',
      'Payment source needs verification',
    ),
    NoConfirmedLedgerLink: t(
      '来源流水尚无已确认内部交易',
      'Statement has no confirmed ledger link',
    ),
    PartialAmount: t('存在未分配金额', 'Unallocated amount'),
    SuspectedDuplicate: t('疑似重复', 'Suspected duplicate'),
    ModifiedMatchedTransaction: t(
      '已匹配交易被修改或删除',
      'Matched transaction modified or deleted',
    ),
    RefundOriginMissing: t('退款缺少原交易', 'Refund origin missing'),
    TransferOtherEndMissing: t(
      '转账或还款只核对到一端',
      'Only one transfer or payment end confirmed',
    ),
  };
  return (
    <>
      <Form
        name="reconciliationIssues"
        layout="vertical"
        style={{ marginTop: 8 }}
        onFinish={(v) => {
          setPeriod(v as { startsAt: string; endsAt: string });
          setPage(1);
        }}
      >
        <Form.Item
          name="startsAt"
          label={t('异常期间开始', 'Issue period start')}
          rules={[{ required: true }]}
        >
          <Input placeholder="2026-10-01T00:00:00+08:00" />
        </Form.Item>
        <Form.Item
          name="endsAt"
          label={t('异常期间结束', 'Issue period end')}
          rules={[{ required: true }]}
        >
          <Input placeholder="2026-10-31T23:59:59+08:00" />
        </Form.Item>
        <Button htmlType="submit">{t('查询差异', 'Find discrepancies')}</Button>
      </Form>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          <Table
            rowKey={(r) => r.statementId + r.type + (r.transactionId || '')}
            loading={q.isFetching}
            dataSource={q.data?.issues}
            pagination={false}
            scroll={{ x: 650 }}
            columns={[
              {
                title: t('异常', 'Issue'),
                render: (_, r) => labels[r.type] || r.type,
              },
              {
                title: t('金额', 'Amount'),
                render: (_, r) => (
                  <Money value={r.amount} currency={currency} />
                ),
              },
              {
                title: t('处理', 'Review'),
                render: (_, r) => (
                  <Button onClick={() => review(r.statementId)}>
                    {t('复核与解释', 'Review & explanation')}
                  </Button>
                ),
              },
            ]}
          />
          <Table
            rowKey="transactionId"
            dataSource={q.data?.ledgerOnly}
            pagination={false}
            scroll={{ x: 500 }}
            columns={[
              {
                title: t(
                  '内部交易暂无已确认流水',
                  'Ledger transaction without confirmed statement',
                ),
                render: (_, r) => (
                  <Link to={`/transactions/${r.transactionId}`}>
                    {r.type} · {r.occurredAt}
                  </Link>
                ),
              },
            ]}
          />
          <Space>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t('上一页', 'Previous')}
            </Button>
            <span>{page}</span>
            <Button
              disabled={
                !q.data ||
                (page * 20 >= q.data.total && q.data.ledgerOnly.length < 20)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              {t('下一页', 'Next')}
            </Button>
          </Space>
        </>
      )}
    </>
  );
}
