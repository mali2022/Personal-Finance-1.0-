import { t as tr, useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { EmptyState } from '../../components/Feedback';
import { Card, Button } from 'antd';
import {
  ArrowRightOutlined,
  BankOutlined,
  CreditCardOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Money } from '../../components/Money';
import { accountLabels } from '../../constants/mappings';
import { decimal, minor } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import type { Account } from '../../types';

export function AccountBalanceCards({ accounts }: { accounts: Account[] }) {
  useLocale();
  const navigate = useNavigate();
  const openEntry = useUI((s) => s.openEntry);
  const hidden = useUI((s) => s.hidden);
  const visible = accounts.filter((account) => account.status !== 'Archived');
  return (
    <Card
      className="dashboard-panel dashboard-accounts-panel"
      title={
        <div className="dashboard-panel-heading">
          <strong>{tr('我的账户')}</strong>
        </div>
      }
      extra={
        <Button type="link" onClick={() => navigate('/accounts')}>
          {tr('全部')}
          <ArrowRightOutlined />
        </Button>
      }
    >
      {visible.length === 0 ? (
        <EmptyState description={tr('添加账户，开启清晰的财务记录')} />
      ) : (
        <div className="dashboard-account-list">
          {visible.slice(0, 5).map((account) => {
            const credit = ['CreditCard', 'ConsumerCredit'].includes(
              account.type,
            );
            const balance = minor(account.balance);
            return (
              <button
                className="dashboard-account-row"
                key={account.id}
                onClick={() => navigate(`/accounts/${account.id}`)}
              >
                <span
                  className={`dashboard-account-icon ${credit ? 'is-credit' : account.type === 'Bank' ? 'is-bank' : ''}`}
                >
                  {credit ? (
                    <CreditCardOutlined />
                  ) : account.type === 'Bank' ? (
                    <BankOutlined />
                  ) : (
                    <WalletOutlined />
                  )}
                </span>
                <span className="dashboard-account-info">
                  <strong>
                    <Sensitive>{account.name}</Sensitive>
                  </strong>
                  <small>
                    {accountLabels[account.type]}
                    <span>·</span>
                    {account.currency}
                  </small>
                </span>
                <span className="dashboard-account-balance">
                  <Money
                    value={
                      credit
                        ? decimal(balance < 0n ? -balance : balance)
                        : account.balance
                    }
                    currency={account.currency}
                  />
                  {credit && (
                    <small>
                      {hidden
                        ? '••••'
                        : balance > 0n
                          ? tr('溢缴款 ')
                          : tr('欠款 ')}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Button
        block
        icon={<SwapOutlined />}
        className="dashboard-transfer-button"
        onClick={() => openEntry('Transfer')}
      >
        {tr('账户间转账')}
      </Button>
    </Card>
  );
}
