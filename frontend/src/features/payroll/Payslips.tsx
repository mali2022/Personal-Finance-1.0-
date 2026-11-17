import { CURRENCY_CODES } from '../../constants/currencies';
import { PayrollDeleteButton } from './DeleteButton';
import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Pagination,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import { Select } from '../../components/TouchSelect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { saveBlob } from '../../utils/download';
import { useUI } from '../../stores/ui';
import { Fields, itemsField, defaultItem, type Field } from './Forms';
import { usePayrollCatalog } from './catalog';
import { payrollApi, value, type Row, type Slip, type Page } from './api';
import { usePayMobile, usePayLabel, usePayText } from './text';
export function printPayroll(
  title: string,
  headers: string[],
  rows: string[][],
  notes: string[],
) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (x) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[x]!,
    );
  const win = window.open('', '_blank');
  if (!win)
    throw { message: '请允许此站点打开打印窗口 / Allow the print window' };
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4;margin:18mm}body{font:13px Arial,"Microsoft YaHei",sans-serif;color:#172033}h1{font-size:25px;margin-bottom:7px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{background:#edf1ff}tr{break-inside:avoid}.note{font-size:11px;color:#586579;line-height:1.7}button{padding:10px 18px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">打印 / 保存为 PDF · Print / Save as PDF</button><h1>${escape(title)}</h1>${notes.map((n) => `<p class="note">${escape(n)}</p>`).join('')}<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`,
  );
  win.document.close();
  return win;
}
const slipFields: Field[] = [
  {
    name: 'month',
    label: ['工资归属月份', 'Earning month'],
    type: 'month',
    required: true,
  },
  {
    name: 'payDate',
    label: ['实际／计划发薪日期', 'Actual / planned pay date'],
    type: 'date',
    required: true,
  },
  {
    name: 'employer',
    label: [
      '单位名称（选择工作经历后以其为准）',
      'Employer (employment takes precedence)',
    ],
    required: true,
  },
  {
    name: 'employmentId',
    label: ['工作经历', 'Employment'],
    type: 'ref',
    ref: 'employments',
  },
  {
    name: 'planId',
    label: ['薪酬方案版本', 'Plan version'],
    type: 'ref',
    ref: 'plans',
  },
  {
    name: 'accountId',
    label: ['关联银行账户', 'Bank account'],
    type: 'ref',
    ref: 'accounts',
  },
  {
    name: 'currency',
    label: ['原始币种', 'Currency'],
    type: 'select',
    options: CURRENCY_CODES,
    required: true,
  },
  itemsField,
  { name: 'note', label: ['备注', 'Notes'], type: 'textarea' },
  {
    name: 'correctionReason',
    label: [
      '更正原因（已确认工资条必填）',
      'Correction reason (required after confirmation)',
    ],
    type: 'textarea',
  },
];
export function Payslips({
  reconciliation = false,
}: {
  reconciliation?: boolean;
}) {
  const mobile = usePayMobile();
  const t = usePayText();
  const label = usePayLabel();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const catalog = usePayrollCatalog();
  const [month, setMonth] = useState('');
  const [employment, setEmployment] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Slip | null>();
  const [detailId, setDetailId] = useState<string>();
  const [form] = Form.useForm();
  const selectedEmployment = Form.useWatch('employmentId', form) as
    string | undefined;
  useEffect(() => {
    const job = catalog.employments.data?.find(
      (x) => x.id === selectedEmployment,
    );
    if (job) form.setFieldValue('employer', value(job, 'employerName'));
  }, [selectedEmployment, catalog.employments.data, form]);
  const [dialog, setDialog] = useState<{
    type: 'copy' | 'generate';
    id?: string;
  }>();
  const [actionForm] = Form.useForm();
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState(false);
  const [manualTransaction, setManualTransaction] = useState('');
  const [tolerance, setTolerance] = useState(7);
  const list = useQuery({
    queryKey: ['payroll-center', 'slips', month, employment, state, page],
    queryFn: () =>
      payrollApi.get<Page<Slip>>('/slips', {
        month,
        employmentId: employment,
        state,
        page,
        pageSize: 12,
      }),
  });
  const detail = useQuery({
    queryKey: ['payroll-center', 'slip', detailId],
    queryFn: () => payrollApi.get<Slip>('/slips/' + detailId),
    enabled: !!detailId,
  });
  const history = useQuery({
    queryKey: ['payroll-center', 'history', detailId],
    queryFn: () => payrollApi.get<Row[]>('/slips/' + detailId + '/history'),
    enabled: !!detailId,
  });
  const matches = useQuery({
    queryKey: ['payroll-center', 'matches', detailId, tolerance],
    queryFn: () =>
      payrollApi.get<{ items: Row[]; expected: string }>(
        '/slips/' + detailId + '/matches',
        { tolerance },
      ),
    enabled: !!detailId,
  });
  const refresh = () =>
    void cache.invalidateQueries({ queryKey: ['payroll-center'] });
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      version,
      method,
    }: {
      path: string;
      body: unknown;
      version?: string;
      method?: 'put' | 'post';
    }) => payrollApi.write(path, body, version, method),
    onSuccess: () => {
      refresh();
      message.success(
        t('已保存，未重复记账', 'Saved without posting another transaction'),
      );
    },
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      payrollApi.write(
        '/slips' + (editing ? '/' + editing.id : ''),
        {
          ...body,
          employmentId: body.employmentId || null,
          planId: body.planId || null,
          accountId: body.accountId || null,
        },
        editing?.version,
        editing ? 'put' : 'post',
      ),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
      message.success(t('工资条已存为草稿', 'Payslip saved as draft'));
    },
  });
  const deleteButton = (row: Slip) => (
    <PayrollDeleteButton
      resource="slips"
      row={row}
      onDeleted={() => {
        setPage(1);
        if (detailId === row.id) setDetailId(undefined);
        if (editing?.id === row.id) setEditing(undefined);
      }}
    />
  );
  const exportSlip = () => {
    if (!detail.data) return;
    const d = detail.data;
    try {
      printPayroll(
        `${t('工资条', 'Payslip')} · ${d.month}`,
        [
          t('编码', 'Code'),
          t('项目', 'Item'),
          t('类型', 'Type'),
          t('金额', 'Amount'),
          t('计税属性', 'Tax treatment'),
        ],
        d.items.map((x) => [
          x.code,
          x.name,
          label(x.kind),
          x.amount,
          label(x.taxTreatment),
        ]),
        [
          d.employer,
          `${t('发薪日期', 'Pay date')}: ${d.payDate} · ${d.currency}`,
          `${t('应发 / 扣款 / 实发', 'Gross / deductions / net')}: ${d.gross} / ${d.deduction} / ${d.net}`,
          `${t('版本', 'Version')}: ${d.version} · ${label(d.state)}`,
          t(
            '工资条为管理明细，不是新增银行入账。请在打印窗口选择保存为PDF。',
            'Payslip records do not post bank income. Select Save as PDF in the print window.',
          ),
        ],
      );
    } catch (e) {
      message.error(String((e as { message: string }).message));
    }
  };
  const openEdit = (d: Slip | null) => {
    save.reset();
    setEditing(d);
    form.resetFields();
    form.setFieldsValue({
      employer: '',
      currency: 'CNY',
      note: '',
      correctionReason: '',
      employmentId: null,
      planId: null,
      accountId: null,
      ...d,
      items: d
        ? d.items.map((x, i) => ({
            ...x,
            code: x.code === 'Legacy' ? `LEGACY_${i}` : x.code,
          }))
        : [{ ...defaultItem, name: t('基本工资', 'Base pay'), code: 'BASE' }],
    });
  };
  const link = (transactionId: string) =>
    mutation.mutate({
      path: '/slips/' + detailId + '/reconcile',
      version: detail.data?.version,
      body: {
        transactionId,
        manualConfirmed: manual,
        dateToleranceDays: tolerance,
        reason,
      },
    });
  return (
    <div className="payroll-stack">
      <Card>
        <div className="payroll-toolbar">
          <Input
            type="month"
            aria-label={t('工资月份筛选', 'Earning month filter')}
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
            style={{ width: 170 }}
          />
          <Select
            allowClear
            placeholder={t('全部工作经历', 'All employment')}
            value={employment || undefined}
            onChange={(v) => {
              setEmployment(v || '');
              setPage(1);
            }}
            options={catalog.employments.data?.map((e) => ({
              value: e.id,
              label: value(e, 'employerName') + ' · ' + value(e, 'position'),
            }))}
          />
          <Select
            allowClear
            placeholder={t('全部状态', 'All statuses')}
            value={state || undefined}
            onChange={(v) => {
              setState(v || '');
              setPage(1);
            }}
            options={[
              'Draft',
              'PendingReview',
              'Confirmed',
              'Paid',
              'Reconciled',
              'Voided',
            ].map((v) => ({ value: v, label: label(v) }))}
          />
          <Button
            onClick={() => {
              setDialog({ type: 'generate' });
              actionForm.resetFields();
            }}
          >
            {t('从方案生成', 'Generate from plan')}
          </Button>
          <Button type="primary" onClick={() => openEdit(null)}>
            {t('新增工资条', 'New payslip')}
          </Button>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : mobile ? (
          <>
            <List
              loading={list.isPending}
              dataSource={list.data?.items || []}
              renderItem={(d) => (
                <List.Item
                  style={{ display: 'block', border: 0, padding: '8px 0' }}
                >
                  <Card
                    size="small"
                    title={d.month}
                    extra={
                      <Tag color={d.state === 'Reconciled' ? 'green' : 'blue'}>
                        {label(d.state)}
                      </Tag>
                    }
                  >
                    <strong>{d.employer}</strong>
                    <p>
                      {t('发薪日期', 'Pay date')}: {d.payDate} · {d.currency}
                    </p>
                    <div className="payroll-detail-grid">
                      <span>
                        {t('应发', 'Gross')}: <Sensitive>{d.gross}</Sensitive>
                      </span>
                      <span>
                        {t('实发', 'Net')}: <Sensitive>{d.net}</Sensitive>
                      </span>
                      <span>
                        {t('关联到账', 'Linked receipts')}:{' '}
                        <Sensitive>{d.actual}</Sensitive>
                      </span>
                      <span>
                        {t('个税', 'Tax')}: <Sensitive>{d.tax}</Sensitive>
                      </span>
                    </div>
                    <Space wrap style={{ marginTop: 16 }}>
                      <Button
                        onClick={() => {
                          setDetailId(d.id);
                          mutation.reset();
                        }}
                      >
                        {reconciliation
                          ? t('核对到账', 'Reconcile')
                          : t('详情', 'Details')}
                      </Button>
                      <Button
                        disabled={['Voided', 'Cancelled'].includes(d.state)}
                        onClick={() => openEdit(d)}
                      >
                        {t('更正', 'Edit')}
                      </Button>
                      {deleteButton(d)}
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
            <Pagination
              current={page}
              pageSize={12}
              total={list.data?.total || 0}
              showSizeChanger={false}
              onChange={setPage}
            />
          </>
        ) : (
          <Table
            rowKey="id"
            loading={list.isPending}
            dataSource={list.data?.items || []}
            scroll={{ x: 950 }}
            pagination={{
              current: page,
              pageSize: 12,
              total: list.data?.total || 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              { title: t('归属月份', 'Earning month'), dataIndex: 'month' },
              { title: t('就业单位', 'Employer'), dataIndex: 'employer' },
              { title: t('发薪日期', 'Pay date'), dataIndex: 'payDate' },
              { title: t('币种', 'Currency'), dataIndex: 'currency' },
              ...(['gross', 'net', 'actual', 'tax'] as const).map((k, i) => ({
                title: [
                  t('应发', 'Gross'),
                  t('实发', 'Net'),
                  t('关联到账', 'Linked receipts'),
                  t('个税', 'Tax'),
                ][i],
                dataIndex: k,
                render: (v: string) => <Sensitive>{v}</Sensitive>,
              })),
              {
                title: t('状态', 'Status'),
                dataIndex: 'state',
                render: (v: string) => (
                  <Tag color={v === 'Reconciled' ? 'green' : 'blue'}>
                    {label(v)}
                  </Tag>
                ),
              },
              {
                title: t('操作', 'Actions'),
                render: (_: unknown, d: Slip) => (
                  <Space>
                    <Button
                      onClick={() => {
                        setDetailId(d.id);
                        mutation.reset();
                      }}
                    >
                      {reconciliation
                        ? t('核对到账', 'Reconcile')
                        : t('详情', 'Details')}
                    </Button>
                    <Button
                      onClick={() => openEdit(d)}
                      disabled={['Voided', 'Cancelled'].includes(d.state)}
                    >
                      {t('更正', 'Edit')}
                    </Button>
                    {deleteButton(d)}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Drawer
        placement={mobile ? 'bottom' : 'right'}
        height={mobile ? '92vh' : undefined}
        title={
          editing
            ? t('更正工资条', 'Correct payslip')
            : t('新增工资条', 'New payslip')
        }
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Fields fields={slipFields} />
          {save.isError && <ErrorState error={save.error} />}
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {t('保存草稿', 'Save draft')}
          </Button>
        </Form>
      </Drawer>
      <Drawer
        placement={mobile ? 'bottom' : 'right'}
        height={mobile ? '92vh' : undefined}
        title={t('工资条明细与对账', 'Payslip & reconciliation')}
        open={!!detailId}
        onClose={() => setDetailId(undefined)}
        width={1000}
        destroyOnHidden
      >
        {detail.isError ? (
          <ErrorState error={detail.error} />
        ) : detail.data ? (
          <div className="payroll-stack">
            <Space>{deleteButton(detail.data)}</Space>
            <Descriptions
              bordered
              column={{ xs: 1, sm: 2 }}
              items={[
                ['employer', t('就业单位', 'Employer')],
                ['month', t('工资归属月份', 'Earning month')],
                ['payDate', t('发薪日期', 'Pay date')],
                ['currency', t('币种', 'Currency')],
                ['gross', t('应发金额', 'Gross')],
                ['taxable', t('税务计税金额', 'Taxable earnings')],
                ['personalSocial', t('个人社保', 'Personal insurance')],
                ['personalHousing', t('个人公积金', 'Personal housing fund')],
                ['tax', t('个人所得税', 'Income tax')],
                ['otherDeductions', t('其他扣款', 'Other deductions')],
                ['net', t('实发金额', 'Net')],
                ['actual', t('关联到账', 'Linked receipts')],
                ['difference', t('到账差额', 'Receipt difference')],
              ].map(([key, title]) => ({
                key,
                label: title,
                children: ['employer', 'month', 'payDate', 'currency'].includes(
                  key,
                ) ? (
                  value(detail.data!, key)
                ) : (
                  <Sensitive>{value(detail.data!, key)}</Sensitive>
                ),
              }))}
            />
            {detail.data.taxUnspecified && (
              <Alert
                type="warning"
                showIcon
                message={t(
                  '存在未核对税务属性的工资项目；计税金额不代表完整应税收入。',
                  'Some tax attributes are unreviewed; taxable earnings may be incomplete.',
                )}
              />
            )}
            <Space wrap>
              {['Draft', 'PendingReview'].includes(detail.data.state) && (
                <Button
                  loading={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      path: '/slips/' + detailId + '/actions',
                      version: detail.data?.version,
                      body: {
                        action:
                          detail.data?.state === 'Draft' ? 'review' : 'confirm',
                      },
                    })
                  }
                >
                  {detail.data.state === 'Draft'
                    ? t('送核对', 'Submit for review')
                    : t('确认工资条', 'Confirm payslip')}
                </Button>
              )}
              {detail.data.state === 'Confirmed' && (
                <Button
                  onClick={() =>
                    mutation.mutate({
                      path: '/slips/' + detailId + '/actions',
                      version: detail.data?.version,
                      body: { action: 'paid' },
                    })
                  }
                >
                  {t('标记已发放', 'Mark paid')}
                </Button>
              )}
              <Button
                onClick={() => {
                  setDialog({ type: 'copy', id: detailId });
                  actionForm.resetFields();
                }}
              >
                {t('复制到其他月份', 'Copy to month')}
              </Button>
              <Button disabled={hidden} onClick={exportSlip}>
                {t('导出 PDF', 'Export PDF')}
              </Button>
              <Upload
                showUploadList={false}
                accept=".pdf,.png,.jpg,.jpeg"
                beforeUpload={(file) => {
                  void payrollApi
                    .upload('/slips/' + detailId + '/attachments', file)
                    .then(refresh)
                    .catch((e) => message.error(e.message));
                  return false;
                }}
              >
                <Button>{t('添加附件', 'Add attachment')}</Button>
              </Upload>
            </Space>
            <Table
              rowKey="code"
              size="small"
              pagination={false}
              dataSource={detail.data.items}
              scroll={{ x: 600 }}
              columns={[
                { title: t('项目', 'Item'), dataIndex: 'name' },
                {
                  title: t('分类', 'Category'),
                  dataIndex: 'category',
                  render: label,
                },
                { title: t('类型', 'Type'), dataIndex: 'kind', render: label },
                {
                  title: t('金额', 'Amount'),
                  dataIndex: 'amount',
                  render: (v: string) => <Sensitive>{v}</Sensitive>,
                },
                {
                  title: t('计税属性', 'Tax treatment'),
                  dataIndex: 'taxTreatment',
                  render: label,
                },
              ]}
            />
            <List
              size="small"
              header={t('附件', 'Attachments')}
              dataSource={detail.data.attachments}
              renderItem={(x) => (
                <List.Item>
                  <Button
                    onClick={() =>
                      void payrollApi
                        .document(x.id)
                        .then((blob) => saveBlob(blob, value(x, 'name')))
                        .catch((e) => message.error(e.message))
                    }
                  >
                    {value(x, 'name')}
                  </Button>
                </List.Item>
              )}
            />
            <Card title={t('银行到账核对', 'Bank reconciliation')}>
              <Space wrap>
                <span>{t('日期容差（天）', 'Date tolerance (days)')}</span>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  style={{ width: 90 }}
                />
                <Button onClick={() => void matches.refetch()}>
                  {t('刷新候选', 'Refresh candidates')}
                </Button>
              </Space>
              {matches.isError && <ErrorState error={matches.error} />}
              <Table
                size="small"
                rowKey="id"
                dataSource={matches.data?.items || []}
                pagination={{ pageSize: 5 }}
                scroll={{ x: 600 }}
                columns={[
                  {
                    title: t('日期', 'Date'),
                    dataIndex: 'occurredAt',
                    render: (v: string) => v.slice(0, 10),
                  },
                  { title: t('摘要', 'Narrative'), dataIndex: 'merchant' },
                  {
                    title: t('金额', 'Amount'),
                    dataIndex: 'amount',
                    render: (v: string) => <Sensitive>{v}</Sensitive>,
                  },
                  {
                    title: t('匹配结果', 'Result'),
                    dataIndex: 'state',
                    render: label,
                  },
                  {
                    title: t('单位摘要匹配', 'Employer narrative'),
                    dataIndex: 'employerMatches',
                    render: (v: boolean) =>
                      v ? t('是', 'Yes') : t('待人工核对', 'Review manually'),
                  },
                  {
                    title: t('确认', 'Confirm'),
                    render: (_: unknown, x: Row) => (
                      <Popconfirm
                        title={t(
                          '确认这笔收入属于此工资条？',
                          'Confirm this income belongs to this payslip?',
                        )}
                        onConfirm={() => link(x.id)}
                      >
                        <Button
                          disabled={
                            value(x, 'state') === 'Duplicate' ||
                            !['Confirmed', 'Paid', 'Reconciled'].includes(
                              detail.data!.state,
                            )
                          }
                          loading={mutation.isPending}
                        >
                          {t('关联到账', 'Link receipt')}
                        </Button>
                      </Popconfirm>
                    ),
                  },
                ]}
              />
              <Space
                direction="vertical"
                style={{ width: '100%', marginTop: 12 }}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                  />{' '}
                  {t(
                    '人工核对不符日期或账户（须说明原因）',
                    'Manually confirm date / account mismatch (reason required)',
                  )}
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t(
                    '人工核对原因／作废原因',
                    'Manual review / void reason',
                  )}
                  maxLength={1000}
                />
                <Input
                  value={manualTransaction}
                  onChange={(e) => setManualTransaction(e.target.value)}
                  placeholder={t(
                    '手动输入已有收入交易编号',
                    'Existing income transaction ID',
                  )}
                />
                <Button
                  disabled={
                    !manualTransaction ||
                    !['Confirmed', 'Paid', 'Reconciled'].includes(
                      detail.data.state,
                    )
                  }
                  onClick={() => link(manualTransaction)}
                >
                  {t('确认手动关联', 'Confirm manual link')}
                </Button>
              </Space>
              <List
                header={t(
                  '已关联收入（原交易不变）',
                  'Linked income (original transactions unchanged)',
                )}
                dataSource={detail.data.payments}
                renderItem={(x) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        key="unlink"
                        title={t(
                          '仅解除关联，保留银行交易？',
                          'Unlink while retaining bank transaction?',
                        )}
                        onConfirm={() =>
                          mutation.mutateAsync({
                            path: '/slips/' + detailId + '/unlink',
                            body: { transactionId: value(x, 'transactionId') },
                            version: detail.data?.version,
                          })
                        }
                      >
                        <Button danger>{t('解除关联', 'Unlink')}</Button>
                      </Popconfirm>,
                    ]}
                  >
                    <Sensitive>{value(x, 'amount')}</Sensitive> ·{' '}
                    {value(x, 'occurredAt').slice(0, 10)} ·{' '}
                    {label(value(x, 'status'))}
                  </List.Item>
                )}
              />
            </Card>
            {mutation.isError && <ErrorState error={mutation.error} />}
            <Popconfirm
              title={t(
                '作废工资条？须先解除到账关联并填写原因。',
                'Void this payslip? Unlink receipts and enter a reason first.',
              )}
              onConfirm={() =>
                mutation.mutateAsync({
                  path: '/slips/' + detailId + '/actions',
                  version: detail.data?.version,
                  body: { action: 'void', reason },
                })
              }
            >
              <Button
                danger
                disabled={['Voided', 'Cancelled'].includes(detail.data.state)}
              >
                {t('作废工资条', 'Void payslip')}
              </Button>
            </Popconfirm>
            <Card title={t('历史版本', 'History')}>
              <List
                dataSource={history.data || []}
                renderItem={(x) => (
                  <List.Item>
                    <details>
                      <summary>
                        {t('版本', 'Version')} {value(x, 'payrollVersion')} ·{' '}
                        {value(x, 'action')} · {value(x, 'reason')} ·{' '}
                        {value(x, 'createdAt').slice(0, 19)}
                      </summary>
                      <HistorySnapshot snapshot={x.snapshot as Slip} />
                    </details>
                  </List.Item>
                )}
              />
            </Card>
          </div>
        ) : (
          <Card loading />
        )}
      </Drawer>
      <Modal
        title={
          dialog?.type === 'generate'
            ? t('从方案生成', 'Generate from plan')
            : t('复制工资条', 'Copy payslip')
        }
        open={!!dialog}
        onCancel={() => setDialog(undefined)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={actionForm}
          layout="vertical"
          onFinish={async (v) => {
            try {
              await mutation.mutateAsync({
                path:
                  dialog?.type === 'generate'
                    ? '/slips/generate'
                    : '/slips/' + dialog?.id + '/copy',
                body: v,
              });
              setDialog(undefined);
            } catch {
              /* Error shown below. */
            }
          }}
        >
          {dialog?.type === 'generate' && (
            <Form.Item
              name="planId"
              label={t('薪酬方案版本', 'Plan version')}
              rules={[{ required: true }]}
            >
              <Select
                options={catalog.plans.data?.map((p) => ({
                  value: p.id,
                  label: value(p, 'name') + ' · v' + value(p, 'revision'),
                }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="month"
            label={t('工资归属月份', 'Earning month')}
            rules={[{ required: true }]}
          >
            <Input type="month" />
          </Form.Item>
          <Form.Item
            name="payDate"
            label={t('发薪日期', 'Pay date')}
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>
          {mutation.isError && <ErrorState error={mutation.error} />}
          <Button htmlType="submit" type="primary" loading={mutation.isPending}>
            {t('生成草稿', 'Generate draft')}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
function HistorySnapshot({ snapshot }: { snapshot: Slip }) {
  const t = usePayText();
  const label = usePayLabel();
  return (
    <div>
      <p>
        {snapshot.month} · {snapshot.employer} · {label(snapshot.state)}
      </p>
      <p>
        {t('应发 / 实发', 'Gross / net')}:{' '}
        <Sensitive>
          {snapshot.gross} / {snapshot.net}
        </Sensitive>
      </p>
      <ul>
        {snapshot.items?.map((x) => (
          <li key={x.code + x.name}>
            {x.name}: <Sensitive>{x.amount}</Sensitive>
          </li>
        ))}
      </ul>
    </div>
  );
}
