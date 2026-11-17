import {
  suggestImportMapping,
  standardIncomeExpenseHeaders,
} from '../features/imports/mapping';
export { suggestImportMapping } from '../features/imports/mapping';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Steps,
  Table,
  Tag,
  Upload,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { importApi } from '../api/operations';
import { accountApi } from '../api/finance';
import { preferredAccount } from '../utils/finance';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { ErrorState } from '../components/Feedback';
import { Money } from '../components/Money';
import { ImportExecutionHistory } from '../features/imports/ImportExecutionHistory';
import { ImportDuplicateReview } from '../features/imports/ImportDuplicateReview';
import { ImportCleaningPanel } from '../features/imports/ImportCleaningPanel';
import { ImportJobHistory } from '../features/imports/ImportJobHistory';
import { formatDate, minor } from '../utils/finance';
import {
  transactionDisplayLabel,
  transactionLabels,
} from '../constants/mappings';
import { useUI } from '../stores/ui';
import type {
  ApiError,
  ImportJob,
  ImportMapping,
  ImportRow,
  ImportRowPatch,
  ImportSource,
} from '../types';
const mappingFields: {
  key: keyof ImportMapping;
  label: string;
  required?: boolean;
}[] = [
  {
    key: 'occurredAt',
    get label() {
      return tr('日期时间');
    },
    required: true,
  },
  {
    key: 'amount',
    get label() {
      return tr('金额');
    },
    required: true,
  },
  {
    key: 'type',
    get label() {
      return tr('交易类型');
    },
    required: true,
  },
  {
    key: 'merchant',
    get label() {
      return tr('商户/对象');
    },
  },
  {
    key: 'productName',
    get label() {
      return tr('商品');
    },
  },
  {
    key: 'category2',
    get label() {
      return tr('二级分类');
    },
  },
  {
    key: 'category3',
    get label() {
      return tr('三级分类（可空）');
    },
  },
  {
    key: 'discountAmount',
    get label() {
      return tr('优惠金额');
    },
  },
  {
    key: 'note',
    get label() {
      return tr('备注');
    },
  },
  {
    key: 'category',
    get label() {
      return tr('分类');
    },
  },
  {
    key: 'externalId',
    get label() {
      return tr('订单/流水号');
    },
  },
  {
    key: 'status',
    get label() {
      return tr('交易状态');
    },
  },
  {
    key: 'postedAt',
    get label() {
      return tr('银行入账日期');
    },
  },
  {
    key: 'counterpartyAccount',
    get label() {
      return tr('对方账号');
    },
  },
  {
    key: 'paymentSource',
    get label() {
      return tr('付款来源');
    },
  },
  {
    key: 'statementDirection',
    get label() {
      return tr('流水方向');
    },
  },
  {
    key: 'currency',
    get label() {
      return tr('币种');
    },
  },
  {
    key: 'account',
    get label() {
      return tr('转出/资金账户');
    },
  },
  {
    key: 'toAccount',
    get label() {
      return tr('转入账户');
    },
  },
  {
    key: 'fee',
    get label() {
      return tr('手续费');
    },
  },
  {
    key: 'feeCategory',
    get label() {
      return tr('手续费分类');
    },
  },
  {
    key: 'receivedAmount',
    get label() {
      return tr('到账金额');
    },
  },
  {
    key: 'exchangeRate',
    get label() {
      return tr('汇率');
    },
  },
];
export default function ImportPage() {
  useLocale();
  const [params, setParams] = useSearchParams();
  const id = params.get('job') || undefined;
  const [source, setSource] = useState<ImportSource>('CSV');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const [remapping, setRemapping] = useState(false);
  const [batchCategory, setBatchCategory] = useState<string>();
  const [editing, setEditing] = useState<ImportRow>();
  const [reviewing, setReviewing] = useState<ImportRow>();
  const [mappingForm] = Form.useForm<{
    accountId: string;
    mapping: ImportMapping;
  }>();
  const [rowForm] = Form.useForm<ImportRowPatch>();
  const editType = Form.useWatch('type', rowForm);
  const editAccount = Form.useWatch('accountId', rowForm);
  const key = useRef(crypto.randomUUID());
  const initialized = useRef<string | undefined>(undefined);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['imports', id],
    queryFn: () => importApi.get(id!),
    enabled: !!id,
  });
  const accountOptions = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const job = q.data;
  const statementMode =
    params.get('purpose') === 'reconciliation' ||
    job?.purpose === 'Reconciliation' ||
    job?.reconciliationOnly === true;
  const rows = useQuery({
    queryKey: ['importRows', id, page, status, job?.version],
    queryFn: () => importApi.rows(id!, page, status),
    enabled: !!job && job.state !== 'Uploaded',
  });
  useEffect(() => {
    if (job && accountOptions.data && initialized.current !== job.id) {
      initialized.current = job.id;
      mappingForm.setFieldsValue({
        accountId:
          (accountOptions.data.some((a) => a.id === params.get('accountId'))
            ? params.get('accountId')!
            : undefined) ||
          job.accountId ||
          preferredAccount(
            accountOptions.data!,
            useUI.getState().defaultAccount,
          ),
        mapping:
          job.mapping && Object.keys(job.mapping).length
            ? job.mapping
            : suggestImportMapping(job.headers),
      });
    }
  }, [job, mappingForm, accountOptions.data, params]);
  const apply = (data: ImportJob) => {
    cache.setQueryData(['imports', data.id], data);
    void cache.invalidateQueries({ queryKey: ['importRows', data.id] });
    void cache.invalidateQueries({ queryKey: ['importAttempts', data.id] });
  };
  const upload = useMutation({
    mutationFn: (file: File) => importApi.upload(file, source),
    onSuccess: (data) => {
      apply(data);
      setParams({
        job: data.id,
        ...(statementMode
          ? {
              purpose: 'reconciliation',
              ...(params.get('accountId')
                ? { accountId: params.get('accountId')! }
                : {}),
            }
          : {}),
      });
      setPage(1);
      key.current = crypto.randomUUID();
      message.success(tr('文件已解析，请核对字段映射'));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const map = useMutation({
    mutationFn: (v: { accountId: string; mapping: ImportMapping }) =>
      statementMode
        ? importApi.map(
            id!,
            v.mapping,
            v.accountId,
            job!.version,
            'Reconciliation',
          )
        : importApi.map(id!, v.mapping, v.accountId, job!.version),
    onSuccess: (data) => {
      apply(data);
      setRemapping(false);
      setPage(1);
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const patch = useMutation({
    mutationFn: (v: ImportRowPatch) =>
      importApi.patch(id!, editing!.id, v, job!.version),
    onSuccess: (data) => {
      apply(data);
      setEditing(undefined);
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const batch = useMutation({
    mutationFn: () => importApi.categorize(id!, batchCategory!, job!.version),
    onSuccess: apply,
    onError: (e: ApiError) => message.error(e.message),
  });
  const commit = useMutation({
    mutationFn: () => importApi.commit(id!, job!.version, key.current),
    onSuccess: async (data) => {
      apply(data);
      await Promise.all(
        [
          'transactions',
          'accounts',
          'dashboard',
          'reports',
          'budgets',
          'directory',
        ].map((k) => cache.invalidateQueries({ queryKey: [k] })),
      );
      message.success(tr('已导入 {0} 笔交易', data.imported));
    },
    onError: (e: ApiError) => {
      message.error(e.message);
      void q.refetch();
      void cache.invalidateQueries({ queryKey: ['importAttempts', id] });
    },
  });
  const recheck = useMutation({
    mutationFn: () => importApi.recheck(id!, job!.version),
    onSuccess: (data) => {
      apply(data);
      key.current = crypto.randomUUID();
      message.success(tr('预览已重新检查，请核对后再确认'));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const busy =
    remapping ||
    map.isPending ||
    patch.isPending ||
    batch.isPending ||
    commit.isPending ||
    recheck.isPending;
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('账单，一次整理好')}</PageTitle>
        </div>
        {job && (
          <Button disabled={busy} onClick={() => setParams({})}>
            {tr('导入另一份账单')}
          </Button>
        )}
      </div>
      {job && job.state !== 'Uploaded' && (
        <Alert
          className="mb16"
          type="info"
          showIcon
          message={
            <Link
              to={`/reconciliation?accountId=${job.accountId || ''}&jobId=${job.id}`}
            >
              {tr('账户对账')} · {job.fileName}
            </Link>
          }
        />
      )}
      <Steps
        size="small"
        className="mb16"
        current={
          !job
            ? 0
            : job.state === 'Uploaded'
              ? 1
              : job.state === 'Preview'
                ? 2
                : 4
        }
        items={[
          '上传文件',
          '字段映射',
          '预览 · 去重 · 分类',
          '确认导入',
          '完成',
        ].map((title) => ({ title }))}
      />
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {!job && (
        <Card title={tr('选择账单来源')}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Select
              aria-label={tr('账单来源')}
              style={{ width: 220 }}
              value={source}
              onChange={setSource}
              options={['CSV', 'Excel', 'Alipay', 'WeChat', 'Bank'].map(
                (value) => ({
                  value,
                  label: {
                    CSV: '通用 CSV',
                    Excel: 'Excel 工作簿',
                    Alipay: '支付宝账单',
                    WeChat: '微信账单',
                    Bank: '银行卡账单',
                  }[value],
                }),
              )}
            />
            <Upload.Dragger
              accept=".csv,.xlsx"
              multiple={false}
              showUploadList={false}
              disabled={upload.isPending}
              beforeUpload={(file) => {
                upload.mutate(file);
                return false;
              }}
            >
              <p>
                {upload.isPending
                  ? tr('正在上传并解析…')
                  : tr('点击或拖入 CSV / XLSX 账单')}
              </p>
              <p>
                {import.meta.env.VITE_ENABLE_MOCK === 'true'
                  ? tr(
                      '演示文件最多 5 MB、2000 笔；CSV 支持 UTF-8 与 GB18030。Excel 读取第一个工作表。',
                    )
                  : tr(
                      '单文件最多 10 MB、5000 笔；CSV 支持 UTF-8 与 GB18030。Excel 读取第一个工作表。',
                    )}
              </p>
            </Upload.Dragger>
            <a href="/import-template.csv" download>
              {tr('下载标准 CSV 模板')}
            </a>
            <p>
              {tr(
                '标准模板仅支持支出、收入。金额为实付/实收，优惠金额只用于支出，原价=金额+优惠，不再扣减账户金额。分类填写一级及二级，三级可留空；交易单号选填。商品用于支出，收入说明请填备注。交易成功/已入账可导入，失败/关闭/取消会排除，处理中或未知状态须核对。',
              )}
            </p>
            <a href="/transfer-import-template.csv" download>
              {tr('下载转账 / 充值 / 提现模板')}
            </a>
            <p>
              {tr(
                '模板中的账户请替换为已有账户的唯一名称、编号或ID。金额为转账本金，手续费额外从转出账户扣除；有手续费时须填写支出类手续费分类。同一笔转账只导入一次，避免银行与钱包账单重复入账。',
              )}
            </p>
          </Space>
        </Card>
      )}
      {!job && <ImportJobHistory />}
      {job && (job.state === 'Uploaded' || remapping) && (
        <Card title={tr('字段映射 · {0}', job.fileName)}>
          <p>
            {tr('共')}
            {job.total}{' '}
            {tr(
              statementMode
                ? '行。外部流水时间按上海时区解析，金额按明确类型或流水方向规范化，不执行正式入账。'
                : '行。无时区的账单时间按 Asia/Shanghai\r\n            解析；金额不能为负。',
            )}
          </p>
          <Form
            name="importMapping"
            form={mappingForm}
            layout="vertical"
            initialValues={{
              accountId:
                params.get('accountId') ||
                job.accountId ||
                preferredAccount(
                  accountOptions.data || [],
                  useUI.getState().defaultAccount,
                ),
            }}
            onFinish={(v) => map.mutate(v)}
            onFinishFailed={({ errorFields }) =>
              message.error(errorFields[0]?.errors[0] || tr('请核对字段映射'))
            }
          >
            <Form.Item
              name="accountId"
              label={tr('默认资金账户')}
              rules={[{ required: true, message: tr('请选择账户') }]}
            >
              <AccountSelector />
            </Form.Item>
            <p>
              {tr(
                '默认账户仅用于转出账户列为空的记录；已填写但无法匹配的账户会标为异常。',
              )}
            </p>
            <Row gutter={16}>
              {mappingFields
                .filter(
                  (field) =>
                    !standardIncomeExpenseHeaders(job.headers) ||
                    ![
                      'toAccount',
                      'fee',
                      'feeCategory',
                      'receivedAmount',
                      'exchangeRate',
                    ].includes(field.key),
                )
                .map((field) => (
                  <Col xs={24} md={12} lg={8} key={field.key}>
                    <Form.Item
                      name={['mapping', field.key]}
                      label={field.label}
                      rules={[
                        {
                          required: field.required,
                          message: tr('请选择来源列'),
                        },
                      ]}
                    >
                      <Select
                        allowClear={!field.required}
                        options={job.headers.map((value) => ({
                          value,
                          label: value,
                        }))}
                        placeholder={tr('不映射')}
                      />
                    </Form.Item>
                  </Col>
                ))}
            </Row>
            <Button htmlType="submit" type="primary" loading={map.isPending}>
              {statementMode ? tr('预览外部流水') : tr('生成预览并检测重复')}
            </Button>
          </Form>
          {hidden ? (
            <p>{tr('隐私模式已隐藏原始样例。')}</p>
          ) : (
            <Table
              className="mt20"
              size="small"
              rowKey="index"
              pagination={false}
              scroll={{ x: 900 }}
              dataSource={job.sampleRows.map((values, index) => ({
                index,
                values,
              }))}
              columns={job.headers.map((title, index) => ({
                title,
                render: (_: unknown, row: { values: string[] }) =>
                  row.values[index],
              }))}
            />
          )}
        </Card>
      )}
      {job && job.state !== 'Uploaded' && (
        <>
          <Row gutter={[12, 12]} className="mb16">
            {[
              ['总记录', job.summary?.total],
              ['可导入', job.summary?.ready],
              ['重复', job.summary?.duplicate],
              ['疑似 · 待确认', job.summary?.suspected],
              ['已排除 / 跳过', job.summary?.skipped],
              ['异常', job.summary?.invalid],
              ['待整理', job.summary?.needsReview],
            ].map(([label, value]) => (
              <Col xs={12} md={4} key={label}>
                <Card size="small">
                  <span className="muted">{label}</span>
                  <h2>{value}</h2>
                </Card>
              </Col>
            ))}
          </Row>
          {job.state === 'Completed' ? (
            <Alert
              type="success"
              showIcon
              message={tr(
                '导入完成 · {0} 笔；跳过 {1} 笔',
                job.imported,
                (job.summary?.duplicate || 0) +
                  (job.summary?.invalid || 0) +
                  (job.summary?.skipped || 0),
              )}
              description={
                <Link to={`/transactions?importJobId=${job.id}`}>
                  {tr('查看本批次交易')}
                </Link>
              }
            />
          ) : (
            <Card>
              {job.requiresIdentityRecheck && (
                <Alert
                  className="mb16"
                  type="warning"
                  message={tr(
                    '重复检测规则已升级，请先重新检查旧预览；不会沿用旧弱指纹自动跳过记录。',
                  )}
                />
              )}
              <Space wrap className="mb16">
                <Button
                  disabled={
                    map.isPending || commit.isPending || job.sourceFrozen
                  }
                  onClick={() => setRemapping((v) => !v)}
                >
                  {remapping ? tr('取消') : tr('从原始数据重新映射')}
                </Button>
                <Button
                  disabled={busy}
                  loading={recheck.isPending}
                  onClick={() => recheck.mutate()}
                >
                  {tr('重新检查预览')}
                </Button>
                <Select
                  aria-label={tr('导入记录状态')}
                  value={status}
                  allowClear
                  placeholder={tr('全部记录')}
                  style={{ width: 150 }}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  options={[
                    { value: 'Ready', label: tr('可导入') },
                    { value: 'Duplicate', label: tr('重复') },
                    { value: 'Suspected', label: tr('疑似 · 待确认') },
                    { value: 'Skipped', label: tr('人工跳过') },
                    { value: 'Invalid', label: tr('异常') },
                  ]}
                />
                <div style={{ width: 230 }}>
                  <CategorySelector
                    ariaLabel="批量匹配分类"
                    value={batchCategory}
                    onChange={setBatchCategory}
                  />
                </div>
                <Button
                  disabled={!batchCategory || !job.summary?.needsReview || busy}
                  loading={batch.isPending}
                  onClick={() => batch.mutate()}
                >
                  {tr('批量应用到待整理消费')}
                </Button>
                <Button
                  type="primary"
                  loading={commit.isPending}
                  disabled={
                    statementMode ||
                    job.reconciliationOnly ||
                    (!job.summary?.ready && !job.summary?.skipped) ||
                    !!job.summary?.suspected ||
                    job.requiresIdentityRecheck ||
                    busy
                  }
                  onClick={() =>
                    modal.confirm({
                      title: tr('确认导入这份账单？'),
                      content: tr(
                        '将新增 {0} 笔，跳过 {1} 笔确定性重复、{2} 笔异常和 {3} 笔人工判定记录，{4} 笔保留待整理标记。账户余额和统计将同步变化。',
                        job.summary?.ready,
                        job.summary?.duplicate,
                        job.summary?.invalid,
                        job.summary?.skipped || 0,
                        job.summary?.needsReview,
                      ),
                      okText: tr('确认导入'),
                      onOk: () => commit.mutateAsync(),
                    })
                  }
                >
                  {tr('确认导入')}
                </Button>
              </Space>
              {rows.isError ? (
                <ErrorState error={rows.error} retry={() => rows.refetch()} />
              ) : (
                <Table<ImportRow>
                  rowKey="id"
                  loading={rows.isPending}
                  dataSource={rows.data?.items}
                  scroll={{ x: 2400 }}
                  pagination={{
                    current: page,
                    pageSize: 20,
                    total: rows.data?.total,
                    onChange: setPage,
                    showSizeChanger: false,
                  }}
                  columns={[
                    { title: tr('行号'), dataIndex: 'index', width: 70 },
                    {
                      title: tr('时间'),
                      width: 180,
                      render: (_, r) =>
                        r.occurredAt
                          ? formatDate(r.occurredAt, true)
                          : '无效日期',
                    },
                    {
                      title: tr('类型'),
                      width: 90,
                      render: (_, r) =>
                        r.type === 'Unknown'
                          ? tr('无法识别')
                          : transactionDisplayLabel({
                              type: r.type,
                              transferKind: r.transferKind,
                            }),
                    },
                    {
                      title: tr('账户流向'),
                      width: 220,
                      render: (_, r) => (
                        <Sensitive>
                          {accountOptions.data?.find(
                            (a) => a.id === r.accountId,
                          )?.name || tr('未匹配账户')}
                          {r.type === 'Transfer' && (
                            <>
                              {' '}
                              →{' '}
                              {accountOptions.data?.find(
                                (a) => a.id === r.toAccountId,
                              )?.name || tr('未匹配账户')}
                            </>
                          )}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr('手续费'),
                      width: 120,
                      render: (_, r) => (
                        <Money value={r.fee || '0'} currency={r.currency} />
                      ),
                    },
                    {
                      title: tr('商户'),
                      width: 180,
                      dataIndex: 'merchant',
                      render: (value: unknown) => (
                        <Sensitive>
                          {value == null ? '—' : String(value)}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr('商品'),
                      width: 160,
                      render: (_, r) => (
                        <Sensitive>{r.productName || '—'}</Sensitive>
                      ),
                    },
                    {
                      title: tr('备注'),
                      width: 180,
                      render: (_, r) => <Sensitive>{r.note || '—'}</Sensitive>,
                    },
                    {
                      title: tr('优惠金额'),
                      width: 120,
                      render: (_, r) => (
                        <Sensitive>
                          {r.discountAmount || '0.00'} {r.currency}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr('来源交易状态'),
                      width: 130,
                      render: (_, r) => (
                        <Sensitive>{r.sourceStatus || '—'}</Sensitive>
                      ),
                    },
                    {
                      title: tr('金额'),
                      width: 140,
                      render: (_, r) => (
                        <Money
                          value={
                            statementMode
                              ? (r.statementAmount ?? r.amount)
                              : r.amount
                          }
                          currency={r.currency}
                          type={
                            statementMode || r.type === 'Unknown'
                              ? undefined
                              : r.type
                          }
                        />
                      ),
                    },
                    {
                      title: tr('分类建议'),
                      width: 180,
                      render: (_, r) => (
                        <>
                          <Tag>{r.recommendation || tr('无建议')}</Tag>
                          {r.needsReview && (
                            <Tag color="orange">{tr('待整理')}</Tag>
                          )}
                        </>
                      ),
                    },
                    {
                      title: tr('结果'),
                      render: (_, r) => (
                        <>
                          <Tag
                            color={
                              r.status === 'Invalid'
                                ? 'orange'
                                : r.status === 'Duplicate'
                                  ? 'default'
                                  : 'green'
                            }
                          >
                            {r.status === 'Ready'
                              ? tr('可导入')
                              : r.status === 'Duplicate'
                                ? tr('确定性重复')
                                : r.status === 'Suspected'
                                  ? tr('疑似 · 待确认')
                                  : r.status === 'Skipped'
                                    ? tr(
                                        r.sourceExcluded
                                          ? '来源排除'
                                          : '人工跳过',
                                      )
                                    : tr('异常')}
                          </Tag>
                          <span>{r.issues.join('；')}</span>
                        </>
                      ),
                    },
                    {
                      title: tr('操作'),
                      render: (_, r) => (
                        <Space wrap>
                          {r.duplicateKind === 'Suspected' && (
                            <Button
                              disabled={busy}
                              onClick={() => setReviewing(r)}
                            >
                              {r.reviewDecision
                                ? tr('查看判定')
                                : tr('核对重复')}
                            </Button>
                          )}
                          <Button
                            disabled={busy || r.status === 'Duplicate'}
                            onClick={() => {
                              setEditing(r);
                              rowForm.setFieldsValue({
                                amount: r.amount,
                                productName: r.productName || '',
                                discountAmount: r.discountAmount || '0',
                                type: r.type,
                                accountId: r.accountId,
                                transferKind: r.transferKind || '',
                                fee: r.fee || '0',
                                feeCategoryId: r.feeCategoryId,
                                receivedAmount: r.receivedAmount,
                                exchangeRate: r.exchangeRate,
                                categoryId: r.categoryId,
                                toAccountId: r.toAccountId,
                                merchant: r.merchant,
                                note: r.note,
                                occurredAt: r.occurredAt,
                              });
                            }}
                          >
                            {tr('修改分类/类型')}
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}
        </>
      )}
      {job && job.state !== 'Uploaded' && (
        <ImportCleaningPanel
          key={`cleaning-${job.id}`}
          job={job}
          rows={rows.data?.items || []}
          changed={apply}
        />
      )}
      {job && job.state !== 'Uploaded' && (
        <ImportExecutionHistory
          key={`history-${job.id}`}
          id={job.id}
          completed={job.state === 'Completed'}
        />
      )}
      {job && (
        <ImportDuplicateReview
          row={reviewing}
          job={job}
          busy={busy}
          close={() => setReviewing(undefined)}
          applied={apply}
        />
      )}
      <Modal
        title={tr('修改导入记录')}
        open={!!editing}
        forceRender
        onCancel={() => setEditing(undefined)}
        confirmLoading={patch.isPending}
        onOk={() => rowForm.validateFields().then((v) => patch.mutate(v))}
      >
        <Form form={rowForm} layout="vertical">
          <Form.Item name="merchant" label={tr('商户')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="productName" label={tr('商品（仅支出）')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="discountAmount"
            label={tr('优惠金额')}
            extra={tr(
              '金额为实付/实收；优惠只记录支出原价信息，不再次扣款。收入须为0或留空。',
            )}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="note" label={tr('备注')}>
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          <Form.Item name="occurredAt" label={tr('日期时间')}>
            <Input placeholder="2026-10-19T12:00:00+08:00" />
          </Form.Item>
          <Form.Item
            name="type"
            label={tr('类型')}
            rules={[{ required: true }]}
          >
            <Select
              options={(job && standardIncomeExpenseHeaders(job.headers)
                ? ['Expense', 'Income']
                : ['Expense', 'Income', 'Transfer']
              ).map((value) => ({
                value,
                label:
                  transactionLabels[value as 'Expense' | 'Income' | 'Transfer'],
              }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr('导入金额')}
            rules={[
              {
                validator: (_, v: string) => {
                  try {
                    return minor(v) > 0n
                      ? Promise.resolve()
                      : Promise.reject(new Error('金额必须大于0'));
                  } catch {
                    return Promise.reject(new Error('金额无效'));
                  }
                },
              },
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item
            name="accountId"
            label={tr('转出/资金账户')}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          {editType === 'Transfer' && (
            <>
              <Form.Item name="transferKind" label={tr('转账用途')}>
                <Select
                  options={[
                    { value: '', label: tr('转账') },
                    { value: 'TopUp', label: tr('充值') },
                    { value: 'Withdrawal', label: tr('提现') },
                  ]}
                />
              </Form.Item>
              <Form.Item name="fee" label={tr('手续费')}>
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="feeCategoryId" label={tr('手续费分类')}>
                <CategorySelector kind="Expense" />
              </Form.Item>
              <Form.Item
                name="receivedAmount"
                label={tr('到账金额（跨币种必填）')}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="exchangeRate" label={tr('汇率（跨币种必填）')}>
                <Input inputMode="decimal" />
              </Form.Item>
            </>
          )}
          {editType === 'Transfer' ? (
            <Form.Item
              name="toAccountId"
              label={tr('转入账户')}
              rules={[{ required: true }]}
            >
              <AccountSelector exclude={editAccount} />
            </Form.Item>
          ) : (
            <Form.Item
              name="categoryId"
              label={tr('二级或三级分类')}
              rules={[{ required: true }]}
            >
              <CategorySelector
                kind={editType === 'Income' ? 'Income' : 'Expense'}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
