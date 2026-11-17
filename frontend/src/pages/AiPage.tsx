import { Select } from '../components/TouchSelect';
import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Input, Radio, Space, Switch, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { t, useLocale } from '../i18n';
import { AiConversationPanel } from '../components/AiConversationPanel';
import { AiDraftPanel } from '../components/AiDraftPanel';
import { AiDraftAmount } from '../components/AiDraftAmount';
import { Sensitive } from '../components/Sensitive';
import {
  aiApi,
  type AiAnswer,
  type AiDraft,
  type AiConversationDetail,
} from '../api/ai';
import { AiAnalysisView } from '../components/ai/AiAnalysisView';
import { AiMarkdown } from '../components/ai/AiMarkdown';
import '../design/ai-center.css';
import { useUI } from '../stores/ui';
import { ErrorState } from '../components/Feedback';
import { PageTitle } from '../components/PageTitle';
import { accountApi, categoryApi } from '../api/finance';
import { formatDate } from '../utils/finance';
import {
  copilotMessagePrefix,
  type CopilotPageContext,
} from '../features/ai/copilotContext';

export default function AiPage({
  initialQuestion = '',
  compact = false,
  initialMode = 'chat',
  report = false,
  pageContext,
  initialConversationId,
}: {
  initialQuestion?: string;
  compact?: boolean;
  initialMode?: 'chat' | 'draft';
  report?: boolean;
  pageContext?: CopilotPageContext;
  initialConversationId?: string;
}) {
  const cache = useQueryClient();
  const locale = useLocale();
  const hidden = useUI((s) => s.hidden);
  const [params] = useSearchParams();
  const [selectedScope, setSelectedScope] = useState(
    pageContext
      ? pageContext.fields.accountIds !== undefined
      : params.has('accountId'),
  );
  const [scopeAccounts, setScopeAccounts] = useState<string[]>(
    pageContext
      ? (pageContext.fields.accountIds ?? [])
      : params.get('accountId')
        ? [params.get('accountId')!]
        : [],
  );
  const [linkedContext, setLinkedContext] = useState(pageContext);
  const prefix = linkedContext
    ? copilotMessagePrefix(linkedContext, selectedScope)
    : '';
  const contextDate = (value: string | undefined) =>
    value?.includes('T') ? formatDate(value, true) : value;
  const [archived, setArchived] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(initialConversationId);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const [text, setText] = useState(initialQuestion);
  const [mode, setMode] = useState<'chat' | 'draft'>(initialMode);
  const [source, setSource] = useState('typed');
  const [corrected, setCorrected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState('');
  const [answers, setAnswers] = useState<
    { question: string; result: AiAnswer }[]
  >([]);
  const [draft, setDraft] = useState<AiDraft>();
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<
    { stage: string; tool?: string; callId?: string }[]
  >([]);
  const controller = useRef<AbortController | undefined>(undefined);
  const { message } = App.useApp();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const abort = () => controller.current?.abort();
    window.addEventListener('finance:unauthorized', abort);
    return () => window.removeEventListener('finance:unauthorized', abort);
  }, []);
  const enabled =
    settings.data?.enabled &&
    settings.data.configured &&
    settings.data.privacy.enabled;
  function loadDetail(detail: AiConversationDetail) {
    setLinkedContext(undefined);
    setAnswers(
      detail.items.map((x) => ({ question: x.question, result: x.result })),
    );
    setSelectedScope(detail.conversation.accountIds != null);
    setScopeAccounts(detail.conversation.accountIds ?? []);
    setActiveConversationId(detail.conversation.id);
    setArchived(detail.conversation.archived);
    setDraft(undefined);
    setError('');
  }
  const requestedConversation = pageContext
    ? null
    : params.get('conversationId');
  useEffect(() => {
    if (!requestedConversation) return;
    let active = true;
    aiApi
      .conversation(requestedConversation)
      .then((detail) => {
        if (active) loadDetail(detail);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [requestedConversation]);
  async function send(question = text) {
    if (
      !question.trim() ||
      busy ||
      archived ||
      (report &&
        (!settings.data?.privacy.saveHistory || !!activeConversationId)) ||
      (selectedScope && scopeAccounts.length === 0)
    )
      return;
    setBusy(true);
    setPartial('');
    setError('');
    setProgress([]);
    setDraft(undefined);
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (mode === 'draft') {
        setDraft(await aiApi.draft(text, abort.signal, source, corrected));
        void cache.invalidateQueries({ queryKey: ['ai-drafts'] });
      } else {
        const result = await aiApi.chat(
          prefix + question,
          activeConversationId ?? answers.at(-1)?.result.conversationId,
          abort.signal,
          (chunk) => {
            if (!abort.signal.aborted) setPartial((current) => current + chunk);
          },
          selectedScope ? scopeAccounts : undefined,
          (item) => {
            if (!abort.signal.aborted)
              setProgress((current) =>
                [
                  ...current.filter((p) =>
                    item.callId
                      ? p.callId !== item.callId
                      : p.stage !== item.stage,
                  ),
                  item,
                ].slice(-34),
              );
          },
          report,
        );
        if (!abort.signal.aborted) {
          setAnswers((current) => [...current, { question, result }]);
          setActiveConversationId(result.conversationId);
          setText('');
        }
        void cache.invalidateQueries({ queryKey: ['ai-conversations'] });
      }
    } catch (e) {
      setError(
        abort.signal.aborted
          ? t('已停止。未完成的回复不作为财务结论。')
          : (e as Error).message,
      );
    } finally {
      setPartial('');
      setBusy(false);
      controller.current = undefined;
    }
  }
  return (
    <div className={'ai-chat-layout' + (compact ? ' ai-chat-compact' : '')}>
      {settings.data?.privacy.saveHistory === true && (
        <aside className="ai-chat-history" aria-label={t('会话历史')}>
          <AiConversationPanel
            key={'history-' + historyEpoch}
            enabled
            disabled={busy}
            onLoad={loadDetail}
            onDelete={(id) => {
              if (id === activeConversationId) {
                setAnswers([]);
                setActiveConversationId(undefined);
                setArchived(false);
              }
              void cache.invalidateQueries({ queryKey: ['ai-conversations'] });
            }}
          />
        </aside>
      )}
      <Space
        className="ai-chat-main"
        direction="vertical"
        size="large"
        style={{ width: '100%', maxWidth: 1100 }}
      >
        {linkedContext && (
          <Card
            className="copilot-page-context"
            size="small"
            title={t('当前页面上下文')}
          >
            <Descriptions
              column={1}
              items={[
                { key: 'page', label: t('页面'), children: linkedContext.page },
                {
                  key: 'period',
                  label: t('期间（上海时间）'),
                  children:
                    [linkedContext.fields.start, linkedContext.fields.end]
                      .map(contextDate)
                      .filter(Boolean)
                      .join(' — ') || t('由问题指定'),
                },
                {
                  key: 'currency',
                  label: t('币种'),
                  children: linkedContext.fields.currency ?? t('由问题指定'),
                },
              ]}
            />
          </Card>
        )}
        <div className="page-heading">
          <PageTitle>{t(report ? 'AI 财务报告' : 'AI 财务助手')}</PageTitle>
          <Link to="/settings/ai">{t('模型与隐私')}</Link>
          <Link to="/ai/agent">{t('自主财务 Agent')}</Link>
        </div>
        {settings.isError && (
          <ErrorState error={settings.error} retry={() => settings.refetch()} />
        )}
        {settings.data && !enabled && (
          <Alert
            type="warning"
            message={
              !settings.data.enabled
                ? t('服务端 AI 已关闭')
                : !settings.data.configured
                  ? t('尚未配置 DeepSeek 密钥，真实模型功能不可用')
                  : t('请先在模型与隐私中启用 AI 并授权')
            }
          />
        )}
        <Card title={t('当前查询范围')}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio.Group
              disabled={busy || answers.length > 0}
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              options={[
                { label: t('个人账本全部账户'), value: false },
                { label: t('仅选定账户'), value: true },
              ]}
            />
            {selectedScope && (
              <Select
                mode="multiple"
                aria-label={t('选择查询账户')}
                value={scopeAccounts}
                onChange={setScopeAccounts}
                disabled={busy || answers.length > 0}
                loading={accounts.isPending}
                style={{ width: '100%' }}
                options={accounts.data?.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
              />
            )}
            <Button
              disabled={busy}
              onClick={() => {
                setAnswers([]);
                setLinkedContext(pageContext);
                if (pageContext) {
                  setSelectedScope(pageContext.fields.accountIds !== undefined);
                  setScopeAccounts(pageContext.fields.accountIds ?? []);
                }
                setActiveConversationId(undefined);
                setHistoryEpoch((x) => x + 1);
                setDraft(undefined);
                setError('');
                setArchived(false);
              }}
            >
              {t('新建会话')}
            </Button>
          </Space>
        </Card>
        <Card title={t('开始一个问题')}>
          <Space wrap>
            {[
              t('本月收支情况'),
              t('未来30天现金流'),
              t('信用卡还款压力'),
              t('年度工资到账差异'),
              t('本月预算执行'),
              t('今年投资收益'),
            ].map((question) => (
              <Button
                key={question}
                disabled={busy}
                onClick={() => {
                  setMode('chat');
                  setText(question);
                }}
              >
                {question}
              </Button>
            ))}
          </Space>
          <div style={{ marginBlock: 16 }}>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={busy}
              options={[
                { label: t('财务问答与分析'), value: 'chat' },
                { label: t('自然语言记账草稿'), value: 'draft' },
              ]}
            />
          </div>
          {mode === 'draft' && (
            <>
              <Radio.Group
                value={source}
                disabled={busy}
                onChange={(e) => {
                  setSource(e.target.value);
                  setCorrected(false);
                }}
                options={[
                  { label: t('手工输入'), value: 'typed' },
                  { label: t('已识别票据文字'), value: 'ocr' },
                  { label: t('已转录语音'), value: 'asr' },
                  { label: t('文档文字'), value: 'document' },
                ]}
              />
              {source !== 'typed' && (
                <Alert
                  style={{ marginBlock: 12 }}
                  type="warning"
                  message={t(
                    '独立 OCR / ASR 引擎尚未配置。可粘贴已有识别文字，先对照原件校对。',
                  )}
                  description={
                    <Space>
                      <Switch checked={corrected} onChange={setCorrected} />
                      {t('我已校对识别文字，并确认可发送到云端。')}
                    </Space>
                  }
                />
              )}
            </>
          )}
          <Input.TextArea
            aria-label={t('AI 问题或记账描述')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={Math.max(1, 100000 - prefix.length)}
            rows={4}
            placeholder={
              mode === 'chat'
                ? t('例如：2026年9月收入和支出分别是多少？')
                : t('例如：昨天晚餐38元，支付宝支付。')
            }
            disabled={busy}
          />
          <Space style={{ marginTop: 12 }} wrap>
            <Button
              type="primary"
              loading={busy}
              disabled={
                !enabled ||
                !text.trim() ||
                archived ||
                (report &&
                  (!settings.data?.privacy.saveHistory ||
                    !!activeConversationId)) ||
                (selectedScope && scopeAccounts.length === 0) ||
                (mode === 'draft' &&
                  source !== 'typed' &&
                  (!corrected || !settings.data?.privacy.allowRecognitionText))
              }
              onClick={() => void send()}
            >
              {mode === 'chat' ? t('发送问题') : t('生成草稿')}
            </Button>
            {busy && (
              <Button onClick={() => controller.current?.abort()}>
                {t('停止')}
              </Button>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                const id =
                  activeConversationId ?? answers.at(-1)?.result.conversationId;
                try {
                  if (id) await aiApi.clear(id);
                  setAnswers([]);
                  setActiveConversationId(undefined);
                  setHistoryEpoch((x) => x + 1);
                  setDraft(undefined);
                  setError('');
                  setArchived(false);
                  void cache.invalidateQueries({
                    queryKey: ['ai-conversations'],
                  });
                } catch (e) {
                  message.error((e as Error).message);
                }
              }}
            >
              {t('清除会话')}
            </Button>
            {error && (
              <Button
                disabled={busy || !text.trim()}
                onClick={() => void send()}
              >
                {t('重试')}
              </Button>
            )}
          </Space>
        </Card>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            description={t('普通记账和财务报表仍可使用。')}
          />
        )}
        {mode === 'draft' && (
          <AiDraftPanel
            enabled={settings.data?.foundationVersion === 1}
            modelReady={!!enabled}
            disabled={busy}
            accountNames={Object.fromEntries(
              accounts.data?.map((a) => [a.id, a.name]) ?? [],
            )}
            categoryNames={Object.fromEntries(
              categories.data?.map((c) => [c.id, c.name]) ?? [],
            )}
          />
        )}
        {busy && (
          <Card title={t('正在查询与解释')}>
            <div aria-live="polite">
              <div className="ai-chat-progress">
                {progress.map((p, i) => (
                  <div key={p.callId ?? i}>
                    {p.tool && t(p.tool)} ·{' '}
                    {t(
                      (
                        {
                          Preparing: '准备上下文',
                          Running: '正在执行查询',
                          Succeeded: '查询完成',
                          Rejected: '查询被拒绝',
                          Generating: '正在生成解释',
                        } as Record<string, string>
                      )[p.stage] ?? '正在查询与解释',
                    )}
                  </div>
                ))}
              </div>
              {hidden ? '••••' : <AiMarkdown text={partial || t('正在调用受控服务…')} />}
              <Tag>{t('尚未完成，内容待核验')}</Tag>
            </div>
          </Card>
        )}
        {draft && (
          <Card title={t('记账草稿 · 尚未入账')}>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'intent',
                  label: t('意图'),
                  children: draft.parsed.intent,
                },
                {
                  key: 'amount',
                  label: t('金额'),
                  children: <AiDraftAmount parsed={draft.parsed} />,
                },
                {
                  key: 'date',
                  label: t('日期'),
                  children: draft.parsed.date || t('待确认'),
                },
                {
                  key: 'account',
                  label: t('账户'),
                  children: (
                    <Sensitive>
                      {accounts.data?.find((x) => x.id === draft.accountId)
                        ?.name ||
                        draft.parsed.accountHint ||
                        t('待选择')}
                    </Sensitive>
                  ),
                },
                {
                  key: 'category',
                  label: t('建议分类'),
                  children: (
                    <Sensitive>
                      {categories.data?.find((x) => x.id === draft.categoryId)
                        ?.name ||
                        draft.parsed.categoryHint ||
                        t('待选择')}
                    </Sensitive>
                  ),
                },
                {
                  key: 'confidence',
                  label: t('模型自评置信度'),
                  children:
                    draft.parsed.confidence == null
                      ? t('未知')
                      : `${new Intl.NumberFormat(locale, { style: 'percent' }).format(draft.parsed.confidence)} (${t('不是准确率')})`,
                },
                { key: 'source', label: t('来源'), children: draft.source },
              ]}
            />
            {draft.warnings.map((w) => (
              <Alert
                key={w}
                type="warning"
                message={<Sensitive>{w}</Sensitive>}
                style={{ marginBlock: 8 }}
              />
            ))}
            {draft.canOpenEntry && (
              <Button
                type="primary"
                onClick={() => {
                  if (
                    draft.parsed.intent !== 'Expense' &&
                    draft.parsed.intent !== 'Income'
                  )
                    return;
                  useUI.getState().openAiDraft(draft.parsed.intent, {
                    amount: draft.parsed.amount!,
                    occurredAt: `${draft.parsed.date}T12:00:00+08:00`,
                    currency: draft.parsed.currency,
                    accountId: draft.accountId || undefined,
                    categoryId: draft.categoryId || undefined,
                    merchant: draft.parsed.merchant || undefined,
                    draftId: draft.draftId,
                    version: draft.version,
                    note: draft.parsed.note,
                    tagIds: draft.tagIds,
                  });
                }}
              >
                {t('核对并打开现有记账表单')}
              </Button>
            )}
            {draft.requiresSpecialWorkflow && (
              <Space wrap>
                <Link to="/loans">{t('借贷')}</Link>
                <Link to="/prepayments">{t('押金预付款')}</Link>
                <Link to="/advances">{t('代付')}</Link>
                <Link to="/transactions">{t('交易与退款')}</Link>
                <Link to="/investments">{t('投资')}</Link>
              </Space>
            )}
          </Card>
        )}
        {answers.map(({ question, result }, index) => (
          <Card
            key={'answer-' + (result.messageId ?? index)}
            title={<Sensitive>{question}</Sensitive>}
          >
            {!result.sources.length && (
              <Tag color="orange">{t('没有本次账本查询依据')}</Tag>
            )}
            <AiAnalysisView result={result} onFollowUp={busy ? undefined : (prompt) => { setText(prompt); void send(prompt); }} />
            <Typography.Text type="secondary">
              {result.model} {t('· 财务解释请核对下面的权威数据')}
            </Typography.Text>
            <Space wrap style={{ display: 'flex', marginTop: 12 }}>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.answer);
                    message.success(t('已复制'));
                  } catch {
                    message.error(t('复制失败'));
                  }
                }}
              >
                {t('复制回答')}
              </Button>
              {result.messageId &&
                [1, -1].map((rating) => (
                  <Button
                    key={rating}
                    onClick={async () => {
                      try {
                        await aiApi.feedback(result.messageId!, rating);
                        message.success(t('反馈已保存'));
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    }}
                  >
                    {t(rating === 1 ? '有帮助' : '需改进')}
                  </Button>
                ))}
            </Space>
          </Card>
        ))}
      </Space>
    </div>
  );
}
