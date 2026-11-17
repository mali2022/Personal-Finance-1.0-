import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  agentApi,
  type AgentConfiguration,
  type AgentDetail,
  type AgentMemory,
  type AgentWorkflow,
} from '../api/aiAgent';
import { accountApi } from '../api/finance';
import { Select } from '../components/TouchSelect';
import { DateInput } from '../components/ResponsiveDatePicker';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { AiEvidenceCards } from '../components/AiEvidenceCards';
import { AiMarkdown } from '../components/ai/AiMarkdown';
import { AiAnalysisView } from '../components/ai/AiAnalysisView';
import Chart from '../components/Chart';
import { t, useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import '../design/ai-agent.css';

const status = (value: string) =>
  t(
    (
      {
        Queued: '排队中',
        Running: '执行中',
        Completed: '已完成',
        Failed: '失败',
        Cancelled: '已取消',
        Suggested: '建议已准备',
        AwaitingApproval: '等待确认',
        Planned: '已规划',
        Rejected: '已拒绝',
      } as Record<string, string>
    )[value] ?? value,
  );
const terminal = ['Completed', 'Suggested', 'Failed', 'Cancelled'];
const modes = () => [
  { value: 'Suggest', label: t('A · 建议模式') },
  { value: 'Confirm', label: t('B · 确认执行模式') },
  { value: 'Auto', label: t('C · 自动调查，变更需确认') },
];
const pretty = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};
const toolLabel = (name: string) =>
  t(
    (
      {
        SaveTransaction: '新增或修改交易',
        BatchUpdateTransactions: '通用批量编辑',
        BatchClassifyTransactions: '仅自动分类',
        BatchAddTags: '仅补充标签',
        BatchNormalizeMerchants: '仅整理商户名称',
        SaveAccount: '新增或修改账户',
        SaveBudget: '创建或调整预算',
        SaveGoal: '创建或修改储蓄目标',
        SaveDebtPlan: '创建或修改偿债计划',
        SaveStatisticsRules: '修改统计口径',
        SaveAutomationRule: '创建或修改自动化规则',
        SaveRecurringBill: '管理周期性账单',
        SaveCategory: '创建或修改分类',
        SaveTag: '创建或修改标签',
        SaveMerchant: '创建或修改商户',
        SaveCashFlowScenario: '创建或修改财务情景',
        SaveFutureCashFlow: '创建或修改未来收支计划',
        SaveFinancialReport: '生成并保存财务报告',
      } as Record<string, string>
    )[name] ?? name,
  );
