import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { AppleCard } from '../../components/apple';
import { FinancialInsights } from '../dashboard/FinancialInsights';
import { aiApi } from '../../api/ai';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { formatMonthLabel, isCurrentMonth } from './format';

/**
 * Apple surface around the existing, real FinancialInsights panel. The model
 * itself decides what to generate; this wrapper only reports the analysis
 * period, the authorised data basis and the honest generation status derived
 * from `/ai/settings` (same query key as FinancialInsights, so no duplicate
 * request).
 */
export function AiInsightsSection({ month }: { month: string }) {
  const language = useLocale();
  const hidden = useUI((state) => state.hidden);
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
    staleTime: 60_000,
  });
  const config = settings.data;
  const configured = Boolean(
    config?.enabled &&
      config.configured &&
      config.privacy?.enabled &&
      config.privacy?.allowSummary,
  );
  const current = isCurrentMonth(month);
  const period = current
    ? t('{0}（当月进行中，与上月同期对比）', formatMonthLabel(month, language))
    : t('{0}（历史月份）', formatMonthLabel(month, language));

  let status: string;
  let tone: string;
  if (settings.isPending) {
    status = t('正在检查 AI 配置…');
    tone = 'is-info';
  } else if (settings.isError) {
    status = t('无法确认 AI 配置');
    tone = 'is-warning';
  } else if (!configured) {
    status = t('未配置或未授权，不会生成');
    tone = 'is-warning';
  } else if (hidden) {
    status = t('隐私模式已暂停生成');
    tone = 'is-info';
  } else {
    status = t('已启用，实时生成');
    tone = 'is-positive';
  }

  return (
    <div className="pf-col-7 home-module home-ai" data-testid="home-ai-insights">
      <AppleCard
        title={
          <>
            <RobotOutlined aria-hidden="true" />
            {t('AI 财务洞察')}
          </>
        }
        footer={
          <span>
            {t(
              'AI 结论仅供辅助决策，请结合下方工具依据核对；数据不足时会明确说明。',
            )}
          </span>
        }
      >
        <div className="home-ai-meta">
          <span className="home-ai-chip">
            <CalendarOutlined aria-hidden="true" />
            <b>{t('分析期间')}</b>
            <span>{period}</span>
          </span>
          <span className="home-ai-chip">
            <DatabaseOutlined aria-hidden="true" />
            <b>{t('数据依据')}</b>
            <span>{t('已授权账本工具与交易明细')}</span>
          </span>
          <span className={`pf-pill ${tone} home-ai-status`}>
            <b>{t('生成状态')}</b>
            {status}
          </span>
        </div>
        <div className="home-ai-inner">
          <FinancialInsights month={month} />
        </div>
        <div className="home-ai-links">
          <Link className="pf-link" to="/ai-center">
            {t('打开 AI 智能中心')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
          <Link className="pf-link" to="/settings/ai">
            {t('AI 与隐私设置')}
          </Link>
        </div>
      </AppleCard>
    </div>
  );
}
