import { BookComparison } from '../features/collaboration/BookComparison';
import { familyRelationshipOptions } from '../data/familyRelationships';
import { AiLazyMarkdown as AiMarkdown } from '../components/ai/AiLazyMarkdown';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  collaborationApi,
  type SpaceMember,
  type SpaceReport,
} from '../features/collaboration/api';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { currencyOptions } from '../constants/currencies';
import './collaboration.css';
import { useMobile } from '../hooks/useMobile';
import { Sensitive } from '../components/Sensitive';

const roleName = (role: string) =>
  ({ Owner: '所有者', Editor: '可记账', Viewer: '只读' })[role] || role;
const formatAmount = (value: string | number) =>
  Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
type Editor = {
  kind: 'space' | 'member' | 'invite' | 'budget' | 'settlement';
  values?: Record<string, unknown>;
  id?: string;
};
export default function CollaborationPage({
  family = false,
}: {
  family?: boolean;
}) {
  const { message, modal } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const mobile = useMobile();
  const [activeTab, setActiveTab] = useState('overview');
  const money = (value: string | number) =>
    hidden ? '••••' : formatAmount(value);
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('id') || '';
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [editor, setEditor] = useState<Editor>();
  const [analysis, setAnalysis] = useState('');
  const [analysisScope, setAnalysisScope] = useState('');
  const [form] = Form.useForm();
  const list = useQuery({
    queryKey: ['spaces'],
    queryFn: collaborationApi.list,
  });
  const invitations = useQuery({
    queryKey: ['space-invitations'],
    queryFn: collaborationApi.invitations,
  });
  const detail = useQuery({
    queryKey: ['space-report', selected, month],
    queryFn: () => collaborationApi.report(selected, month),
    enabled: !!selected,
  });
  const write = useMutation({
    mutationFn: ({
      path,
      body,
      method,
      version,
    }: {
      path: string;
      body: unknown;
      method?: 'post' | 'put';
      version?: string;
    }) => collaborationApi.write(path, body, method, version),
    onSuccess: () => {
      setEditor(undefined);
      void cache.invalidateQueries({ queryKey: ['spaces'] });
      void cache.invalidateQueries({ queryKey: ['space-report'] });
      void cache.invalidateQueries({ queryKey: ['space-invitations'] });
      message.success('已保存');
    },
    onError: (e: { message: string }) => message.error(e.message),
  });
  const ai = useMutation({
    mutationFn: (scope: { id: string; month: string }) =>
      collaborationApi.write(
        `/spaces/${scope.id}/analysis?month=${scope.month}`,
        {
          confirmTransmission: true,
        },
      ),
    onSuccess: (r, scope) => {
      setAnalysisScope(`${scope.id}|${scope.month}`);
      setAnalysis(r.data.data.explanation);
    },
    onError: (e: { message: string }) => message.error(e.message),
  });
  const open = (e: Editor) => {
    form.resetFields();
    form.setFieldsValue(
      e.values || {
        kind: family ? 'Family' : 'Book',
        currency: 'CNY',
        month,
        role: 'Viewer',
        active: true,
        sortOrder: 0,
      },
    );
    setEditor(e);
  };
  const submit = async () => {
    if (!editor) return;
    const values = await form.validateFields();
    const paths = {
      space: editor.id ? `/spaces/${editor.id}` : '/spaces',
      member: `/spaces/${selected}/members${editor.id ? `/${editor.id}` : ''}`,
      invite: `/spaces/${selected}/invitations`,
      budget: `/spaces/${selected}/budget`,
      settlement: `/spaces/${selected}/settlements`,
    };
    write.mutate({
      path: paths[editor.kind],
      body: {
        ...editor.values,
        ...values,
        ...(editor.kind === 'space'
          ? { kind: family ? 'Family' : 'Book' }
          : {}),
        ...(editor.kind === 'budget' || editor.kind === 'settlement'
          ? { amount: String(values.amount) }
          : {}),
      },
      method: editor.id || editor.kind === 'budget' ? 'put' : 'post',
    });
  };
  const spaces =
    list.data?.filter((s) => s.kind === (family ? 'Family' : 'Book')) ?? [];
  const current = list.data?.find((s) => s.id === selected);
  const report = detail.data;
  const owner = current?.role === 'Owner';
  const memberName = (id?: string) =>
    report?.members.find((m) => m.id === id)?.name || '未指定';
  const memberOptions =
    report?.members.map((m) => ({ value: m.id, label: m.name })) || [];
  const showMembers = (members: SpaceMember[], editable: boolean) => (
    <div className="collaboration-members">
      {members.map((m) => (
        <Card
          key={m.id}
          size="small"
          title={m.name}
          extra={<Tag>{roleName(m.role)}</Tag>}
        >
          <p>{m.profile || '尚未填写档案'}</p>
          <Space>
            <Tag color={m.active ? 'green' : 'default'}>
              {m.active ? '启用' : '停用'}
            </Tag>
            <Tag>{m.linkedUserId ? '已关联登录用户' : '仅用于消费归属'}</Tag>
            {editable && m.role !== 'Owner' && (
              <Button
                size="small"
                onClick={() =>
                  open({ kind: 'member', id: m.id, values: { ...m } })
                }
              >
                编辑
              </Button>
            )}
          </Space>
        </Card>
      ))}
    </div>
  );
  const transactionTable = (
    <Table<SpaceReport['transactions'][number]>
      rowKey="id"
      size="small"
      scroll={{ x: 900 }}
      dataSource={report?.transactions}
      pagination={{ pageSize: 15 }}
      columns={[
        {
          title: '日期',
          dataIndex: 'occurredAt',
          render: (value) => dayjs(value).format('MM-DD HH:mm'),
        },
        {
          title: '类型',
          dataIndex: 'type',
          render: (value) =>
            ({
              Expense: '支出',
              Income: '收入',
              Refund: '退款',
              Transfer: '转账',
            })[value as string] || value,
        },
        { title: '金额', render: (_, t) => `${money(t.amount)} ${t.currency}` },
        {
          title: '商户 / 备注',
          render: (_, t) => (
            <>
              {t.merchant}
              <div className="collaboration-muted">{t.note}</div>
            </>
          ),
        },
        { title: '消费人', dataIndex: 'consumerId', render: memberName },
        { title: '付款人', dataIndex: 'payerId', render: memberName },
        {
          title: '费用承担',
          render: (_, t) =>
            t.shares
              ?.map((s) => `${memberName(s.memberId)} ${money(s.amount)}`)
              .join(' / ') || '未分摊',
        },
        {
          title: '详情',
          render: (_, t) =>
            t.own ? (
              <Link to={`/transactions/${t.id}`}>查看 / 编辑</Link>
            ) : (
              <Tag>成员共享</Tag>
            ),
        },
      ]}
    />
  );
  const balances = (
    <>
      <Table
        rowKey={(r) => r.memberId + r.currency}
        dataSource={report?.balances}
        scroll={{ x: 600 }}
        pagination={false}
        columns={[
          { title: '成员', dataIndex: 'memberId', render: memberName },
          { title: '币种', dataIndex: 'currency' },
          { title: '累计付款', dataIndex: 'paid', render: money },
          { title: '费用承担', dataIndex: 'share', render: money },
          {
            title: '应收 / 应付',
            dataIndex: 'net',
            render: (value) => (
              <Tag
                color={value > 0 ? 'green' : value < 0 ? 'orange' : 'default'}
              >
                {money(value)}
              </Tag>
            ),
          },
        ]}
      />
    </>
  );
  const budgetPanel = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {owner && (
        <Button
          onClick={() =>
            open({
              kind: 'budget',
              values: { month, currency: 'CNY', amount: 0 },
            })
          }
        >
          设置月度预算
        </Button>
      )}
      {report?.budgets.map((b) => (
        <Card
          key={b.currency}
          size="small"
          title={`${b.month} · ${b.currency}`}
          extra={
            owner && (
              <Button
                onClick={() =>
                  open({
                    kind: 'budget',
                    values: { ...b, amount: Number(b.amount) },
                  })
                }
              >
                编辑
              </Button>
            )
          }
        >
          <p>
            实际净支出 {money(b.actual)} / 预算 {money(b.amount)}
          </p>
          <Progress
            percent={
              Number(b.amount) > 0
                ? Math.round((Number(b.actual) / Number(b.amount)) * 100)
                : 0
            }
            status={
              Number(b.actual) > Number(b.amount) ? 'exception' : 'normal'
            }
          />
          <p>
            剩余 {money(Number(b.amount) - Number(b.actual))} {b.currency}
          </p>
        </Card>
      ))}
      {!report?.budgets.length && <Empty description="当前月份尚未设置预算" />}
    </Space>
  );
  return (
    <div className="collaboration-page">
      <div className="collaboration-header">
        <div>
          <Typography.Title level={2}>
            {family ? '家庭中心' : '账本中心'}
          </Typography.Title>
        </div>
        <Button type="primary" onClick={() => open({ kind: 'space' })}>
          {family ? '创建家庭' : '新建账本'}
        </Button>
      </div>
      {invitations.isError && (
        <ErrorState
          error={invitations.error}
          retry={() => invitations.refetch()}
        />
      )}
      {invitations.data?.map((i) => (
        <Alert
          key={i.id}
          type="info"
          style={{ marginBottom: 12 }}
          message={`邀请加入「${i.name}」 · ${roleName(i.role)}`}
          action={
            <Button
              loading={write.isPending}
              onClick={() =>
                write.mutate({
                  path: `/space-invitations/${i.id}/accept`,
                  body: {},
                })
              }
            >
              接受邀请
            </Button>
          }
        />
      ))}
      {list.isPending ? (
        <Spin />
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : (
        <Row gutter={[16, 16]}>
          {spaces.map((s) => (
            <Col key={s.id} xs={24} sm={12} xl={8}>
              <Card
                className={selected === s.id ? 'collaboration-selected' : ''}
                title={
                  <Button
                    type="link"
                    onClick={() => {
                      setParams({ id: s.id });
                      setAnalysis('');
                    }}
                  >
                    {s.name}
                  </Button>
                }
                extra={<Tag>{s.archived ? '已归档' : roleName(s.role)}</Tag>}
              >
                <p>
                  {s.description || (family ? '家庭共同财务空间' : '独立账本')}
                </p>
                {s.familyId && (
                  <Link to={`/families?id=${s.familyId}`}>所属家庭</Link>
                )}
                <Space wrap>
                  <Button onClick={() => setParams({ id: s.id })}>
                    打开{family ? '家庭' : '账本'}
                  </Button>
                  {s.role === 'Owner' && (
                    <Button
                      onClick={() =>
                        open({ kind: 'space', id: s.id, values: { ...s } })
                      }
                    >
                      设置 / 排序
                    </Button>
                  )}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
      {list.isSuccess && spaces.length === 0 && (
        <Empty
          description={
            family
              ? '还没有家庭，创建家庭后可添加成员及关联账本'
              : '还没有账本，点击新建账本开始'
          }
        />
      )}
      {!family && <BookComparison books={spaces} />}
      {selected && (
        <Card
          style={{ marginTop: 24 }}
          title={current?.name || '详情'}
          extra={
            <Space>
              <Input
                type="month"
                aria-label="统计月份"
                value={month}
                onChange={(e) => {
                  if (e.target.value) {
                    setMonth(e.target.value);
                    setAnalysis('');
                  }
                }}
              />
              <Button onClick={() => setParams({})}>关闭</Button>
            </Space>
          }
        >
          {detail.isPending ? (
            <Spin />
          ) : detail.isError ? (
            <ErrorState error={detail.error} retry={() => detail.refetch()} />
          ) : (
            report && (
              <>
                {report.space.familyId && (
                  <Alert
                    type="info"
                    message={
                      <span>
                        消费归属及往来使用家庭成员，费用结算请前往{' '}
                        <Link to={`/families?id=${report.space.familyId}`}>
                          家庭中心
                        </Link>
                        。账本权限需要单独邀请。
                      </span>
                    }
                  />
                )}
                {mobile && (
                  <Select
                    aria-label="中心功能"
                    style={{ width: '100%', marginTop: 16 }}
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                      {
                        value: 'overview',
                        label: family ? '家庭总览' : '账本概览',
                      },
                      { value: 'members', label: '成员及权限档案' },
                      { value: 'invitations', label: '邀请管理' },
                      {
                        value: 'transactions',
                        label: family ? '家庭消费' : '账本交易',
                      },
                      { value: 'shares', label: '共同消费分摊' },
                      { value: 'statistics', label: '成员消费统计' },
                      {
                        value: 'budget',
                        label: family ? '家庭预算' : '账本预算',
                      },
                      { value: 'settlements', label: '费用结算' },
                      { value: 'reports', label: '报表及 AI 分析' },
                    ]}
                  />
                )}
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  tabBarStyle={mobile ? { display: 'none' } : undefined}
                  destroyOnHidden
                  items={[
                    {
                      key: 'overview',
                      label: family ? '家庭总览' : '账本概览',
                      children: (
                        <>
                          <Row gutter={[16, 16]}>
                            {report.totals.map((t) => (
                              <Col xs={24} sm={12} lg={8} key={t.currency}>
                                <Card
                                  size="small"
                                  title={`${month} · ${t.currency}`}
                                >
                                  <p>收入 {money(t.income)}</p>
                                  <p>净支出 {money(t.expense)}</p>
                                  <strong>
                                    结余{' '}
                                    {money(
                                      Number(t.income) - Number(t.expense),
                                    )}
                                  </strong>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                          {!report.totals.length && (
                            <Empty description="本月没有共享交易" />
                          )}
                          <Space style={{ marginTop: 16 }}>
                            <Button
                              onClick={() =>
                                useUI.getState().openEntry('Expense')
                              }
                            >
                              记一笔
                            </Button>
                            {family && <Link to="/books">管理家庭账本</Link>}
                          </Space>
                        </>
                      ),
                    },
                    {
                      key: 'members',
                      label: family ? '成员及档案' : '成员及权限',
                      children: (
                        <>
                          {owner && (
                            <Space style={{ marginBottom: 16 }}>
                              <Button onClick={() => open({ kind: 'member' })}>
                                添加归属成员
                              </Button>
                              <Button onClick={() => open({ kind: 'invite' })}>
                                邀请登录用户
                              </Button>
                            </Space>
                          )}
                          {showMembers(report.ownMembers, owner)}
                          {report.space.familyId && (
                            <>
                              <Typography.Title level={5}>
                                家庭消费成员
                              </Typography.Title>
                              {showMembers(report.members, false)}
                            </>
                          )}
                        </>
                      ),
                    },
                    {
                      key: 'invitations',
                      label: '邀请管理',
                      children: owner ? (
                        <>
                          <Button onClick={() => open({ kind: 'invite' })}>
                            新建邀请
                          </Button>
                          <Table
                            rowKey="id"
                            dataSource={report.invitations || []}
                            scroll={{ x: 600 }}
                            columns={[
                              { title: '邮箱', dataIndex: 'email' },
                              {
                                title: '权限',
                                dataIndex: 'role',
                                render: roleName,
                              },
                              { title: '状态', dataIndex: 'state' },
                              {
                                title: '有效期',
                                dataIndex: 'expiresAt',
                                render: (v) =>
                                  dayjs(v).format('YYYY-MM-DD HH:mm'),
                              },
                              {
                                title: '操作',
                                render: (_, i) =>
                                  i.state === 'Pending' && (
                                    <Button
                                      danger
                                      disabled={write.isPending}
                                      onClick={() =>
                                        write.mutate({
                                          path: `/spaces/${selected}/invitations/${i.id}/revoke`,
                                          body: {},
                                          version: i.version,
                                        })
                                      }
                                    >
                                      撤销
                                    </Button>
                                  ),
                              },
                            ]}
                          />
                        </>
                      ) : (
                        <Alert message="仅所有者可管理邀请" />
                      ),
                    },
                    {
                      key: 'transactions',
                      label: family ? '家庭消费' : '账本交易',
                      children: transactionTable,
                    },
                    {
                      key: 'shares',
                      label: '共同消费分摊',
                      children: (
                        <>
                          {transactionTable}
                        </>
                      ),
                    },
                    {
                      key: 'statistics',
                      label: '成员消费统计',
                      children: (
                        <Table
                          rowKey="id"
                          pagination={false}
                          scroll={{ x: 600 }}
                          dataSource={report.members.flatMap((m) =>
                            [
                              ...new Set(
                                report.transactions.map((t) => t.currency),
                              ),
                            ].map((currency) => ({
                              id: m.id + currency,
                              name: m.name,
                              currency,
                              expense: report.transactions
                                .filter(
                                  (t) =>
                                    t.consumerId === m.id &&
                                    t.currency === currency,
                                )
                                .reduce(
                                  (sum, t) =>
                                    sum +
                                    (t.type === 'Expense'
                                      ? t.amount
                                      : t.type === 'Refund'
                                        ? -t.amount
                                        : 0),
                                  0,
                                ),
                            })),
                          )}
                          columns={[
                            { title: '消费人', dataIndex: 'name' },
                            { title: '币种', dataIndex: 'currency' },
                            {
                              title: '本月归属净消费',
                              dataIndex: 'expense',
                              render: money,
                            },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'budget',
                      label: family ? '家庭预算' : '账本预算',
                      children: budgetPanel,
                    },
                    {
                      key: 'settlements',
                      label: '费用结算',
                      children: report.space.familyId ? (
                        <Link to={`/families?id=${report.space.familyId}`}>
                          前往家庭中心统一结算
                        </Link>
                      ) : (
                        <>
                          {balances}
                          {owner && (
                            <Button
                              style={{ margin: '16px 0' }}
                              onClick={() => open({ kind: 'settlement' })}
                            >
                              登记已支付结算
                            </Button>
                          )}
                          <Alert
                            message="仅在实际完成付款后登记。此处不扣款，也不修改私人账户余额；如需记录资金变化，请另记资金流水。"
                            type="warning"
                          />
                          <Table
                            rowKey="id"
                            scroll={{ x: 700 }}
                            dataSource={report.settlements}
                            columns={[
                              {
                                title: '付款成员',
                                dataIndex: 'fromMemberId',
                                render: memberName,
                              },
                              {
                                title: '收款成员',
                                dataIndex: 'toMemberId',
                                render: memberName,
                              },
                              {
                                title: '金额',
                                render: (_, s) =>
                                  `${money(s.amount)} ${s.currency}`,
                              },
                              { title: '说明', dataIndex: 'note' },
                              {
                                title: '时间',
                                dataIndex: 'createdAt',
                                render: (v) =>
                                  dayjs(v).format('YYYY-MM-DD HH:mm'),
                              },
                              {
                                title: '状态',
                                render: (_, s) =>
                                  s.revoked
                                    ? '已撤销'
                                    : owner && (
                                        <Button
                                          danger
                                          disabled={write.isPending}
                                          onClick={() =>
                                            modal.confirm({
                                              title: '撤销这笔结算记录？',
                                              onOk: () =>
                                                write.mutateAsync({
                                                  path: `/spaces/${selected}/settlements/${s.id}/revoke`,
                                                  body: {},
                                                  version: s.version,
                                                }),
                                            })
                                          }
                                        >
                                          撤销
                                        </Button>
                                      ),
                              },
                            ]}
                          />
                        </>
                      ),
                    },
                    {
                      key: 'reports',
                      label: family
                        ? '家庭报表 / AI 分析'
                        : '账本统计 / AI 分析',
                      children: (
                        <>
                          <Table
                            rowKey="currency"
                            dataSource={report.totals}
                            pagination={false}
                            columns={[
                              { title: '币种', dataIndex: 'currency' },
                              {
                                title: '本月收入',
                                dataIndex: 'income',
                                render: money,
                              },
                              {
                                title: '本月净支出',
                                dataIndex: 'expense',
                                render: money,
                              },
                            ]}
                          />
                          <Button
                            style={{ marginTop: 16 }}
                            loading={ai.isPending}
                            disabled={!owner}
                            onClick={() =>
                              modal.confirm({
                                title: '将本月汇总发送给 AI？',
                                content:
                                  '仅发送月份、各币种收入及净支出，不发送成员、交易备注、商户及账户信息。需已在 AI 隐私设置授权汇总数据。仅所有者可发起分析。',
                                onOk: () =>
                                  ai.mutateAsync({ id: selected, month }),
                              })
                            }
                          >
                            AI 分析本月收支
                          </Button>
                          {analysis &&
                            analysisScope === `${selected}|${month}` && (
                              <Alert
                                style={{
                                  marginTop: 16,
                                  whiteSpace: 'pre-wrap',
                                }}
                                type="info"
                                message="AI 分析（建议供参考）"
                                description={<Sensitive><AiMarkdown text={analysis} /></Sensitive>}
                              />
                            )}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            )
          )}
        </Card>
      )}
      <Modal
        title={
          editor?.kind === 'space'
            ? family
              ? '家庭设置'
              : '账本设置'
            : editor?.kind === 'member'
              ? '成员档案及权限'
              : editor?.kind === 'invite'
                ? '邀请成员'
                : editor?.kind === 'budget'
                  ? '月度预算'
                  : '登记费用结算'
        }
        open={!!editor}
        onCancel={() => setEditor(undefined)}
        onOk={() => void submit()}
        confirmLoading={write.isPending}
        forceRender
      >
        <Form form={form} layout="vertical">
          {editor?.kind === 'space' && (
            <>
              <Form.Item
                name="name"
                label="名称"
                rules={[{ required: true, whitespace: true, max: 100 }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item name="description" label="说明">
                <Input.TextArea maxLength={1000} />
              </Form.Item>
              {!family && (
                <Form.Item name="familyId" label="所属家庭（创建后固定）">
                  <Select
                    disabled={!!editor.id}
                    allowClear
                    options={list.data
                      ?.filter(
                        (s) =>
                          s.kind === 'Family' &&
                          s.role === 'Owner' &&
                          !s.archived,
                      )
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                </Form.Item>
              )}
              <Form.Item name="sortOrder" label="排序（数字越小越靠前）">
                <InputNumber precision={0} />
              </Form.Item>
              {editor.id && (
                <Form.Item
                  name="archived"
                  label="归档（保留历史，停止写入）"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              )}
            </>
          )}
          {editor?.kind === 'member' && (
            <>
              <Form.Item
                name="name"
                label="成员姓名"
                rules={[{ required: true, whitespace: true, max: 100 }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item name="profile" label="档案 / 家庭关系" extra="从我出发：父亲兄弟的子女为堂亲；父亲姐妹及母亲兄弟姐妹的子女为表亲。也可输入自定义档案。">
                <Select
                  showSearch
                  allowClear
                  optionLabelProp="value"
                  options={familyRelationshipOptions}
                  filterOption={(input, option) => String(option?.label ?? '').includes(input)}
                  placeholder="请选择家庭关系，可搜索称谓、别称或路径"
                  popupMatchSelectWidth={false}
                  popupRender={(menu) => <>{menu}<div style={{ padding: 8 }}><Input.Search maxLength={1000} placeholder="自定义档案" enterButton="使用" onSearch={(value) => { if (value.trim()) form.setFieldValue('profile', value.trim()); }} /></div></>}
                />
              </Form.Item>
              <Form.Item name="active" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
          {editor?.kind === 'invite' && (
            <Form.Item
              name="email"
              label="受邀登录邮箱"
              rules={[{ required: true, type: 'email', max: 256 }]}
            >
              <Input />
            </Form.Item>
          )}
          {(editor?.kind === 'member' || editor?.kind === 'invite') && (
            <Form.Item name="role" label="权限" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'Viewer', label: '只读：查看共享记录' },
                  { value: 'Editor', label: '可记账：共享及维护自己的交易' },
                ]}
              />
            </Form.Item>
          )}
          {editor?.kind === 'budget' && (
            <Form.Item name="month" label="月份" rules={[{ required: true }]}>
              <Input type="month" disabled={!!editor.values?.version} />
            </Form.Item>
          )}
          {(editor?.kind === 'budget' || editor?.kind === 'settlement') && (
            <>
              <Form.Item
                name="currency"
                label="币种"
                rules={[{ required: true }]}
              >
                <Select
                  options={currencyOptions()}
                  disabled={!!editor.values?.version}
                />
              </Form.Item>
              <Form.Item
                name="amount"
                label="金额"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  stringMode
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </>
          )}
          {editor?.kind === 'settlement' && (
            <>
              <Form.Item
                name="fromMemberId"
                label="付款成员（应付方）"
                rules={[{ required: true }]}
              >
                <Select options={memberOptions} />
              </Form.Item>
              <Form.Item
                name="toMemberId"
                label="收款成员（应收方）"
                rules={[{ required: true }]}
              >
                <Select options={memberOptions} />
              </Form.Item>
              <Form.Item
                name="note"
                label="实际付款凭据 / 说明"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input.TextArea maxLength={1000} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
