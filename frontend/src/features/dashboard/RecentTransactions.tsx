import { t as tr, useLocale } from '../../i18n';
import { Card, Button } from 'antd';
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { accountApi, categoryApi } from '../../api/finance';
import { EmptyState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { Money } from '../../components/Money';
import { transactionDisplayLabel } from '../../constants/mappings';
import { formatDate } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import type { Transaction } from '../../types';

export function RecentTransactions({
  items,
  onDetail,
}: {
  items: Transaction[];
  onDetail: (transaction: Transaction) => void;
}) {
  useLocale();
  const navigate = useNavigate();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  return (
    <Card
      title={
        <div className="dashboard-panel-heading">
          <strong>{tr('最近交易')}</strong>
        </div>
      }
      className="dashboard-panel dashboard-recent-panel"
      extra={
        <Button type="link" onClick={() => navigate('/transactions')}>
          {tr('查看全部')}
          <ArrowRightOutlined />
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          description={tr('还没有交易，记下生活的第一笔')}
          action={() => useUI.getState().openEntry('Expense')}
        />
      ) : (
        <>
          <div className="dashboard-recent-labels" aria-hidden="true">
            <span>{tr('交易记录')}</span>
            <span>{tr('日期')}</span>
            <span>{tr('金额')}</span>
          </div>
          <div className="dashboard-recent-list">
            {items.slice(0, 6).map((transaction) => {
              const category = transaction.splits.length
                ? tr('多分类拆分')
                : categories.data?.find(
                    (item) => item.id === transaction.categoryId,
                  )?.name || tr('未分类');
              const account =
                accounts.data?.find((item) => item.id === transaction.accountId)
                  ?.name || tr('账户');
              const toAccount = transaction.toAccountId
                ? accounts.data?.find(
                    (item) => item.id === transaction.toAccountId,
                  )?.name
                : undefined;
              const income =
                ['Income', 'Refund'].includes(transaction.type) ||
                (transaction.type === 'Adjustment' &&
                  transaction.adjustmentDirection === 'Increase');
              const expense =
                ['Expense', 'RewardReversal', 'AssetLoss'].includes(
                  transaction.type,
                ) ||
                (transaction.type === 'Adjustment' &&
                  transaction.adjustmentDirection === 'Decrease');
              return (
                <button
                  key={transaction.id}
                  className="dashboard-recent-row"
                  onClick={() => onDetail(transaction)}
                >
                  <span
                    className={`dashboard-transaction-icon ${income ? 'is-income' : expense ? 'is-expense' : 'is-transfer'}`}
                  >
                    {income ? (
                      <ArrowDownOutlined />
                    ) : expense ? (
                      <ArrowUpOutlined />
                    ) : (
                      <SwapOutlined />
                    )}
                  </span>
                  <span className="dashboard-transaction-context">
                    <strong>
                      <Sensitive>
                        {transaction.merchant || transaction.note || category}
                      </Sensitive>
                      {transaction.status === 'NeedsReview' ||
                      transaction.categoryId === 'unknown' ? (
                        <span
                          className="dashboard-review-dot"
                          title={tr('待确认')}
                        />
                      ) : null}
                    </strong>
                    <small>
                      <span>{transactionDisplayLabel(transaction)}</span>
                      <i>·</i>
                      <span>{category}</span>
                      <i>·</i>
                      <Sensitive>
                        {toAccount ? `${account} → ${toAccount}` : account}
                      </Sensitive>
                    </small>
                    <time
                      className="dashboard-mobile-date"
                      dateTime={transaction.occurredAt}
                    >
                      {formatDate(transaction.occurredAt)}
                    </time>
                  </span>
                  <time
                    className="dashboard-transaction-date"
                    dateTime={transaction.occurredAt}
                  >
                    {formatDate(transaction.occurredAt)}
                  </time>
                  <span className="dashboard-transaction-amount">
                    <Money
                      value={transaction.amount}
                      currency={transaction.currency}
                      type={transaction.type}
                      adjustmentDirection={transaction.adjustmentDirection}
                    />
                    <ArrowRightOutlined className="dashboard-transaction-arrow" />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
