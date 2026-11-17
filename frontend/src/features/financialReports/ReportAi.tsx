import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Space, Spin } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiApi, type AiAnswer } from '../../api/ai';
import type { FinancialReport } from '../../api/financialReports';
import { ErrorState } from '../../components/Feedback';
import { AiAnalysisView } from '../../components/ai/AiAnalysisView';
import { AiMarkdown } from '../../components/ai/AiMarkdown';
import { useUI } from '../../stores/ui';
import { t, useLocale } from '../../i18n';
export function ReportAi({
  report,
  auto = false,
}: {
  report: FinancialReport;
  auto?: boolean;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AiAnswer>();
  const [partial, setPartial] = useState('');
  const controller = useRef<AbortController>(undefined);
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const allowed =
    !!settings.data?.enabled &&
    !!settings.data?.configured &&
    !!settings.data?.privacy.enabled &&
    !!settings.data?.privacy.allowSummary &&
    !hidden;
  const scope = `${report.selection.mode === 'annual' ? '年度' : '月度'}财务报告，开始 ${report.start}，截至 ${report.endExclusive}（不含），币种 ${report.selection.currency}。仅分析这一期间的已发生事实，未来月份不能当作事实，使用账本查询工具核对，不发送商户、备注等未授权明细。`;
  const summaryKey = [
    'financial-report-ai',
    report.selection,
    report.generatedAt,
  ];
  const prompt =
    scope +
    ' 请优先调用 GetFinancialReport 工具，查询范围使用这个月或这个年度的完整自然月/年（服务端截断未结束部分），再生成专业报告文案与指标解读，包含环比同比、消费异常的可能解释（原因待确认）、预算优化、收入稳定性、负债压力、历史变化和下一期预算建议。建议必须区分事实、假设和限制；无工具依据的章节明确数据不足。下一期预算只建议，不执行写入。';
  const summary = useQuery({
    queryKey: summaryKey,
    enabled: auto && allowed,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      aiApi.chat(
        prompt,
        undefined,
        signal,
        () => {},
        undefined,
        undefined,
        settings.data?.privacy.saveHistory === true,
      ),
  });
  useEffect(() => () => controller.current?.abort(), []);
  const ask = useMutation({
    mutationFn: async (text: string) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setPartial('');
      return aiApi.chat(
        scope + ' ' + text,
        answer?.conversationId ?? summary.data?.conversationId,
        abort.signal,
        (delta) => setPartial((p) => p + delta),
        undefined,
        undefined,
        !answer?.conversationId &&
          !summary.data?.conversationId &&
          settings.data?.privacy.saveHistory === true,
      );
    },
    onSuccess: (r) => {
      setAnswer(r);
      setPartial('');
      setQuestion('');
    },
  });
  const result = answer ?? summary.data;
  return (
    <Card title={t('DeepSeek 财务解读')} className="fr-ai-card">
      <p>
        {t(
          '复用现有服务端 DeepSeek 配置与分项授权；AI 建议不自动修改账本或预算。',
        )}
      </p>
      {settings.isError && (
        <ErrorState error={settings.error} retry={() => settings.refetch()} />
      )}
      {!allowed && (
        <Alert
          type="info"
          message={t(
            hidden
              ? '金额隐藏时暂停 AI 分析'
              : '请先在 AI 设置中启用服务并授权财务汇总。',
          )}
          action={<Link to="/settings/ai">{t('AI 设置')}</Link>}
        />
      )}
      <Space wrap>
        <Button
          type="primary"
          loading={summary.isFetching}
          disabled={!allowed || ask.isPending}
          onClick={() => {
            setAnswer(undefined);
            void summary.refetch();
          }}
        >
          {t('生成月度 / 年度 AI 总结')}
        </Button>
        {(summary.isFetching || ask.isPending) && (
          <Button
            onClick={() => {
              controller.current?.abort();
              void cache.cancelQueries({ queryKey: summaryKey });
            }}
          >
            {t('停止生成')}
          </Button>
        )}
        <Link to="/ai-center/reports">{t('查看已保存的 AI 报告会话')}</Link>
      </Space>
      {summary.isError && (
        <ErrorState error={summary.error} retry={() => summary.refetch()} />
      )}
      {ask.isError && <ErrorState error={ask.error} />}
      {(summary.isFetching || ask.isPending) && (
        <div role="status">
          <Spin size="small" /> {t('正在核对账本并生成分析…')}
        </div>
      )}
      {!hidden && partial && (
        <div aria-label="尚未完成的 AI 回复"><AiMarkdown text={partial} /></div>
      )}
      {!hidden && result && (
        <>
          <Alert
            type={result.financialDataVerified ? 'success' : 'warning'}
            message={
              result.financialDataVerified
                ? '回答已附查询依据，请结合数据限制阅读'
                : '未取得充分账本验证，请勿作为已确认财务结论'
            }
          />
          <AiAnalysisView result={result} onFollowUp={ask.isPending || summary.isFetching ? undefined : (prompt) => ask.mutate(prompt)} />
        </>
      )}
      <div className="fr-question">
        <Input.TextArea
          aria-label="财务报告问题"
          value={question}
          disabled={!allowed || ask.isPending}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2000}
          placeholder="例如：收入是否稳定？下一期预算怎样分配？"
        />
        <Button
          disabled={!allowed || !question.trim() || summary.isFetching}
          loading={ask.isPending}
          onClick={() => ask.mutate(question.trim())}
        >
          {t('询问报告')}
        </Button>
      </div>
    </Card>
  );
}
