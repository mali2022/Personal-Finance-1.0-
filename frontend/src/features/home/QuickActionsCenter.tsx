import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  AuditOutlined,
  ExperimentOutlined,
  FormOutlined,
  PlusOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AppleCard } from '../../components/apple';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';

interface EntryAction {
  key: string;
  title: string;
  icon: ReactNode;
  tone?: 'positive' | 'negative' | 'info' | 'warning';
  run: () => void;
}

/**
 * The action centre: four ledger entries that open the shared right-side
 * quick-entry drawer, then every genuinely existing decision surface. Every
 * item is a native button or link, so the whole grid is keyboard operable.
 */
export function QuickActionsCenter() {
  useLocale();
  const openEntry = useUI((state) => state.openEntry);

  const entries: EntryAction[] = [
    {
      key: 'entry',
      title: t('记一笔'),
      icon: <PlusOutlined aria-hidden="true" />,
      run: () => openEntry('Expense'),
    },
    {
      key: 'income',
      title: t('收入'),
      icon: <ArrowDownOutlined aria-hidden="true" />,
      tone: 'positive',
      run: () => openEntry('Income'),
    },
    {
      key: 'expense',
      title: t('支出'),
      icon: <ArrowUpOutlined aria-hidden="true" />,
      tone: 'negative',
      run: () => openEntry('Expense'),
    },
    {
      key: 'transfer',
      title: t('转账'),
      icon: <SwapOutlined aria-hidden="true" />,
      tone: 'info',
      run: () => openEntry('Transfer'),
    },
  ];

  const destinations = [
    {
      key: 'reconciliation',
      to: '/reconciliation',
      title: t('智能自动对账'),
      icon: <AuditOutlined aria-hidden="true" />,
      tone: 'info' as const,
    },
    {
      key: 'approvals',
      to: '/spending-approvals',
      title: t('AI 消费审批'),
      icon: <SafetyCertificateOutlined aria-hidden="true" />,
      tone: 'warning' as const,
    },
    {
      key: 'spending-value',
      to: '/planning/spending-value',
      title: t('消费价值分析'),
      icon: <ExperimentOutlined aria-hidden="true" />,
      tone: 'positive' as const,
    },
    {
      key: 'life-simulator',
      to: '/planning/life-simulator',
      title: t('人生财务模拟'),
      icon: <RocketOutlined aria-hidden="true" />,
      tone: 'info' as const,
    },
    {
      key: 'bookkeeping',
      to: '/bookkeeping/new',
      title: t('独立记账中心'),
      icon: <FormOutlined aria-hidden="true" />,
    },
  ];

  return (
    <div className="pf-col-12 home-module" data-testid="home-quick-actions">
      <AppleCard
        title={
          <>
            <ThunderboltOutlined aria-hidden="true" />
            {t('快捷操作中心')}
          </>
        }
      >
        <div
          className="pf-quick-grid home-quick-grid"
          role="group"
          aria-label={t('快捷操作')}
        >
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="pf-quick"
              onClick={entry.run}
            >
              <span
                className={`pf-quick-icon${
                  entry.tone ? ` is-${entry.tone}` : ''
                }`}
              >
                {entry.icon}
              </span>
              <span className="pf-quick-text">
                <strong>{entry.title}</strong>
              </span>
            </button>
          ))}
          {destinations.map((destination) => (
            <Link key={destination.key} className="pf-quick" to={destination.to}>
              <span
                className={`pf-quick-icon${
                  destination.tone ? ` is-${destination.tone}` : ''
                }`}
              >
                {destination.icon}
              </span>
              <span className="pf-quick-text">
                <strong>{destination.title}</strong>
              </span>
            </Link>
          ))}
        </div>
      </AppleCard>
    </div>
  );
}
