import { useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { importApi } from '../../api/operations';
import { importCleaningApi } from '../imports/api412';
import { smartApi } from './api';
import type {
  Balance,
  BatchItem,
  Candidate,
  Rule,
  Statement,
  Task,
} from './api';
import './reconciliation.css';
import { AllocationPanel } from './AllocationPanel';
import { IssuesPanel } from './IssuesPanel';
import { HistoryPanel } from './HistoryPanel';
import { CorrectionPanel } from './CorrectionPanel';
import { TaskHistoryPanel } from './TaskHistoryPanel';
import { SourceTrustPanel } from './SourceTrustPanel';
import { TaskRunControl } from './TaskRunControl';

export function SmartWorkbench({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('workspace');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Statement | undefined>(() =>
    params.get('statementId')
      ? ({ id: params.get('statementId')! } as Statement)
      : undefined,
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [reason, setReason] = useState('');
  const [jobId, setJobId] = useState(params.get('jobId') || '');
  const [afterIndex, setAfterIndex] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    failures: { id: string; code: string }[];
    hasMore: boolean;
  }>();
  const [balance, setBalance] = useState<Balance>();
  const [balanceForm] = Form.useForm();
  const [ruleForm] = Form.useForm();
  const [editingRule, setEditingRule] = useState<Rule>();
  const [batchItems, setBatchItems] = useState<Record<string, BatchItem>>({});
  const [taskForm] = Form.useForm();
  const [selectedTask, setSelectedTask] = useState<string>();
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const pending = useRef({ fingerprint: '', key: crypto.randomUUID() });
  const key = (body: unknown) => {
    const fingerprint = JSON.stringify(body);
    if (pending.current.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    return pending.current.key;
  };
  const refresh = async () => {
    await Promise.all(
      [
        'smart-reconciliation',
        'transactions',
        'transaction',
        'transaction-detail',
      ].map((k) => cache.invalidateQueries({ queryKey: [k] })),
    );
  };
  const list = useQuery({
    queryKey: ['smart-reconciliation', accountId, page, state, search, jobId],
    queryFn: () =>
      smartApi.list(accountId, page, state, search, jobId || undefined),
  });
  const candidates = useQuery({
    queryKey: ['smart-reconciliation', 'candidates', accountId, selected?.id],
    queryFn: async () => {
      const response = await smartApi.candidates(selected!.id);
      if (response.statement.accountId !== accountId)
        throw new Error(
          t(
            '流水不属于当前账户，请切换账户后复核',
            'This statement belongs to another account; switch accounts to review it',
          ),
        );
      return response;
    },
    enabled: !!selected,
  });
  const history = useQuery({
    queryKey: ['smart-reconciliation', 'history', selected?.id, historyPage],
    queryFn: () => smartApi.history(selected!.id, historyPage),
    enabled: !!selected,
  });
  const displayStatement = candidates.data?.statement || selected;
  const jobs = useQuery({
    queryKey: ['import-job-history', 1],
    queryFn: () => importCleaningApi.jobs(1),
  });
  const rules = useQuery({
    queryKey: ['smart-reconciliation', 'rules', accountId],
    queryFn: () => smartApi.rules(accountId),
  });
  const tasks = useQuery({
    queryKey: ['smart-reconciliation', 'tasks', accountId],
    queryFn: () => smartApi.tasks(accountId),
  });
  const fail = (error: Error) => {
    message.error(error.message);
  };
  const reviewStatement = (id: string) => {
    void smartApi
      .candidates(id)
      .then((result) => {
        setHistoryPage(1);
        setSelected(result.statement);
        setReason('');
      })
      .catch(fail);
  };
  const confirm = useMutation({
    mutationFn: (candidate: Candidate) => {
      const body = {
        transactionId: candidate.transactionId,
        version: candidates.data!.statement.version,
        transactionVersion: candidate.version,
        reason,
      };
      return smartApi.confirm(
        selected!.id,
        body,
        key({ id: selected!.id, ...body }),
      );
    },
    onSuccess: async () => {
      await refresh();
      message.success(
        t(
          '匹配已保存，账务余额未改变',
          'Match saved; ledger balance unchanged',
        ),
      );
    },
    onError: fail,
  });
  const resolve = useMutation({
    mutationFn: (nextState: string) => {
      const body = {
        version: candidates.data!.statement.version,
        state: nextState,
        reason,
      };
      return smartApi.resolve(
        selected!.id,
        body,
        key({ id: selected!.id, ...body }),
      );
    },
    onSuccess: refresh,
    onError: fail,
  });
  const importRows = useMutation({
    mutationFn: async () => {
      const job = await importApi.get(jobId);
      const body = {
        importJobId: jobId,
        accountId,
        version: job.version,
        afterIndex,
      };
      return smartApi.import(body, key(body));
    },
    onSuccess: async (r) => {
      setAfterIndex(r.nextIndex);
      setImportResult(r);
      await refresh();
    },
    onError: fail,
  });
  const saveRule = useMutation({
    mutationFn: async () => {
      const values = await ruleForm.validateFields();
      const body = {
        ...values,
        accountId,
        currency,
        autoConfirm: values.autoConfirm ?? false,
        version: editingRule?.version,
      };
      return smartApi.saveRule(body, key(body), editingRule?.id);
    },
    onSuccess: async () => {
      await refresh();
      setEditingRule(undefined);
      ruleForm.resetFields();
    },
    onError: fail,
  });
  const previewRule = useMutation({
    mutationFn: async () =>
      smartApi.previewRule({
        ...(await ruleForm.validateFields()),
        accountId,
        currency,
      }),
    onSuccess: (r) => {
      modal.info({
        title: t(
          '规则影响预览（不保存、不确认）',
          'Rule preview (no saves or confirmation)',
        ),
        width: 760,
        okText: t('关闭预览', 'Close preview'),
        content: (
          <>
            <p>
              {t('最近待复核流水抽样', 'Most recent pending statement sample')}:{' '}
              {r.evaluated} / {r.totalPending}
            </p>
            <Table
              rowKey="statementId"
              dataSource={r.results}
              pagination={false}
              scroll={{ x: 500 }}
              columns={[
                { title: t('商户', 'Merchant'), dataIndex: 'merchant' },
                {
                  title: t('金额', 'Amount'),
                  render: (_, row) => (
                    <Money value={row.amount} currency={currency} />
                  ),
                },
                {
                  title: t('规则命中候选', 'Matching candidates'),
                  dataIndex: 'matchingCount',
                },
                {
                  title: t('竞争 / 截断', 'Competing / truncated'),
                  render: (_, row) =>
                    `${row.competing ? t('是', 'Yes') : t('否', 'No')} / ${row.truncated ? t('是', 'Yes') : t('否', 'No')}`,
                },
              ]}
            />
          </>
        ),
      });
    },
    onError: fail,
  });
  const balanceAction = useMutation({
    mutationFn: async (save: boolean) => {
      const values = await balanceForm.validateFields();
      const body = {
        ...values,
        accountId,
        previewToken: save ? balance?.previewToken : undefined,
      };
      return smartApi.balance(body, save, key(body));
    },
    onSuccess: (r) => {
      setBalance(r);
      if (r.saved)
        message.success(t('余额调节快照已保存', 'Balance snapshot saved'));
    },
    onError: fail,
  });
  const batch = useMutation({
    mutationFn: async (action: string) => {
      const body = { action, reason, items: Object.values(batchItems) };
      const preview = await smartApi.batch(body, false, key(body));
      modal.confirm({
        title: t('批量影响预览', 'Batch impact preview'),
        content: (
          <>
            {preview.results.map((r) => (
              <div key={r.id}>
                {r.id}: {r.success ? t('可执行', 'Eligible') : r.error}
              </div>
            ))}
            <p>
              {t(
                '最多20条；执行时再次校验，失败项目保留原状态。',
                'At most 20; execution rechecks versions and preserves failed items.',
              )}
            </p>
          </>
        ),
        onOk: async () => {
          try {
            const result = await smartApi.batch(body, true, key(body));
            message.info(
              `${result.results.filter((r) => r.success).length} / ${result.results.length}`,
            );
            setBatchItems({});
            await refresh();
          } catch (e) {
            fail(e as Error);
          }
        },
      });
    },
    onError: fail,
  });
  const createTask = useMutation({
    mutationFn: async () => {
      const values = await taskForm.validateFields();
      const body = { accountId, ...values };
      return smartApi.createTask(body, key(body));
    },
    onSuccess: refresh,
    onError: fail,
  });
  const stepTask = useMutation({
    mutationFn: (task: Task) =>
      smartApi.stepTask(
        task.id,
        task.version,
        key({ id: task.id, version: task.version }),
      ),
    onSuccess: async (_r, task) => {
      setSelectedTask(task.id);
      await refresh();
    },
    onError: fail,
  });
  const automaticTask = useMutation({
    mutationFn: async (task: Task) => {
      const preview = await smartApi.autoPreview(task.id, task.version);
      modal.confirm({
        title: t('规则自动确认影响预览', 'Automatic rule confirmation preview'),
        content: (
          <>
            <p>
              {t('可自动确认 / 本批流水', 'Eligible / statements in this step')}
              : {preview.eligible} / {preview.total}
            </p>
            {preview.items.map((p) => (
              <p key={p.statementId}>
                {p.statementId}:{' '}
                {p.eligible
                  ? t('满足全部安全条件', 'All safety conditions satisfied')
                  : p.reasons.map((r) => autoReasons[r] || r).join('；')}
              </p>
            ))}
          </>
        ),
        okButtonProps: { disabled: preview.eligible === 0 },
        onOk: async () => {
          try {
            await smartApi.autoStep(
              task.id,
              task.version,
              preview.previewToken,
              key({
                task: task.id,
                version: task.version,
                token: preview.previewToken,
              }),
            );
            setSelectedTask(task.id);
            await refresh();
          } catch (e) {
            fail(e as Error);
          }
        },
      });
    },
    onError: fail,
  });
  const autoReasons: Record<string, string> = {
    SourceEvidenceRequiresReview: t(
      '原始来源事实指纹缺失，需人工复核',
      'Missing immutable source facts; manual review required',
    ),
    SourceSignNormalizationRequiresReview: t(
      '原始负金额被映射为流入，需人工复核',
      'Negative source amount mapped to an inflow; manual review required',
    ),
    SourceNotServerApproved: t(
      '文件及映射未由服务器核准',
      'File and mapping not approved by server',
    ),
    ManualReviewRequiredForBusinessOrCorrection: t(
      '复杂业务或已修正来源需人工复核',
      'Complex business or corrected source requires review',
    ),
    CandidateWindowTruncated: t('候选已截断', 'Candidate window truncated'),
    NoExactCandidate: t('没有零差额候选', 'No exact candidate'),
    CompetingCandidates: t('存在竞争候选', 'Competing candidates'),
    ExactIdentityEvidenceRequired: t(
      '参考号、商户或类型证据不足',
      'Insufficient reference, merchant or type evidence',
    ),
    ComplexBusinessRequiresHumanReview: t(
      '复杂业务需人工复核',
      'Complex business requires review',
    ),
    UnverifiedPaymentOrCounterparty: t(
      '付款来源或对方账号未核实',
      'Payment source or counterparty unverified',
    ),
    NoEnabledAutomaticRule: t(
      '没有满足条件的已启用自动规则',
      'No applicable enabled automatic rule',
    ),
    RulePriorityConflict: t('规则优先级冲突', 'Rule priority conflict'),
    UnsafeAutomaticRule: t(
      '规则超出自动确认安全边界',
      'Rule exceeds automatic safety boundary',
    ),
  };
  const confidence: Record<string, string> = {
    High: t('高置信度', 'High confidence'),
    Medium: t('中置信度', 'Medium confidence'),
    Low: t('低置信度', 'Low confidence'),
    Conflict: t('存在冲突', 'Conflict'),
  };
  const labels: Record<string, string> = {
    Pending: t('待复核', 'Pending'),
    Matched: t('已匹配', 'Matched'),
    PartiallyMatched: t('部分匹配', 'Partially matched'),
    Ignored: t('已忽略', 'Ignored'),
  };
  const reasons: Record<string, string> = {
    AmountExact: t('金额一致', 'Exact amount'),
    AmountDifference: t('金额不一致', 'Amount differs'),
    DateWithinWindow: t('日期在容差内', 'Date within window'),
    DateDifference: t('日期超出容差', 'Date outside window'),
    PostingDateWithinWindow: t(
      '银行入账日期在容差内',
      'Bank posting date within window',
    ),
    PostingDateDifference: t(
      '银行入账日期超出容差',
      'Bank posting date outside window',
    ),
    FeeIncludedInAccountFlow: t(
      '账户资金分录包含手续费',
      'Account flow includes fees',
    ),
    MultiplePaymentSources: t(
      '涉及多支付来源，请核对各来源分录',
      'Multiple payment sources; review each account flow',
    ),
    CounterpartyExact: t('对方账号一致', 'Exact counterparty account'),
    CounterpartyMismatch: t(
      '已知对方账号不一致',
      'Known counterparty account differs',
    ),
    CounterpartyUnverified: t(
      '对方账号信息不足，需人工核实',
      'Counterparty account needs verification',
    ),
    PaymentSourceExact: t(
      '付款来源与账户身份一致',
      'Payment source agrees with account identity',
    ),
    PaymentSourceUnverified: t(
      '付款来源需人工核实',
      'Payment source needs verification',
    ),
    MerchantExact: t('商户一致', 'Exact merchant'),
    MerchantSimilar: t('商户名称相似', 'Similar merchant'),
    MerchantUnverified: t('商户未核实', 'Merchant unverified'),
    ReferenceExact: t('来源参考号一致', 'Exact source reference'),
    TypeExact: t('交易类型一致', 'Same transaction type'),
    NoteExact: t('备注一致', 'Same note'),
    CheckOtherAccountEnd: t(
      '需检查转账或还款另一端',
      'Check other transfer/payment end',
    ),
    RefundOriginMissing: t('缺少退款原交易', 'Refund origin missing'),
    RefundOriginLinked: t('退款已关联原交易', 'Refund origin linked'),
    BusinessConflict: t(
      '账户、币种、方向或状态冲突',
      'Account, currency, direction or status conflict',
    ),
    LedgerBusinessConflict: t(
      '原交易分录或关联业务存在异常，请先复核账务',
      'Ledger entries or business associations are invalid; review the ledger first',
    ),
  };
  return (
    <Card
      className="mb16"
      title={t('智能对账工作台', 'Smart reconciliation workspace')}
    >
      <Select
        className="reconciliation-area-select mb16"
        aria-label={t('对账工作区域', 'Reconciliation work area')}
        value={activeTab}
        style={{ width: '100%' }}
        onChange={setActiveTab}
        options={[
          {
            value: 'workspace',
            label: t('流水与建议', 'Statements & suggestions'),
          },
          {
            value: 'history',
            label: t('操作与快照历史', 'Audit & snapshot history'),
          },
          { value: 'issues', label: t('差异与异常', 'Discrepancies') },
          {
            value: 'allocations',
            label: t('组合与部分匹配', 'Grouped & partial matching'),
          },
          { value: 'tasks', label: t('任务与进度', 'Tasks & progress') },
          { value: 'rules', label: t('匹配规则', 'Matching rules') },
          {
            value: 'balance',
            label: t('期间余额调节', 'Period balance reconciliation'),
          },
        ]}
      />
      <Tabs
        className="smart-reconciliation-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'workspace',
            label: t('流水与建议', 'Statements & suggestions'),
            children: (
              <>
                <Space wrap className="mb16">
                  <Link
                    to={`/import?purpose=reconciliation&accountId=${accountId}`}
                  >
                    {t('导入并映射文件', 'Import and map file')}
                  </Link>
                  <Select
                    aria-label={t('对账批次', 'Statement batch')}
                    allowClear
                    style={{ width: 220 }}
                    value={jobId || undefined}
                    options={jobs.data?.items.map((j) => ({
                      value: j.id,
                      label: j.fileName,
                    }))}
                    onChange={(id) => {
                      setJobId(id || '');
                      setPage(1);
                      setAfterIndex(0);
                      setImportResult(undefined);
                    }}
                    placeholder={t(
                      '选择已映射导入批次',
                      'Select mapped import batch',
                    )}
                  />
                  <Button
                    disabled={!jobId}
                    loading={importRows.isPending}
                    onClick={() =>
                      modal.confirm({
                        title: t(
                          '仅建立外部流水，不记账',
                          'Create statement evidence only',
                        ),
                        content: t(
                          '每批最多200行。未映射、账户或币种不符的行会返回失败原因。',
                          'Up to 200 rows per batch; invalid mapping, account or currency returns an error per row.',
                        ),
                        onOk: () =>
                          importRows.mutateAsync().catch(() => undefined),
                      })
                    }
                  >
                    {t('接收下一批流水', 'Receive next statement batch')}
                  </Button>
                </Space>
                {importResult && (
                  <Alert
                    className="mb16"
                    type={importResult.failures.length ? 'warning' : 'success'}
                    message={`${t('新增 / 重复 / 失败', 'New / duplicate / failed')}: ${importResult.imported} / ${importResult.duplicates} / ${importResult.failures.length}`}
                    description={
                      <>
                        <span>
                          {importResult.hasMore
                            ? t('还有后续批次', 'More batches available')
                            : t('本批次处理结束', 'Batch processing finished')}
                        </span>
                        {importResult.failures.map((f) => (
                          <div key={f.id}>
                            {f.id}: {f.code}
                          </div>
                        ))}
                      </>
                    }
                  />
                )}
                {list.data && (
                  <p>
                    {t(
                      '已匹配流水 / 本账户全部外部流水',
                      'Matched statements / all external statements for account',
                    )}
                    : {list.data.numerator} / {list.data.denominator}{' '}
                    {list.data.denominator === 0
                      ? t('暂无可对账数据', 'No reconciliation data')
                      : ''}
                  </p>
                )}
                <Space wrap className="mb16">
                  {list.data?.summary.map((s) => (
                    <Tag key={s.state}>
                      {labels[s.state] || s.state}: {s.count} ·{' '}
                      <Money value={s.grossAmount} currency={currency} />
                    </Tag>
                  ))}
                </Space>
                {!!list.data?.conflictCount && (
                  <Alert
                    className="mb16"
                    type="warning"
                    message={`${t('存在冲突的流水', 'Statements with conflicts')}: ${list.data.conflictCount}`}
                  />
                )}
                <Space wrap className="mb16">
                  <Select
                    aria-label={t('流水状态', 'Statement state')}
                    value={state}
                    style={{ width: 150 }}
                    options={[
                      { value: '', label: t('全部状态', 'All states') },
                      ...Object.entries(labels).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                    onChange={(s) => {
                      setState(s);
                      setPage(1);
                    }}
                  />
                  <Input.Search
                    aria-label={t('搜索流水', 'Search statements')}
                    placeholder={t('商户或参考号', 'Merchant or reference')}
                    onSearch={(s) => {
                      setSearch(s);
                      setPage(1);
                    }}
                  />
                </Space>
                <div className="mb16">
                  <Input.TextArea
                    aria-label={t('批量处理原因', 'Batch reason')}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('批量处理原因', 'Batch reason')}
                  />
                  <Space wrap>
                    <span>
                      {t('已人工加入批量', 'Manually selected for batch')}:{' '}
                      {Object.keys(batchItems).length}
                    </span>
                    {['Confirm', 'Ignored', 'Pending'].map((action) => (
                      <Button
                        key={action}
                        disabled={
                          !reason.trim() || Object.keys(batchItems).length === 0
                        }
                        loading={batch.isPending}
                        onClick={() => batch.mutate(action)}
                      >
                        {action === 'Confirm'
                          ? t('预览批量确认', 'Preview batch confirmation')
                          : action === 'Ignored'
                            ? t('预览批量忽略', 'Preview batch ignore')
                            : t('预览批量撤销', 'Preview batch revoke')}
                      </Button>
                    ))}
                    <Button onClick={() => setBatchItems({})}>
                      {t('清空选择', 'Clear selection')}
                    </Button>
                  </Space>
                </div>
                {list.isError ? (
                  <ErrorState
                    error={list.error}
                    retry={() => void list.refetch()}
                  />
                ) : (
                  <Table<Statement>
                    rowKey="id"
                    loading={list.isPending}
                    dataSource={list.data?.items}
                    scroll={{ x: 720 }}
                    pagination={{
                      current: page,
                      pageSize: 20,
                      total: list.data?.total,
                      onChange: setPage,
                      showSizeChanger: false,
                    }}
                    columns={[
                      {
                        title: t('日期', 'Date'),
                        render: (_, r) => r.occurredAt.slice(0, 10),
                      },
                      {
                        title: t('外部流水', 'External statement'),
                        render: (_, r) => (
                          <Sensitive>
                            {r.merchant || r.reference || '—'}
                          </Sensitive>
                        ),
                      },
                      {
                        title: t('金额', 'Amount'),
                        render: (_, r) => (
                          <Money value={r.amount} currency={r.currency} />
                        ),
                      },
                      {
                        title: t('状态', 'State'),
                        render: (_, r) => labels[r.state] || r.state,
                      },
                      {
                        title: t('操作', 'Actions'),
                        render: (_, r) => (
                          <Button
                            onClick={() => {
                              setHistoryPage(1);
                              setSelected(r);
                              setReason('');
                            }}
                          >
                            {t('复核与解释', 'Review & explanation')}
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: 'history',
            label: t('操作与快照历史', 'Audit & snapshot history'),
            children: (
              <HistoryPanel accountId={accountId} currency={currency} />
            ),
          },
          {
            key: 'issues',
            label: t('差异与异常', 'Discrepancies'),
            children: (
              <IssuesPanel
                accountId={accountId}
                currency={currency}
                review={(id) => {
                  void smartApi
                    .candidates(id)
                    .then((result) => {
                      setSelected(result.statement);
                      setReason('');
                    })
                    .catch(fail);
                }}
              />
            ),
          },
          {
            key: 'allocations',
            label: t('组合与部分匹配', 'Grouped & partial matching'),
            children: <AllocationPanel statements={list.data?.items || []} />,
          },
          {
            key: 'tasks',
            label: t('任务与进度', 'Tasks & progress'),
            children: (
              <>
                <Form
                  name="reconciliationTask"
                  form={taskForm}
                  layout="vertical"
                >
                  <Form.Item
                    name="startsAt"
                    label={t('任务开始', 'Task start')}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="2026-10-01T00:00:00+08:00" />
                  </Form.Item>
                  <Form.Item
                    name="endsAt"
                    label={t('任务结束', 'Task end')}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="2026-10-31T23:59:59+08:00" />
                  </Form.Item>
                  <Button
                    loading={createTask.isPending}
                    onClick={() => createTask.mutate()}
                  >
                    {t('创建建议任务', 'Create suggestion task')}
                  </Button>
                </Form>
                {tasks.isError ? (
                  <ErrorState
                    error={tasks.error}
                    retry={() => void tasks.refetch()}
                  />
                ) : (
                  <Table<Task>
                    rowKey="id"
                    dataSource={tasks.data}
                    loading={tasks.isPending}
                    scroll={{ x: 600 }}
                    columns={[
                      { title: t('状态', 'State'), dataIndex: 'state' },
                      {
                        title: t('已处理', 'Processed'),
                        render: (_, r) => `${r.processed} / ${r.total ?? '?'}`,
                      },
                      { title: t('失败', 'Failed'), dataIndex: 'failed' },
                      {
                        title: t('连续处理', 'Continuous processing'),
                        render: (_, r) => (
                          <TaskRunControl
                            task={r}
                            disabled={
                              stepTask.isPending ||
                              (runningTaskId !== null && runningTaskId !== r.id)
                            }
                            onRunningChange={(value) =>
                              setRunningTaskId(value ? r.id : null)
                            }
                            onProgress={(updated) => {
                              setSelectedTask(updated.id);
                              cache.setQueryData<Task[]>(
                                ['smart-reconciliation', 'tasks', accountId],
                                (old) =>
                                  old?.map((row) =>
                                    row.id === updated.id ? updated : row,
                                  ),
                              );
                              void cache.invalidateQueries({
                                queryKey: [
                                  'smart-reconciliation',
                                  'task-steps',
                                  updated.id,
                                ],
                              });
                            }}
                            onFinished={refresh}
                          />
                        ),
                      },
                      {
                        title: t('自动确认', 'Automatic confirmation'),
                        render: (_, r) => (
                          <Button
                            disabled={
                              r.state === 'Completed' || runningTaskId !== null
                            }
                            loading={automaticTask.isPending}
                            onClick={() => automaticTask.mutate(r)}
                          >
                            {t(
                              '预览安全自动确认',
                              'Preview safe automatic confirmation',
                            )}
                          </Button>
                        ),
                      },
                      {
                        title: t('操作', 'Actions'),
                        render: (_, r) => (
                          <Button
                            disabled={
                              r.state === 'Completed' || runningTaskId !== null
                            }
                            loading={stepTask.isPending}
                            onClick={() => stepTask.mutate(r)}
                          >
                            {t(
                              '处理 / 继续下一批',
                              'Process / resume next step',
                            )}
                          </Button>
                        ),
                      },
                      {
                        title: t('历史批次', 'Step history'),
                        render: (_, r) => (
                          <Button onClick={() => setSelectedTask(r.id)}>
                            {t(
                              '查看建议与失败原因',
                              'View suggestions and errors',
                            )}
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
                {selectedTask && (
                  <TaskHistoryPanel
                    key={selectedTask}
                    id={selectedTask}
                    review={reviewStatement}
                  />
                )}
              </>
            ),
          },
          {
            key: 'rules',
            label: t('匹配规则', 'Matching rules'),
            children: (
              <>
                {rules.isError ? (
                  <ErrorState
                    error={rules.error}
                    retry={() => void rules.refetch()}
                  />
                ) : (
                  <Table<Rule>
                    rowKey="id"
                    dataSource={rules.data}
                    loading={rules.isPending}
                    scroll={{ x: 600 }}
                    columns={[
                      { title: t('规则', 'Rule'), dataIndex: 'name' },
                      { title: t('优先级', 'Priority'), dataIndex: 'priority' },
                      {
                        title: t('状态', 'State'),
                        render: (_, r) =>
                          r.enabled
                            ? t('启用', 'Enabled')
                            : t('停用', 'Disabled'),
                      },
                      {
                        title: t('编辑', 'Edit'),
                        render: (_, r) => (
                          <Button
                            onClick={() => {
                              setEditingRule(r);
                              ruleForm.setFieldsValue(r);
                            }}
                          >
                            {t('编辑', 'Edit')}
                          </Button>
                        ),
                      },
                      {
                        title: t(
                          '历史关联 / 有效 / 撤销 / 冲突',
                          'Historical links / active / revoked / conflicts',
                        ),
                        render: (_, r) =>
                          `${r.effect?.confirmations ?? 0} / ${r.effect?.active ?? 0} / ${r.effect?.revoked ?? 0} / ${r.effect?.conflicts ?? 0}`,
                      },
                    ]}
                  />
                )}
                <Form
                  name="reconciliationRule"
                  form={ruleForm}
                  layout="vertical"
                  initialValues={{
                    name: '',
                    merchant: '',
                    type: '',
                    keyword: '',
                    dateTolerance: 3,
                    priority: 0,
                    amountTolerance: '0',
                    requireReference: true,
                    enabled: true,
                    autoConfirm: false,
                  }}
                >
                  <Form.Item
                    name="name"
                    label={t('规则名称', 'Rule name')}
                    rules={[{ required: true, max: 100 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="merchant"
                    label={t('商户（空为不限）', 'Merchant (blank for any)')}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    name="type"
                    label={t('交易类型', 'Transaction type')}
                  >
                    <Select
                      options={[
                        '',
                        'Expense',
                        'Income',
                        'Refund',
                        'Transfer',
                        'CreditCardPayment',
                      ].map((value) => ({
                        value,
                        label: value || t('不限', 'Any'),
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="keyword"
                    label={t('备注关键词', 'Note keyword')}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    name="dateTolerance"
                    label={t('日期容差（天）', 'Date tolerance (days)')}
                  >
                    <InputNumber min={0} max={7} />
                  </Form.Item>
                  <Form.Item
                    name="priority"
                    label={t('优先级（较小优先）', 'Priority (lower first)')}
                  >
                    <InputNumber min={0} max={1000} />
                  </Form.Item>
                  <Form.Item
                    name="expectedAmount"
                    label={t(
                      '规则目标金额（绝对值，可空）',
                      'Expected absolute amount (optional)',
                    )}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item
                    name="amountTolerance"
                    label={t(
                      '金额容差（只用于建议）',
                      'Amount tolerance (suggestions only)',
                    )}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item
                    name="requireReference"
                    label={t('要求参考号一致', 'Require exact reference')}
                  >
                    <Select
                      options={[
                        { value: true, label: t('是', 'Yes') },
                        { value: false, label: t('否', 'No') },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="enabled" label={t('启用', 'Enabled')}>
                    <Select
                      options={[
                        { value: true, label: t('是', 'Yes') },
                        { value: false, label: t('否', 'No') },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="autoConfirm"
                    label={t(
                      '允许安全自动确认（默认关闭）',
                      'Allow safe automatic confirmation (off by default)',
                    )}
                  >
                    <Select
                      options={[
                        { value: false, label: t('关闭', 'Off') },
                        {
                          value: true,
                          label: t(
                            '启用安全约束',
                            'Enable with safety constraints',
                          ),
                        },
                      ]}
                    />
                  </Form.Item>
                  <Button
                    loading={previewRule.isPending}
                    onClick={() => previewRule.mutate()}
                  >
                    {t('预览当前规则', 'Preview current rule')}
                  </Button>
                  <Button
                    loading={saveRule.isPending}
                    onClick={() => saveRule.mutate()}
                  >
                    {t('保存规则', 'Save rule')}
                  </Button>
                </Form>
              </>
            ),
          },
          {
            key: 'balance',
            label: t('期间余额调节', 'Period balance reconciliation'),
            children: (
              <>
                <Form
                  name="reconciliationBalance"
                  form={balanceForm}
                  layout="vertical"
                  onValuesChange={() => setBalance(undefined)}
                >
                  <Form.Item
                    name="startsAt"
                    label={t(
                      '期间开始（含时区）',
                      'Period start (with timezone)',
                    )}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="2026-10-01T00:00:00+08:00" />
                  </Form.Item>
                  <Form.Item
                    name="endsAt"
                    label={t(
                      '期间结束（含时区）',
                      'Period end (with timezone)',
                    )}
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="2026-10-31T23:59:59+08:00" />
                  </Form.Item>
                  <Form.Item
                    name="openingBalance"
                    label={t('银行期初余额', 'Bank opening balance')}
                    rules={[{ required: true }]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item
                    name="bankClosingBalance"
                    label={t('银行期末余额', 'Bank closing balance')}
                    rules={[{ required: true }]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item
                    name="reviewedOutstanding"
                    label={t(
                      '未达与忽略项目复核',
                      'Outstanding and ignored item review',
                    )}
                    initialValue={false}
                  >
                    <Select
                      aria-label={t(
                        '未达与忽略项目复核',
                        'Outstanding and ignored item review',
                      )}
                      options={[
                        {
                          value: false,
                          label: t('尚未逐项复核', 'Not individually reviewed'),
                        },
                        {
                          value: true,
                          label: t(
                            '已逐项复核并确认为未达或合理忽略项目',
                            'Individually reviewed as outstanding or reasonably ignored',
                          ),
                        },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="outstandingReason"
                    label={t(
                      '未达项目复核说明',
                      'Outstanding item review reason',
                    )}
                    initialValue=""
                  >
                    <Input.TextArea maxLength={1000} />
                  </Form.Item>
                  <Button
                    loading={balanceAction.isPending}
                    onClick={() => balanceAction.mutate(false)}
                  >
                    {t('预览余额调节', 'Preview balance reconciliation')}
                  </Button>
                </Form>
                {balance && (
                  <div className="mt20">
                    {balance.periodClosed === false && (
                      <Alert
                        className="mb16"
                        type="warning"
                        message={t(
                          '对账期间尚未结束，当前只能预览，不能完成快照。',
                          'The reconciliation period has not ended; preview is available, but completion is blocked.',
                        )}
                      />
                    )}
                    {balance.requiresOutstandingReview && (
                      <Alert
                        className="mb16"
                        type="warning"
                        message={t(
                          '尚未关联的记录不会自动视为有效未达账项。请逐项复核下列项目及已忽略记录，填写说明并重新预览。',
                          'Unlinked records are not automatically valid outstanding items. Review the following items and ignored records, explain your assessment, then preview again.',
                        )}
                      />
                    )}
                    {balance.withinReviewLimit === false && (
                      <Alert
                        className="mb16"
                        type="warning"
                        message={t(
                          '待复核项目超过200项，请先完成更多匹配或缩小期间。',
                          'More than 200 outstanding items; match more records or narrow the period first.',
                        )}
                      />
                    )}
                    <Table
                      rowKey="statementId"
                      size="small"
                      pagination={false}
                      dataSource={balance.evidence.bankOutstanding}
                      scroll={{ x: 500 }}
                      columns={[
                        {
                          title: t(
                            '待复核银行独有项目',
                            'Bank-only items requiring review',
                          ),
                          render: (_, r) => (
                            <Button
                              onClick={() => reviewStatement(r.statementId)}
                            >
                              {t('复核流水', 'Review statement')}
                            </Button>
                          ),
                        },
                        {
                          title: t('未分配净额', 'Unallocated signed amount'),
                          render: (_, r) => (
                            <Money value={r.remaining} currency={currency} />
                          ),
                        },
                      ]}
                    />
                    <Table
                      rowKey="transactionId"
                      size="small"
                      pagination={false}
                      dataSource={balance.evidence.ledgerOutstanding}
                      scroll={{ x: 500 }}
                      columns={[
                        {
                          title: t(
                            '待复核系统独有项目',
                            'Ledger-only items requiring review',
                          ),
                          render: (_, r) => (
                            <Link to={`/transactions/${r.transactionId}`}>
                              {t('查看内部交易', 'View ledger transaction')}
                            </Link>
                          ),
                        },
                        {
                          title: t('未分配净额', 'Unallocated signed amount'),
                          render: (_, r) => (
                            <Money value={r.remaining} currency={currency} />
                          ),
                        },
                      ]}
                    />
                    <p>
                      {t('系统期末余额', 'System closing')}:{' '}
                      <Money
                        value={balance.evidence.systemClosing}
                        currency={currency}
                      />
                    </p>
                    <p>
                      {t('银行独有 / 系统独有', 'Bank-only / ledger-only')}:{' '}
                      <Money
                        value={balance.evidence.bankOnly}
                        currency={currency}
                      />{' '}
                      /{' '}
                      <Money
                        value={balance.evidence.ledgerOnly}
                        currency={currency}
                      />
                    </p>
                    <p>
                      {t('调节后差额', 'Adjusted difference')}:{' '}
                      <Money
                        value={balance.adjustedDifference}
                        currency={currency}
                      />
                    </p>
                    <Button
                      disabled={!balance.canComplete || balance.saved}
                      loading={balanceAction.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: t(
                            '保存余额调节快照？',
                            'Save balance snapshot?',
                          ),
                          onOk: () =>
                            balanceAction
                              .mutateAsync(true)
                              .catch(() => undefined),
                        })
                      }
                    >
                      {t('完成并保存快照', 'Complete and save snapshot')}
                    </Button>
                  </div>
                )}
              </>
            ),
          },
        ]}
      />
      <Drawer
        title={t('人工复核与匹配解释', 'Review & match explanation')}
        open={!!selected}
        onClose={() => setSelected(undefined)}
        width="min(900px, 100vw)"
      >
        {candidates.isError ? (
          <ErrorState
            error={candidates.error}
            retry={() => void candidates.refetch()}
          />
        ) : (
          <>
            <div className="reconciliation-columns">
              <Card
                size="small"
                loading={candidates.isPending}
                title={t('来源流水', 'Source statement')}
              >
                <Sensitive>
                  {displayStatement?.merchant} · {displayStatement?.reference}
                </Sensitive>
                <p>
                  <Money
                    value={displayStatement?.amount || '0'}
                    currency={currency}
                  />
                </p>
                {candidates.data?.statement.postedAt && (
                  <p>
                    {t('银行入账时间', 'Bank posting time')}:{' '}
                    {candidates.data.statement.postedAt}
                  </p>
                )}
                {candidates.data?.statement.counterpartyHint && (
                  <p>
                    {t('对方账号尾号', 'Counterparty suffix')}:{' '}
                    <Sensitive>
                      {candidates.data.statement.counterpartyHint}
                    </Sensitive>
                  </p>
                )}
                {candidates.data?.statement.paymentSource && (
                  <p>
                    {t('付款来源', 'Payment source')}:{' '}
                    <Sensitive>
                      {candidates.data.statement.paymentSource}
                    </Sensitive>
                  </p>
                )}
                <Link to={`/import?job=${displayStatement?.importJobId}`}>
                  {t('查看原始导入批次', 'View original import batch')}
                </Link>
              </Card>
              <Card size="small" title={t('系统交易候选', 'Ledger candidates')}>
                <p>
                  {t(
                    '候选最多100笔、日期范围前后7天。没有候选不代表账本中绝对不存在交易。',
                    'At most 100 candidates within ±7 days. No candidate does not prove a missing ledger transaction.',
                  )}
                </p>
              </Card>
            </div>
            {candidates.data?.truncated && (
              <Alert
                type="warning"
                message={t(
                  '候选已截断，请人工核查交易中心',
                  'Candidate limit reached; inspect the transaction center',
                )}
              />
            )}
            {candidates.data?.competing && (
              <Alert
                type="warning"
                message={t(
                  '存在竞争候选，必须人工核查',
                  'Competing candidates require manual review',
                )}
              />
            )}
            {candidates.data && (
              <CorrectionPanel
                key={
                  candidates.data.statement.id +
                  ':' +
                  candidates.data.statement.version
                }
                statement={candidates.data.statement}
              />
            )}
            {candidates.data && (
              <SourceTrustPanel
                accountId={accountId}
                importJobId={candidates.data.statement.importJobId}
              />
            )}
            <Input.TextArea
              aria-label={t('复核说明', 'Review reason')}
              className="mt20 mb16"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                '确认、撤销或忽略均需说明',
                'Reason required for confirm, revoke or ignore',
              )}
            />
            <Space wrap className="mb16">
              <Button
                disabled={
                  !reason.trim() || resolve.isPending || !candidates.data
                }
                onClick={() => resolve.mutate('Pending')}
              >
                {t('撤销 / 重新匹配', 'Revoke / rematch')}
              </Button>
              <Button
                disabled={
                  !reason.trim() || resolve.isPending || !candidates.data
                }
                onClick={() => resolve.mutate('Ignored')}
              >
                {t('忽略并保留证据', 'Ignore and retain evidence')}
              </Button>
            </Space>
            <Button
              className="mb16"
              disabled={
                !selected ||
                !candidates.data ||
                Object.keys(batchItems).length >= 20
              }
              onClick={() => {
                if (selected)
                  setBatchItems((items) => ({
                    ...items,
                    [selected.id]: {
                      id: selected.id,
                      version:
                        candidates.data?.statement.version || selected.version,
                    },
                  }));
              }}
            >
              {t('加入批量忽略或撤销', 'Add to batch ignore or revoke')}
            </Button>
            {candidates.data?.candidates.length === 0 && (
              <Empty
                description={t(
                  '没有候选，请检查遗漏或日期范围',
                  'No candidates; check missing entries or date range',
                )}
              />
            )}
            <Select
              className="mb16"
              style={{ width: '100%' }}
              aria-label={t(
                '选择批量确认候选',
                'Select candidate for batch confirmation',
              )}
              placeholder={t(
                '人工选择候选并加入批量确认',
                'Select a candidate for batch confirmation',
              )}
              value={
                selected ? batchItems[selected.id]?.transactionId : undefined
              }
              disabled={
                candidates.data?.statement.state !== 'Pending' ||
                Object.keys(batchItems).length >= 20
              }
              options={candidates.data?.candidates.map((c) => ({
                value: c.transactionId,
                label: `${c.merchant || c.type} · ${c.amount} · ${c.score}/100`,
                disabled:
                  c.confidence === 'Conflict' ||
                  c.reasons.includes('AmountDifference'),
              }))}
              onChange={(id) => {
                const c = candidates.data?.candidates.find(
                  (c) => c.transactionId === id,
                );
                if (c && selected && candidates.data)
                  setBatchItems((items) => ({
                    ...items,
                    [selected.id]: {
                      id: selected.id,
                      version: candidates.data!.statement.version,
                      transactionId: c.transactionId,
                      transactionVersion: c.version,
                    },
                  }));
              }}
            />
            <Table<Candidate>
              rowKey="transactionId"
              loading={candidates.isPending}
              dataSource={candidates.data?.candidates}
              pagination={false}
              scroll={{ x: 650 }}
              columns={[
                {
                  title: t('内部交易', 'Ledger transaction'),
                  render: (_, r) => (
                    <>
                      <Link to={`/transactions/${r.transactionId}`}>
                        <Sensitive>{r.merchant || r.type}</Sensitive>
                      </Link>
                      <p>
                        <Money value={r.amount} currency={currency} />
                      </p>
                    </>
                  ),
                },
                {
                  title: t('解释', 'Explanation'),
                  render: (_, r) => (
                    <>
                      <Tag>
                        {confidence[r.confidence]} · {r.score}/100
                      </Tag>
                      <p>
                        {t('日期偏差（天）', 'Date deviation (days)')}:{' '}
                        {r.dateDeviation}
                      </p>
                      {r.reasons.map((s) => (
                        <div key={s}>{reasons[s] || s}</div>
                      ))}
                      {candidates.data?.ruleMatches
                        .find((x) => x.transactionId === r.transactionId)
                        ?.rules.map((rule) => (
                          <Tag key={rule.id}>{rule.name}</Tag>
                        ))}
                    </>
                  ),
                },
                {
                  title: t('确认', 'Confirm'),
                  render: (_, r) => (
                    <Button
                      disabled={
                        !reason.trim() ||
                        candidates.data?.statement.state !== 'Pending' ||
                        r.reasons.includes('AmountDifference') ||
                        r.confidence === 'Conflict'
                      }
                      loading={confirm.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: t('确认此匹配关系？', 'Confirm this match?'),
                          content: t(
                            '只保存核对关系，系统将重新校验双方版本。',
                            'Saves a match only; both versions will be rechecked.',
                          ),
                          onOk: () =>
                            confirm.mutateAsync(r).catch(() => undefined),
                        })
                      }
                    >
                      {t('确认匹配', 'Confirm match')}
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
        <h3>{t('匹配历史', 'Match history')}</h3>
        {history.data?.events?.map((e, i) => (
          <Card size="small" key={i}>
            <p>
              {e.at} ·{' '}
              {e.action === 'CorrectNormalizedFields'
                ? t('修正规范化字段', 'Corrected normalized fields')
                : `${typeof e.before === 'string' ? e.before : ''} → ${typeof e.after === 'string' ? e.after : ''}`}
            </p>
            <Sensitive>{e.reason}</Sensitive>
          </Card>
        ))}
        {history.isError ? (
          <ErrorState
            error={history.error}
            retry={() => void history.refetch()}
          />
        ) : (
          history.data?.items.map((h) => (
            <Card size="small" key={h.id}>
              <Tag color={h.conflict ? 'red' : undefined}>{h.state}</Tag>
              {h.confirmationMode && (
                <Tag>
                  {h.confirmationMode === 'RuleAutomatic'
                    ? t('规则自动确认', 'Automatic rule confirmation')
                    : t('人工确认', 'Manual confirmation')}
                </Tag>
              )}
              {h.conflict &&
                t(
                  '原交易已修改或删除，请撤销重核',
                  'Ledger transaction changed or deleted; revoke and review',
                )}
              <p>
                {h.createdAt} · {h.engineVersion}
              </p>
              <Sensitive>{h.reason}</Sensitive>
            </Card>
          ))
        )}
        <Space className="mt20">
          <Button
            disabled={historyPage === 1}
            onClick={() => setHistoryPage((p) => p - 1)}
          >
            {t('上一页', 'Previous')}
          </Button>
          <span>{historyPage}</span>
          <Button
            disabled={
              historyPage * 20 >=
              Math.max(history.data?.total || 0, history.data?.eventTotal || 0)
            }
            onClick={() => setHistoryPage((p) => p + 1)}
          >
            {t('下一页', 'Next')}
          </Button>
        </Space>
      </Drawer>
    </Card>
  );
}
