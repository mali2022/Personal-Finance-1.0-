import type { ReactNode } from 'react';
import { Button } from 'antd';
import {
  BarChartOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Money } from '../../components/Money';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import {
  useDashboardSummary,
  usePendingSummary,
  usePlanningSummary,
} from '../overview';
import {
  formatMonthLabel,
  greetingFor,
  isCurrentMonth,
  shanghaiDateLabel,
  shanghaiHour,
} from './format';

/**
 * One honest sentence about the current position: surplus for the selected
 * period, budget left for the current month and how many entries still need a
 * confirmation. Every figure comes from the same query keys the cards below
 * use, so this line never issues a second request.
 */
function StatusLine({ month }: { month: string }) {
  const language = useLocale();
  const summary = useDashboardSummary(month);
  const planning = usePlanningSummary();
  const pending = usePendingSummary();

  if (summary.isPending)
    return (
      <p className="home-status" data-testid="home-status">
        <span className="home-status-dot" aria-hidden="true" />
        {t('正在汇总你的财务状态…')}
      </p>
    );
  if (summary.isError)
    return (
      <p className="home-status is-muted" data-testid="home-status">
        <span className="home-status-dot" aria-hidden="true" />
        {t('本月数据暂时不可用，其他模块仍可独立使用。')}
      </p>
    );

  const data = summary.data;
  const currency = data.currency || 'CNY';
  const current = isCurrentMonth(month);
  const remaining = planning.data?.budgetRemaining;
  const counts = pending.data;

  let activity: ReactNode = null;
  if (counts) {
    if (counts.pending > 0)
      activity = (
        <>
          {t('，')}
          <strong className="home-status-count">{counts.pending}</strong>
          {t(' 笔交易待确认')}
        </>
      );
    else if (counts.anomalies > 0)
      activity = (
        <>
          {t('，')}
          <strong className="home-status-count">{counts.anomalies}</strong>
          {t(' 笔异常待核对')}
        </>
      );
    else if (counts.uncategorized > 0)
      activity = (
        <>
          {t('，')}
          <strong className="home-status-count">{counts.uncategorized}</strong>
          {t(' 笔未分类')}
        </>
      );
    else activity = <>{t('，暂无待处理事项')}</>;
  }

  return (
    <p className="home-status" data-testid="home-status">
      <span className="home-status-dot" aria-hidden="true" />
      <span>
        {current
          ? t('本月结余')
          : t('{0}结余', formatMonthLabel(month, language))}{' '}
        <Money value={data.surplus} currency={currency} />
        {remaining != null ? (
          <>
            {t('，可用预算 ')}
            <Money value={remaining} currency={currency} />
          </>
        ) : null}
        {activity}
        {t('。')}
      </span>
    </p>
  );
}

/**
 * Welcome header: local (Asia/Shanghai) greeting, date, derived status line and
 * the global shortcuts. The greeting carries the page's single h1.
 */
export function HomeWelcome({ month }: { month: string }) {
  const language = useLocale();
  const navigate = useNavigate();
  const openEntry = useUI((state) => state.openEntry);
  const greeting = t(greetingFor(shanghaiHour()));
  const dateLabel = shanghaiDateLabel(language);

  const action = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    primary = false,
    className?: string,
  ) => (
    <Button
      size="large"
      type={primary ? 'primary' : 'default'}
      icon={icon}
      className={className}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <header className="home-welcome">
      <div className="home-welcome-main">
        <div className="home-welcome-meta">
          <span className="home-welcome-date">{dateLabel}</span>
        </div>
        <h1 className="pf-title home-welcome-title">{greeting}</h1>
        <StatusLine month={month} />
      </div>
      <div
        className="home-welcome-actions"
        role="group"
        aria-label={t('全局快捷操作')}
      >
        {action(
          t('记一笔'),
          <PlusOutlined aria-hidden="true" />,
          () => openEntry('Expense'),
          true,
        )}
        {action(
          t('全部交易'),
          <UnorderedListOutlined aria-hidden="true" />,
          () => navigate('/transactions'),
          false,
          'home-welcome-all',
        )}
        {action(
          t('分析工作台'),
          <BarChartOutlined aria-hidden="true" />,
          () => navigate('/dashboard'),
        )}
      </div>
    </header>
  );
}
