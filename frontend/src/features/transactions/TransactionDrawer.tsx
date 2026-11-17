import { TransactionIntegrityPanel } from './TransactionIntegrityPanel';
import { useMobile } from '../../hooks/useMobile';
import { TransactionBalances } from './TransactionBalances';
import { t as tr, useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { AttachmentsPanel } from '../attachments/AttachmentsPanel';
import { TransactionHistory } from './TransactionHistory';
import { Link } from 'react-router-dom';
import { App, Button, Descriptions, Drawer, Skeleton, Space, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { accountApi, categoryApi, transactionApi } from '../../api/finance';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { transactionDisplayLabel } from '../../constants/mappings';
import { minor, formatDate } from '../../utils/finance';
import { QuickEntry } from './QuickEntry';
import { promotionTypes } from './PromotionFields';
import { promotionsApi } from '../../api/promotions';
import type { ApiError, Transaction } from '../../types';
export function TransactionDrawer({
  id,
  onClose,
}: {
  id?: string;
  onClose: () => void;
}) {
  useLocale();
  const mobile = useMobile();
  const { modal, message } = App.useApp();
  const cache = useQueryClient();
  const [refundFrom, setRefundFrom] = useState<Transaction>();
  const [editing, setEditing] = useState<Transaction>();
  const q = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => transactionApi.detail(id!),
    enabled: !!id,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const promotionInfo = useQuery({
    queryKey: ['transactionPromotions', id],
    queryFn: () => promotionsApi.transaction(id!),
    enabled: !!id,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const mutate = useMutation({
    mutationFn: (restore: boolean) =>
      restore
        ? transactionApi.restore(id!, q.data!.version)
        : transactionApi.remove(id!, q.data!.version),
    onSuccess: () => {
      void Promise.all(
        [
          'transactions',
          'concert',
          'concerts',
          'concert-annual',
          'concert-transactions',
          'transactionPromotions',
          'accounts',
          'dashboard',
          'budgets',
          'reports',
          'directory',
          'recurringOccurrences',
          'planningSummary',
          'calendarEvents',
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      message.success(tr('操作成功'));
      onClose();
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const t = q.data;
  return (
    <>
      <Drawer
        title={tr('交易详情')}
        width={mobile ? '100vw' : 'min(600px, 100vw)'}
        open={!!id}
        onClose={onClose}
      >
        {q.isPending ? (
          <Skeleton active />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          t && (
            <>
              <Tag>{transactionDisplayLabel(t)}</Tag>
              <div className="detail-amount">
                <Money
                  value={t.amount}
                  currency={t.currency}
                  type={t.type}
                  adjustmentDirection={t.adjustmentDirection}
                />
              </div>
              <TransactionBalances transaction={t} />
              <h3>{tr('基本信息与资金明细')}</h3>
              <Descriptions
                column={1}
                items={[
                  ...(t.promotion
                    ? [
                        {
                          key: 'originalPrice',
                          label:
                            t.type === 'Expense'
                              ? tr('优惠前金额')
                              : tr('原手续费'),
                          children: (
                            <Money
                              value={t.promotion.originalAmount}
                              currency={t.currency}
                            />
                          ),
                        },
                        ...t.promotion.lines.map((line, i) => ({
                          key: `promotion-${i}`,
                          label:
                            promotionTypes.find(
                              ([value]) => value === line.type,
                            )?.[1] || tr('手续费减免'),
                          children: (
                            <>
                              <Money
                                value={line.amount}
                                currency={t.currency}
                              />{' '}
                              <Sensitive>
                                {line.source} {line.activity}
                              </Sensitive>
                            </>
                          ),
                        })),
                      ]
                    : []),
                  {
                    key: 'project',
                    label: tr('项目'),
                    children: <Sensitive>{t.projectName || '—'}</Sensitive>,
                  },
                  {
                    key: 'tags',
                    label: tr('标签'),
                    children: (
                      <Sensitive>
                        {t.tagNames?.filter(Boolean).join('、') || '—'}
                      </Sensitive>
                    ),
                  },
                  {
                    key: 'received',
                    label: tr('转入金额'),
                    children: t.toAccountId ? (
                      <Money
                        value={t.receivedAmount || t.amount}
                        currency={
                          accounts.data?.find((a) => a.id === t.toAccountId)
                            ?.currency || t.currency
                        }
                      />
                    ) : (
                      '—'
                    ),
                  },
                  {
                    key: 'rate',
                    label: tr('汇率'),
                    children: <Sensitive>{t.exchangeRate || '—'}</Sensitive>,
                  },
                  {
                    key: 'fee',
                    label: tr('手续费'),
                    children: <Money value={t.fee} currency={t.currency} />,
                  },
                  {
                    key: 'date',
                    label: tr('时间'),
                    children: formatDate(t.occurredAt, true, true),
                  },
                  {
                    key: 'account',
                    label: tr('账户'),
                    children: (
                      <Sensitive>
                        {accounts.data?.find((a) => a.id === t.accountId)?.name}
                      </Sensitive>
                    ),
                  },
                  {
                    key: 'to',
                    label: tr('转入账户'),
                    children: (
                      <Sensitive>
                        {accounts.data?.find((a) => a.id === t.toAccountId)
                          ?.name || '—'}
                      </Sensitive>
                    ),
                  },
                  {
                    key: 'category',
                    label: tr('分类'),
                    children:
                      categories.data?.find((c) => c.id === t.categoryId)
                        ?.name || '—',
                  },
                  {
                    key: 'merchant',
                    label: tr('商户 / 对象'),
                    children: <Sensitive>{t.merchant || '—'}</Sensitive>,
                  },
                  ...(t.type === 'Expense'
                    ? [
                        {
                          key: 'productName',
                          label: tr('商品名'),
                          children: (
                            <Sensitive>{t.productName || '—'}</Sensitive>
                          ),
                        },
                      ]
                    : []),
                  {
                    key: 'note',
                    label: tr('备注'),
                    children: <Sensitive>{t.note || '—'}</Sensitive>,
                  },
                  {
                    key: 'refund',
                    label: tr('净退款 / 价格返现'),
                    children: (
                      <Money value={t.refundedAmount} currency={t.currency} />
                    ),
                  },
                  {
                    key: 'created',
                    label: tr('创建时间'),
                    children: formatDate(t.createdAt, true),
                  },
                  {
                    key: 'updated',
                    label: tr('更新时间'),
                    children: formatDate(t.updatedAt, true),
                  },
                ]}
              />
              {t.splits.length > 0 && (
                <>
                  <h3>{tr('拆分明细')}</h3>
                  {t.splits.map((s, i) => (
                    <p key={i}>
                      {
                        categories.data?.find((c) => c.id === s.categoryId)
                          ?.name
                      }{' '}
                      <Money value={s.amount} currency={t.currency} />
                    </p>
                  ))}
                </>
              )}
              {t.relatedTransactions.length > 0 && (
                <>
                  <h3>{tr('关联交易')}</h3>
                  {t.relatedTransactions.map((r) => (
                    <p key={r.id}>
                      {transactionDisplayLabel(r)} ·{' '}
                      <Sensitive>{r.merchant}</Sensitive>{' '}
                      <Money value={r.amount} currency={r.currency} />
                    </p>
                  ))}
                </>
              )}
              {t.type === 'Adjustment' && (
                <p>
                  <Link
                    to={`/reconciliation?accountId=${t.accountId}`}
                    onClick={onClose}
                  >
                    {tr('查看账户对账历史')}
                  </Link>
                </p>
              )}
              {t.businessId && (
                <p>
                  <Link
                    to={`/${t.type.startsWith('Loan') ? 'loans' : 'reimbursements'}?id=${t.businessId}&direction=${['LoanReceived', 'LoanRepaymentPaid'].includes(t.type) ? 'Borrowed' : 'Lent'}`}
                    onClick={onClose}
                  >
                    {tr('打开关联业务，管理归还、撤销与恢复')}
                  </Link>
                </p>
              )}
              {!!promotionInfo.data?.cashbacks.length && (
                <>
                  <h3>{tr('关联返现')}</h3>
                  {promotionInfo.data.cashbacks.map((b) => (
                    <p key={b.id}>
                      <Sensitive>{b.source}</Sensitive> ·{' '}
                      {b.treatment === 'PriceAdjustment'
                        ? tr('价格调整')
                        : tr('独立奖励')}{' '}
                      ·{' '}
                      {
                        (
                          {
                            Pending: '待到账',
                            Settled: '已到账',
                            PartiallyRecovered: '部分追回',
                            Recovered: '已追回',
                            Expired: '已失效',
                            Revoked: '已撤销',
                          } as Record<string, string>
                        )[b.state]
                      }{' '}
                      <Money value={b.amount} currency={b.currency} />
                      {tr('；已实际追回')}{' '}
                      <Money value={b.recoveredAmount} currency={b.currency} />{' '}
                      <Link to="/benefits?tab=cashback" onClick={onClose}>
                        {tr('查看返现管理')}
                      </Link>
                    </p>
                  ))}
                </>
              )}
              {!!promotionInfo.data?.usages.length && (
                <>
                  <h3>{tr('优惠券使用与退款处理')}</h3>
                  {promotionInfo.data.usages.map((u) => (
                    <p key={u.id}>
                      <Money value={u.amount} currency={t.currency} /> ·{' '}
                      {(
                        {
                          Used: '已使用；未确认返还',
                          Returned: '退款已确认返还权益',
                          ReturnRevoked: '退款返还已撤销',
                          Revoked: '原使用已撤销',
                          UsageRevokedReturn: '原使用已撤销',
                        } as Record<string, string>
                      )[u.state] || u.state}{' '}
                      {u.refundTransactionId && (
                        <Link
                          to={`/transactions/${u.refundTransactionId}`}
                          onClick={onClose}
                        >
                          {tr('关联退款')}
                        </Link>
                      )}
                    </p>
                  ))}
                  <Link to="/benefits" onClick={onClose}>
                    {tr('查看优惠券档案与历史')}
                  </Link>
                </>
              )}
              <TransactionIntegrityPanel key={`integrity:${t.id}`} transaction={t} onClose={onClose}/>
              <TransactionHistory key={`history:${t.id}`} id={t.id} currency={t.currency} />
              <AttachmentsPanel
                transactionId={t.id}
                readOnly={t.status === 'Deleted'}
              />
              <Space wrap className="mt24">
                {t.status !== 'Deleted' && t.type === 'Expense' && !t.businessId && minor(t.amount) > minor(t.refundedAmount) && (
                  <Button disabled={q.isFetching} onClick={() => setRefundFrom(t)}>{tr('添加退款')}</Button>
                )}
                {t.status === 'Deleted' ? (
                  <Button
                    disabled={q.isFetching || !!t.businessId}
                    loading={mutate.isPending}
                    onClick={() => mutate.mutate(true)}
                  >
                    {tr('恢复交易')}
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={
                        q.isFetching ||
                        !!t.businessId ||
                        ![
                          'Expense',
                          'Income',
                          'Transfer',
                          'Refund',
                          'CreditCardPayment',
                          'AssetLoss',
                        ].includes(t.type)
                      }
                      onClick={() => setEditing(t)}
                    >
                      {tr('编辑')}
                    </Button>
                    <Button
                      disabled={
                        q.isFetching ||
                        ![
                          'Expense',
                          'Income',
                          'Transfer',
                          'Refund',
                          'CreditCardPayment',
                          'AssetLoss',
                        ].includes(t.type)
                      }
                      danger
                      loading={mutate.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: tr('删除这笔交易？'),
                          content: ['Expense', 'Income'].includes(t.type)
                            ? tr(
                                '删除后将影响账户余额和统计结果，可在回收站恢复。',
                              )
                            : tr(
                                '该操作会同时影响多个账户或关联记录，可在回收站恢复。',
                              ),
                          okText: tr('确认删除'),
                          cancelText: tr('取消'),
                          okButtonProps: { danger: true },
                          onOk: () => mutate.mutateAsync(false),
                        })
                      }
                    >
                      {tr('删除')}
                    </Button>
                  </>
                )}
              </Space>
            </>
          )
        )}
      </Drawer>
      {refundFrom && <QuickEntry refundFrom={refundFrom} onDone={() => setRefundFrom(undefined)} />}
      {editing && (
        <QuickEntry editing={editing} onDone={() => setEditing(undefined)} />
      )}
    </>
  );
}
