import { Button, Card, Alert, Skeleton, Space } from 'antd';
import { RobotOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { aiApi } from '../../api/ai';
import { AiAnalysisView } from '../../components/ai/AiAnalysisView';
import { ErrorState } from '../../components/Feedback';
import { useCopilot } from '../ai/copilotContext';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';

export function insightQuestion(month: string, language: string) {
  const end = dayjs(month).endOf('month').format('YYYY-MM-DD');
  const previous = dayjs(month).subtract(1, 'month').format('YYYY-MM');
  return language === 'en'
    ? `Generate concise financial insights for ${month}-01 through ${end}, CNY, compared with ${previous}. If the selected month is incomplete, compare the same elapsed days. Use authorized ledger tools to assess: unusual spending, categories contributing to expense growth, large purchases, and potential savings. Query current and comparable previous periods and transactions when authorized. Cite tool evidence for each finding. Separate observed contributions from possible causes. A large purchase is not automatically abnormal. State sample limits, truncation, missing authorization or history. Do not invent saving amounts, treat transfers as spending, or add currencies. Present four short numbered paragraphs, at most 250 words. If no evidence exists state insufficient data.`
    : `请生成${month}-01至${end}的人民币财务洞察，与${previous}对比；当月未结束时只比较相同已过天数。通过已授权账本工具自动检查四项：消费异常、支出增长的分类贡献、高额消费、潜在节省空间。查询本期及可比上期汇总；有明细授权时查询相关交易。每项标明工具依据。区分可验证的变化贡献与可能原因，高额消费不等于异常。样本、截断、授权或历史不足必须说明；不要编造节省金额，不把转账算作支出，不合并币种。用四个简短编号段落，合计不超过400字；无依据时明确数据不足。`;
}
export function FinancialInsights({ month }: { month: string }) {
  const language = useLocale();
  const hidden = useUI((s) => s.hidden);
  const openCopilot = useCopilot();
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const config = settings.data;
  const ready = !!(
    config?.enabled &&
    config.configured &&
    config.privacy.enabled &&
    config.privacy.allowSummary
  );
  const q = useQuery({
    queryKey: ['dashboard-ai-insights', month, language, config?.privacy],
    queryFn: ({ signal }) =>
      aiApi.chat(insightQuestion(month, language), undefined, signal, () => {}),
    enabled: ready && !hidden,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  return (
    <Card
      className="dashboard-panel dashboard-insights-panel"
      title={
        <div className="dashboard-panel-heading">
          <strong>
            <RobotOutlined /> {t('AI 财务洞察')}
          </strong>
          <span>{month}</span>
        </div>
      }
      extra={
        <Button
          type="text"
          icon={<ReloadOutlined />}
          aria-label={t('刷新财务洞察')}
          loading={q.isFetching}
          disabled={!ready || hidden}
          onClick={() => q.refetch()}
        />
      }
    >
      {hidden ? (
        <Alert message={t('隐私模式已隐藏财务洞察')} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} retry={() => settings.refetch()} />
      ) : settings.isPending ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : !ready ? (
        <div>
          <p>
            {t(
              '开启 AI 及收支汇总授权后，首页自动生成洞察；明细授权可用于核对高额消费。',
            )}
          </p>
          <Link to="/ai">{t('配置 AI 与数据授权')}</Link>
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.isPending ? (
        <Skeleton active title={false} paragraph={{ rows: 5 }} />
      ) : (
        <>
          <AiAnalysisView result={q.data} onFollowUp={(prompt) => openCopilot(prompt, q.data.conversationId)} />
          {!q.data.financialDataVerified && (
            <Alert
              type="warning"
              showIcon
              message={t('分析结论需结合下方依据核对')}
            />
          )}
          <div className="dashboard-insight-meta">
            DeepSeek · {t('生成时间')}{' '}
            {new Date(q.dataUpdatedAt).toLocaleString(language)} · CNY
          </div>
          {!q.data.sources.length && (
            <Alert
              type="info"
              message={t('本次没有可用账本依据，请勿将推测作为事实')}
            />
          )}
          <Button
            type="primary"
            ghost
            onClick={() =>
              openCopilot(
                insightQuestion(month, language) +
                  '\n' +
                  t('请继续核对以上四项，展开解释并给出可执行建议。'), q.data.conversationId,
              )
            }
          >
            {t('一键追问 AI Copilot')}
          </Button>
        </>
      )}
      <Space wrap className="dashboard-insight-topics">
        {['消费异常', '支出增长原因', '高额消费', '潜在节省空间'].map(
          (topic) => (
            <Button
              size="small"
              key={topic}
              onClick={() =>
                openCopilot(
                  `${month} · CNY · ${t(topic)}。${t('请查询账本依据，区分事实与推测。')}`,
                )
              }
            >
              {t(topic)}
            </Button>
          ),
        )}
      </Space>
    </Card>
  );
}