export default function AiAgentPage({
  advanced = false,
}: {
  advanced?: boolean;
}) {
  useLocale();
  const [params] = useSearchParams();
  const hidden = useUI((s) => s.hidden);
  const [tab, setTab] = useState(advanced ? 'settings' : 'tasks');
  const [taskId, setTaskId] = useState<string | undefined>(
    params.get('task') ?? undefined,
  );
  const [prompt, setPrompt] = useState('');
  const [followup, setFollowup] = useState(false);
  const [page, setPage] = useState(1);
  const [reviewedPlan, setReviewedPlan] = useState('');
  const [highRiskPlan, setHighRiskPlan] = useState('');
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  const settings = useQuery({
    queryKey: ['agent-settings'],
    queryFn: agentApi.settings,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const tasks = useQuery({
    queryKey: ['agent-tasks', page],
    queryFn: () => agentApi.tasks(page),
    refetchInterval: tab === 'tasks' ? 5000 : false,
  });
  const detail = useQuery({
    queryKey: ['agent-task', taskId],
    queryFn: () => agentApi.detail(taskId!),
    enabled: !!taskId,
    refetchInterval: (q) =>
      q.state.data && terminal.includes(q.state.data.task.state) ? false : 3000,
  });
  const grants = useQuery({
    queryKey: ['agent-grants'],
    queryFn: agentApi.grants,
    enabled: tab === 'grants',
  });
  const memories = useQuery({
    queryKey: ['agent-memories'],
    queryFn: agentApi.memories,
    enabled: tab === 'memory',
  });
  const workflows = useQuery({
    queryKey: ['agent-workflows'],
    queryFn: agentApi.workflows,
    enabled: tab === 'workflows',
  });
  const reports = useQuery({
    queryKey: ['agent-reports', page],
    queryFn: () => agentApi.reports(page),
    enabled: tab === 'reports',
  });
  const logs = useQuery({
    queryKey: ['agent-logs', page],
    queryFn: () => agentApi.logs(page),
    enabled: tab === 'logs',
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await cache.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('agent-'),
      });
      message.success(t('已保存'));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const create = useMutation({
    mutationFn: () => agentApi.create(prompt, followup ? taskId : undefined),
    onSuccess: async (task) => {
      setTaskId(task.id);
      setPrompt('');
      setFollowup(false);
      setReviewedPlan('');
      setHighRiskPlan('');
      await cache.invalidateQueries({ queryKey: ['agent-tasks'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const s = settings.data;
  const accountOptions =
    accounts.data?.map((a) => ({
      value: a.id,
      label: `${a.name} · ${a.currency}`,
    })) ?? [];
  const scopeField = (name: string = 'accountIds') => (
    <Form.Item
      name={name}
      label={t('财务数据访问范围')}
      extra={t('留空表示个人账本全部账户；任务仍受分项隐私授权限制。')}
    >
      <Select
        mode="multiple"
        allowClear
        showSearch
        optionFilterProp="label"
        options={accountOptions}
      />
    </Form.Item>
  );
  if (settings.isError)
    return (
      <ErrorState error={settings.error} retry={() => settings.refetch()} />
    );
  const run = (action: () => Promise<unknown>) => mutation.mutate(action);
  const pending =
    detail.data?.steps.filter(
      (step) => step.state === 'Planned' && !step.resultJson,
    ) ?? [];
  const hasHighRisk = pending.some((step) => step.highRisk);
  const planStamp = `${taskId}:${pending.map((step) => step.planHash).join(',')}`;
  const reviewed = reviewedPlan === planStamp;
  const highRisk = highRiskPlan === planStamp;
  const showTask = (id: string) => {
    setTaskId(id);
    setReviewedPlan('');
    setHighRiskPlan('');
    setTab('tasks');
  };
  const approval = () => {
    if (!detail.data) return;
    modal.confirm({
      title: t(hasHighRisk ? '独立高风险授权' : '确认完整操作计划'),
      content: t(
        hasHighRisk
          ? '本次授权仅适用于当前计划摘要，30分钟后到期。请核对每项影响与原值。'
          : '仅执行当前展示并确认的计划；后续新增操作会重新检查授权。',
      ),
      okText: t('确认执行'),
      onOk: async () => {
        await agentApi.approve(
          detail.data!.task.id,
          detail.data!.task.version,
          pending.map((x) => x.planHash),
          highRisk,
        );
        setReviewedPlan('');
        setHighRiskPlan('');
        await cache.invalidateQueries({ queryKey: ['agent-task', taskId] });
      },
    });
  };
  return (
    <div className="agent-page">
      <div className="agent-heading">
        <div>
          <PageTitle>
            {t(advanced ? 'AI 智能管理 · 高级功能' : '自主财务 Agent')}
          </PageTitle>
        </div>
        <Button
          danger
          loading={mutation.isPending}
          onClick={() => run(agentApi.stop)}
        >
          {t('紧急停止所有自动化任务')}
        </Button>
      </div>
      <Space wrap className="mb16">
        <Link to="/settings/ai">{t('隐私与传输授权')}</Link>
        <Link to={advanced ? '/ai/agent' : '/settings/ai/advanced'}>
          {t(advanced ? '打开任务工作台' : '高级功能')}
        </Link>
        <Link to="/ai/copilot">{t('打开 AI 助手')}</Link>
      </Space>
      {s?.emergencyStopped && (
        <Alert
          showIcon
          type="error"
          message={t('所有AI自动化已停止')}
          description={
            <Button onClick={() => run(() => agentApi.resume(s.version))}>
              {t('恢复新任务')}
            </Button>
          }
        />
      )}
      {s && (!s.privacy.enabled || !s.privacy.saveHistory) && (
        <Alert
          showIcon
          type="warning"
          message={t('请先开启AI并授权保存历史')}
          description={
            <Link to="/settings/ai">
              {t(
                '持久任务会保存描述、完整计划、结果与日志，请在隐私设置中授权。',
              )}
            </Link>
          }
        />
      )}
      {s && (!s.enabled || !s.configured) && (
        <Alert
          showIcon
          type="warning"
          message={t('服务端 AI 未启用或未配置模型密钥')}
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={(key) => {
          setTab(key);
          setPage(1);
        }}
        items={[
          {
            key: 'tasks',
            label: t('任务工作台'),
            children: (
              <div className="agent-workspace">
                <Card title={t('复杂任务与多轮执行')}>
                  <Input.TextArea
                    aria-label={t('任务描述')}
                    rows={5}
                    value={prompt}
                    maxLength={100000}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t(
                      '例如：对比过去三年各账户支出，找出异常商户，准备分类和预算调整方案，并保存报告。',
                    )}
                  />
                  <Space wrap style={{ marginTop: 12 }}>
                    <Button
                      type="primary"
                      loading={create.isPending}
                      disabled={
                        !prompt.trim() ||
                        !s?.privacy.enabled ||
                        !s?.enabled ||
                        !s?.configured ||
                        !s?.privacy.saveHistory ||
                        s?.emergencyStopped
                      }
                      onClick={() => create.mutate()}
                    >
                      {t('开始任务')}
                    </Button>
                    {detail.data?.task.state === 'Completed' && (
                      <Checkbox
                        checked={followup}
                        onChange={(e) => setFollowup(e.target.checked)}
                      >
                        {t('引用当前会话继续')}
                      </Checkbox>
                    )}
                    <Tag>
                      {t(
                        s?.configuration.mode === 'Auto'
                          ? 'C · 自动调查，变更需确认'
                          : s?.configuration.mode === 'Confirm'
                            ? 'B · 确认执行模式'
                            : 'A · 建议模式',
                      )}
                    </Tag>
                  </Space>
                  {tasks.isError && (
                    <ErrorState
                      error={tasks.error}
                      retry={() => tasks.refetch()}
                    />
                  )}
                  <List
                    dataSource={tasks.data?.items ?? []}
                    renderItem={(task) => (
                      <List.Item>
                        <Button
                          type="text"
                          className="agent-task-link"
                          onClick={() => showTask(task.id)}
                        >
                          <span>
                            {hidden ? '••••••' : task.prompt.slice(0, 80)}
                          </span>
                          <Tag>{status(task.state)}</Tag>
                        </Button>
                      </List.Item>
                    )}
                  />
                  <Pagination
                    current={page}
                    total={tasks.data?.total ?? 0}
                    pageSize={20}
                    size="small"
                    showSizeChanger={false}
                    onChange={setPage}
                  />
                </Card>
                <Card
                  title={t('执行状态与操作计划')}
                  loading={detail.isFetching && !detail.data}
                >
                  {detail.isError ? (
                    <ErrorState
                      error={detail.error}
                      retry={() => detail.refetch()}
                    />
                  ) : !detail.data ? (
                    <Empty description={t('选择或创建任务')} />
                  ) : (
                    <>
                      <Space wrap>
                        <Tag
                          color={
                            detail.data.task.state === 'Failed'
                              ? 'error'
                              : 'blue'
                          }
                        >
                          {status(detail.data.task.state)}
                        </Tag>
                        <span>
                          {t('模型调用')} {detail.data.task.modelCalls} ·{' '}
                          {t('工具调用')} {detail.data.task.toolCalls} · Token{' '}
                          {detail.data.task.tokensUsed}
                        </span>
                        {!terminal.includes(detail.data.task.state) && (
                          <Button
                            danger
                            onClick={() =>
                              run(() => agentApi.stopTask(taskId!))
                            }
                          >
                            {t('停止任务')}
                          </Button>
                        )}
                        {detail.data.task.state === 'Failed' && (
                          <Button
                            onClick={() =>
                              run(() =>
                                agentApi.retry(
                                  taskId!,
                                  detail.data!.task.version,
                                ),
                              )
                            }
                          >
                            {t('按当前预算继续任务')}
                          </Button>
                        )}
                      </Space>
                      {detail.data.task.errorCode && (
                        <Alert
                          type="error"
                          showIcon
                          message={detail.data.task.errorCode}
                        />
                      )}
                      {detail.data.task.answer && (
                        <AiAnalysisView result={{ conversationId: detail.data.task.id, answer: detail.data.task.answer, model: detail.data.task.configuration.model, sources: detail.data.task.sources, financialDataVerified: false, analysis: detail.data.task.analysis }} />
                      )}
                      <Collapse
                        items={detail.data.steps.map((step) => ({
                          key: step.id,
                          label: (
                            <Space wrap>
                              <span>
                                {step.sequence}. {step.tool}
                              </span>
                              <Tag>{status(step.state)}</Tag>
                              {step.highRisk && (
                                <Tag color="red">{t('高风险')}</Tag>
                              )}
                            </Space>
                          ),
                          children: hidden ? (
                            '••••••'
                          ) : (
                            <>
                              <Typography.Text strong>
                                {t('完整参数')}
                              </Typography.Text>
                              <pre className="agent-json">
                                {pretty(step.argumentsJson)}
                              </pre>
                              {step.previewJson !== '{}' && (
                                <>
                                  <Typography.Text strong>
                                    {t('操作预览与原值')}
                                  </Typography.Text>
                                  <pre className="agent-json">
                                    {pretty(step.previewJson)}
                                  </pre>
                                </>
                              )}
                              {step.resultJson && (
                                <>
                                  <Typography.Text strong>
                                    {t('执行结果')}
                                  </Typography.Text>
                                  <pre className="agent-json">
                                    {pretty(step.resultJson)}
                                  </pre>
                                </>
                              )}
                              {step.planHash && (
                                <Typography.Text
                                  type="secondary"
                                  className="agent-hash"
                                >
                                  {t('计划摘要')} {step.planHash}
                                </Typography.Text>
                              )}
                            </>
                          ),
                        }))}
                      />
                      {detail.data.task.state === 'AwaitingApproval' && (
                        <div className="agent-approval">
                          <Checkbox
                            checked={reviewed}
                            onChange={(e) =>
                              setReviewedPlan(e.target.checked ? planStamp : '')
                            }
                          >
                            {t('已逐项核对完整操作计划、影响范围及原值')}
                          </Checkbox>
                          {hasHighRisk && (
                            <Checkbox
                              checked={highRisk}
                              onChange={(e) =>
                                setHighRiskPlan(
                                  e.target.checked ? planStamp : '',
                                )
                              }
                            >
                              {t(
                                '单独授权本次高风险计划，不授予长期高风险权限',
                              )}
                            </Checkbox>
                          )}
                          <Button
                            type="primary"
                            danger={hasHighRisk}
                            disabled={
                              hidden || !reviewed || (hasHighRisk && !highRisk)
                            }
                            onClick={approval}
                          >
                            {t(
                              hasHighRisk
                                ? '授权并执行本次高风险计划'
                                : '确认并继续执行',
                            )}
                          </Button>
                        </div>
                      )}
                      {!hidden && <AgentCharts detail={detail.data} />}
                      {!detail.data.task.answer && <AiEvidenceCards
                        sources={detail.data.task.sources.filter(
                          (x) => x.tool !== 'GenerateChart',
                        )}
                      />}
                    </>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'settings',
            label: t('高级功能'),
            children: s && (
              <Card title={t('自主执行、模型与资源预算')}>
                <Alert
                  type="info"
                  showIcon
                  message={t(
                    '预算由后端校验，不能超过注册模型容量与服务器资源上限。',
                  )}
                  description={t(
                    '只读调查可自动执行。所有财务变更都须核对具体预览并确认；旧长期授权不替代本次计划确认。预算、账户范围和版本仍由服务端校验，高风险须独立授权。',
                  )}
                />
                <Form<AgentConfiguration>
                  name="ai-agent-settings"
                  key={s.version}
                  layout="vertical"
                  initialValues={{
                    ...s.configuration,
                    accountIds: s.configuration.accountIds ?? undefined,
                  }}
                  onFinish={(value) =>
                    run(() =>
                      agentApi.saveSettings(
                        {
                          ...s.configuration,
                          ...value,
                          accountIds: value.accountIds?.length
                            ? value.accountIds
                            : null,
                          historyRetentionDays:
                            value.historyRetentionDays || null,
                        },
                        s.version,
                      ),
                    )
                  }
                >
                  <div className="agent-form-grid">
                    <Form.Item name="mode" label={t('AI 自主执行模式')}>
                      <Select options={modes()} />
                    </Form.Item>
                    <Form.Item name="model" label={t('模型选择')}>
                      <Select
                        options={s.models.map((m) => ({
                          value: m.id,
                          label: `${m.id} · ${m.contextTokens} context`,
                          disabled: !m.supportsTools,
                        }))}
                      />
                    </Form.Item>
                    {(
                      [
                        ['contextTokens', '模型上下文容量', 1024],
                        ['outputTokens', '单次输出 Token', 128],
                        ['timeoutSeconds', '任务有效执行秒数', 10],
                        ['concurrentTasks', '并发任务数量', 1],
                        ['maxRetries', '临时故障恢复次数', 0],
                        [
                          'historyRetentionDays',
                          '历史保存天数（留空为长期）',
                          1,
                        ],
                      ] as const
                    ).map(([name, label, min]) => (
                      <Form.Item
                        key={name}
                        name={name}
                        label={
                          name.includes('CostBudget')
                            ? `${t(label)} (${s.priceCurrency})`
                            : t(label)
                        }
                      >
                        <InputNumber
                          min={min}
                          precision={name.includes('CostBudget') ? 6 : 0}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    ))}
                    <Form.Item name="detailLevel" label={t('输出详细程度')}>
                      <Select
                        options={['Concise', 'Standard', 'Detailed'].map(
                          (value) => ({ value, label: t(value) }),
                        )}
                      />
                    </Form.Item>
                    <Form.Item
                      name="memoryEnabled"
                      label={t('跨会话授权记忆')}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="transmitDescriptions"
                      label={t('允许传输名称、商户和备注')}
                      extra={t(
                        '商户关联和自然语言分类需要这些描述；默认仅传匿名ID、金额与状态。',
                      )}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </div>
                  {scopeField()}
                  <div className="agent-form-grid">
                    {(
                      [
                        ['persona', 'AI 人设'],
                        ['style', '回答风格'],
                        ['analysisDepth', '分析深度'],
                        ['classificationPreferences', '分类偏好'],
                        ['statisticalPreferences', '统计口径偏好'],
                        ['reminderRules', '提醒规则'],
                        ['reportTemplate', '报告模板'],
                        ['analysisPeriod', '默认分析周期'],
                      ] as const
                    ).map(([name, label]) => (
                      <Form.Item key={name} name={name} label={t(label)}>
                        <Input.TextArea rows={3} maxLength={20000} />
                      </Form.Item>
                    ))}
                  </div>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={mutation.isPending}
                  >
                    {t('保存高级设置')}
                  </Button>
                </Form>
                <Typography.Title level={5}>
                  {t('模型使用成本')}
                </Typography.Title>
                <List
                  dataSource={s.models}
                  renderItem={(m) => (
                    <List.Item>
                      {m.id} · {t('每百万 Token 输入 / 输出')}：
                      {m.inputPricePerMillion ?? t('未配置')} /{' '}
                      {m.outputPricePerMillion ?? t('未配置')} {s.priceCurrency}
                    </List.Item>
                  )}
                />
                <Link to="/settings/ai">{t('查看模型用量与费用记录')}</Link>
              </Card>
            ),
          },
          {
            key: 'grants',
            label: t('自动化授权'),
            children: (
              <Card title={t('按操作类型、账户范围与期限授权')}>
                <Alert
                  type="warning"
                  showIcon
                  message={t('批量删除等高风险操作不能使用普通长期授权。')}
                />
                <Form
                  layout="vertical"
                  initialValues={{ maxAffectedRecords: 100 }}
                  onFinish={(b) =>
                    run(() =>
                      agentApi.grant({
                        ...b,
                        accountIds: b.accountIds ?? [],
                        expiresAt: b.expiresAt
                          ? new Date(b.expiresAt).toISOString()
                          : undefined,
                      }),
                    )
                  }
                >
                  <Form.Item
                    name="tool"
                    label={t('操作类型')}
                    rules={[{ required: true }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={s?.tools
                        .filter(
                          (tool) =>
                            tool.write &&
                            ![
                              'BatchDeleteTransactions',
                              'DeleteTransaction',
                            ].includes(tool.name),
                        )
                        .map((tool) => ({
                          value: tool.name,
                          label: toolLabel(tool.name),
                        }))}
                    />
                  </Form.Item>
                  {scopeField()}
                  <div className="agent-form-grid">
                    <Form.Item
                      name="maxAffectedRecords"
                      label={t('每次最多影响记录数')}
                    >
                      <InputNumber min={1} max={10000} />
                    </Form.Item>
                    <Form.Item
                      name="expiresAt"
                      label={t('授权到期时间（留空为长期）')}
                    >
                      <DateInput type="datetime-local" />
                    </Form.Item>
                  </div>
                  <Button htmlType="submit" loading={mutation.isPending}>
                    {t('创建授权')}
                  </Button>
                </Form>
                {grants.isError && (
                  <ErrorState
                    error={grants.error}
                    retry={() => grants.refetch()}
                  />
                )}
                <List
                  dataSource={grants.data ?? []}
                  renderItem={(g) => (
                    <List.Item
                      actions={
                        !g.revokedAt
                          ? [
                              <Button
                                key="revoke"
                                danger
                                onClick={() =>
                                  run(() => agentApi.revoke(g.id, g.version))
                                }
                              >
                                {t('撤销授权')}
                              </Button>,
                            ]
                          : []
                      }
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            {toolLabel(g.tool)}
                            {g.highRisk && <Tag color="red">{t('高风险')}</Tag>}
                            {g.revokedAt && <Tag>{t('已撤销')}</Tag>}
                          </Space>
                        }
                        description={`${t('每次最多影响记录数')} ${g.maxAffectedRecords} · ${g.expiresAt ? new Date(g.expiresAt).toLocaleString() : t('长期有效')} · ${JSON.parse(g.accountIdsJson || '[]').length || t('全部账户')}`}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            ),
          },
          {
            key: 'memory',
            label: t('AI 记忆设置'),
            children: (
              <MemoryPanel
                memories={memories.data ?? []}
                run={run}
                scopeField={scopeField}
              />
            ),
          },
          {
            key: 'workflows',
            label: t('自定义工作流'),
            children: (
              <WorkflowPanel
                workflows={workflows.data ?? []}
                run={run}
                scopeField={scopeField}
              />
            ),
          },
          {
            key: 'reports',
            label: t('保存的财务报告'),
            children: (
              <Card>
                {reports.isError && (
                  <ErrorState
                    error={reports.error}
                    retry={() => reports.refetch()}
                  />
                )}
                <Collapse
                  items={reports.data?.items.map((r) => ({
                    key: r.id,
                    label: hidden ? '••••••' : r.title,
                    children: hidden ? (
                      '••••••'
                    ) : (
                      <>
                        <div className="agent-answer"><AiMarkdown text={r.content} /></div>
                        {r.assumptions && (
                          <Alert
                            type="info"
                            message={t('假设与预测')}
                            description={r.assumptions}
                          />
                        )}
                        <Button
                          onClick={() => {
                            const blob = new Blob(
                              [
                                `${r.title}\n\n${r.content}\n\n${r.assumptions}`,
                              ],
                              { type: 'text/markdown;charset=utf-8' },
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'financial-report.md';
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }}
                        >
                          {t('下载报告')}
                        </Button>
                        {r.taskId && (
                          <Button onClick={() => showTask(r.taskId!)}>
                            {t('查看任务依据')}
                          </Button>
                        )}
                      </>
                    ),
                  }))}
                />
                <Pagination
                  current={page}
                  pageSize={20}
                  total={reports.data?.total ?? 0}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              </Card>
            ),
          },
          {
            key: 'logs',
            label: t('操作日志'),
            children: (
              <Card>
                {logs.isError && (
                  <ErrorState error={logs.error} retry={() => logs.refetch()} />
                )}
                <List
                  dataSource={logs.data?.items}
                  renderItem={(log) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            {log.kind}
                            <Typography.Text type="secondary">
                              {new Date(log.createdAt).toLocaleString()}
                            </Typography.Text>
                          </Space>
                        }
                        description={log.detail}
                      />
                      {log.taskId && (
                        <Button onClick={() => showTask(log.taskId!)}>
                          {t('查看任务')}
                        </Button>
                      )}
                    </List.Item>
                  )}
                />
                <Pagination
                  current={page}
                  pageSize={50}
                  total={logs.data?.total ?? 0}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

function AgentCharts({ detail }: { detail: AgentDetail }) {
  return (
    <>
      {detail.task.sources
        .filter((s) => s.tool === 'GenerateChart')
        .map((s, index) => {
          const c = s.data as {
            title: string;
            type: 'bar' | 'line' | 'pie';
            labels: string[];
            values: number[];
            currency: string;
          };
          return (
            <Card key={index} title={`${c.title} · ${c.currency}`}>
              <Chart
                option={
                  c.type === 'pie'
                    ? {
                        tooltip: { trigger: 'item' },
                        series: [
                          {
                            type: 'pie',
                            data: c.labels.map((name, i) => ({
                              name,
                              value: c.values[i],
                            })),
                          },
                        ],
                      }
                    : {
                        tooltip: { trigger: 'axis' },
                        xAxis: { type: 'category', data: c.labels },
                        yAxis: { type: 'value' },
                        series: [{ type: c.type, data: c.values }],
                      }
                }
              />
            </Card>
          );
        })}
    </>
  );
}
function MemoryPanel({
  memories,
  run,
  scopeField,
}: {
  memories: AgentMemory[];
  run: (action: () => Promise<unknown>) => void;
  scopeField: () => React.ReactNode;
}) {
  const hidden = useUI((s) => s.hidden);
  const [editing, setEditing] = useState<AgentMemory>();
  const [open, setOpen] = useState(false);
  return (
    <Card
      title={t('独立保存、可编辑和删除的授权记忆')}
      extra={
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          {t('添加记忆')}
        </Button>
      }
    >
      <List
        dataSource={memories}
        renderItem={(m) => (
          <List.Item
            actions={[
              <Button
                key="edit"
                onClick={() => {
                  setEditing(m);
                  setOpen(true);
                }}
              >
                {t('编辑')}
              </Button>,
              <Button
                key="delete"
                danger
                onClick={() =>
                  run(() => agentApi.deleteMemory(m.id, m.version))
                }
              >
                {t('删除')}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={hidden ? '••••••' : m.title}
              description={hidden ? '••••••' : m.content}
            />
          </List.Item>
        )}
      />
      <Modal
        open={open}
        title={t('授权记忆')}
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form
          key={editing?.id ?? 'new'}
          layout="vertical"
          initialValues={
            editing
              ? {
                  ...editing,
                  accountIds: JSON.parse(editing.accountIdsJson),
                  version: String(editing.version),
                }
              : { enabled: true }
          }
          onFinish={(b) =>
            run(async () => {
              await agentApi.saveMemory(editing?.id ?? crypto.randomUUID(), {
                ...b,
                accountIds: b.accountIds?.length ? b.accountIds : undefined,
                version: editing ? String(editing.version) : '0',
                expiresAt: b.expiresAt
                  ? new Date(b.expiresAt).toISOString()
                  : undefined,
              });
              setOpen(false);
            })
          }
        >
          <Form.Item
            name="title"
            label={t('名称')}
            rules={[{ required: true }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="content"
            label={t('记忆内容')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={6} maxLength={100000} />
          </Form.Item>
          {scopeField()}
          <Form.Item name="expiresAt" label={t('到期时间')}>
            <DateInput type="datetime-local" />
          </Form.Item>
          <Form.Item name="enabled" label={t('启用')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            {t('保存')}
          </Button>
        </Form>
      </Modal>
    </Card>
  );
}
function WorkflowPanel({
  workflows,
  run,
  scopeField,
}: {
  workflows: AgentWorkflow[];
  run: (action: () => Promise<unknown>) => void;
  scopeField: () => React.ReactNode;
}) {
  const hidden = useUI((s) => s.hidden);
  const [editing, setEditing] = useState<AgentWorkflow>();
  const [open, setOpen] = useState(false);
  return (
    <Card
      title={t('自然语言财务分析工作流')}
      extra={
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          {t('新建工作流')}
        </Button>
      }
    >
      <List
        dataSource={workflows}
        renderItem={(w) => (
          <List.Item
            actions={[
              <Button
                key="run"
                onClick={() => run(() => agentApi.runWorkflow(w.id))}
              >
                {t('立即运行')}
              </Button>,
              <Button
                key="edit"
                onClick={() => {
                  setEditing(w);
                  setOpen(true);
                }}
              >
                {t('编辑')}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  {hidden ? '••••••' : w.name}
                  <Tag>{t(w.enabled ? '启用' : '停用')}</Tag>
                </Space>
              }
              description={
                <>
                  <span>{hidden ? '••••••' : w.prompt}</span>
                  {w.nextRunAt && (
                    <div>{new Date(w.nextRunAt).toLocaleString()}</div>
                  )}
                </>
              }
            />
          </List.Item>
        )}
      />
      <Modal
        open={open}
        title={t('配置工作流')}
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form
          key={editing?.id ?? 'new'}
          layout="vertical"
          initialValues={
            editing
              ? { ...editing, accountIds: JSON.parse(editing.accountIdsJson) }
              : { enabled: false, intervalMinutes: 1440 }
          }
          onFinish={(b) =>
            run(async () => {
              await agentApi.saveWorkflow(editing?.id ?? crypto.randomUUID(), {
                ...b,
                version: editing ? String(editing.version) : '0',
                accountIds: b.accountIds?.length ? b.accountIds : undefined,
                nextRunAt: b.nextRunAt
                  ? new Date(b.nextRunAt).toISOString()
                  : undefined,
              });
              setOpen(false);
            })
          }
        >
          <Form.Item name="name" label={t('名称')} rules={[{ required: true }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="prompt"
            label={t('任务描述')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={6} maxLength={100000} />
          </Form.Item>
          {scopeField()}
          <Form.Item name="intervalMinutes" label={t('执行间隔（分钟）')}>
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="nextRunAt" label={t('首次运行时间')}>
            <DateInput type="datetime-local" />
          </Form.Item>
          <Form.Item
            name="enabled"
            label={t('启用定时执行')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            {t('保存')}
          </Button>
        </Form>
      </Modal>
    </Card>
  );
}
