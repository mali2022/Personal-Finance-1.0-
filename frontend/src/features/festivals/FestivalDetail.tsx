import { FestivalAttachments } from './FestivalAttachments';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  App,
} from 'antd';
import { Link } from 'react-router-dom';
import { useUI } from '../../stores/ui';
import {
  errorText,
  read,
  write,
  purchaseStates,
  type Detail,
  type Allocation,
  type Transaction,
  type AiRecord,
  type AiResult,
} from './api';
export function FestivalDetail({
  id,
  onEdit,
}: {
  id: string;
  onEdit: () => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const hidden = useUI((s) => s.hidden);
  const money = (v: string | number) => (hidden ? '••••' : v);
  const q = useQuery({
    queryKey: ['festival', id],
    queryFn: () => read<Detail>('/' + id),
  });
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [form] = Form.useForm<Allocation>();
  const selectedTx = Form.useWatch('transactionId', form);
  const [instruction, setInstruction] = useState('');
  const [ai, setAi] = useState<{ id: string; result: AiResult }>();
  const txs = useQuery({
    queryKey: ['festival-transactions', keyword, txPage],
    queryFn: () =>
      read<{ items: Transaction[]; total: number }>(
        `/transactions?page=${txPage}&pageSize=20&keyword=${encodeURIComponent(keyword)}`,
      ),
    enabled: linkOpen,
  });
  const plans = useQuery({
    queryKey: ['festival-ai', id],
    queryFn: () => read<AiRecord[]>('/' + id + '/ai-plans'),
  });
  const [valueCompare, setValueCompare] = useState<{
    results: {
      id: string;
      totalCost: number;
      remaining: number;
      reasons: string[];
    }[];
    names: Record<string, string>;
    limitations: string[];
  }>();
  const [review, setReview] = useState('');
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['festival', id] }),
      qc.invalidateQueries({ queryKey: ['festival-annual'] }),
      qc.invalidateQueries({ queryKey: ['festivals'] }),
      qc.invalidateQueries({ queryKey: ['festival-ai', id] }),
    ]);
  };
  const act = async (path: string, body: unknown) => {
    if (!q.data) return;
    setBusy(true);
    try {
      const result = await write<unknown>(
        '/' + id + path,
        body,
        q.data.document.version,
      );
      await refresh();
      message.success('操作成功');
      return result;
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (q.isLoading) return <Card loading />;
  if (!q.data)
    return (
      <Alert
        type="error"
        message="详情加载失败"
        action={<Button onClick={() => q.refetch()}>重试</Button>}
      />
    );
  const { document: d, report: r } = q.data;
  const a =
    ai ??
    (plans.data?.[0]
      ? { id: plans.data[0].id, result: plans.data[0].content.result }
      : undefined);
  const metrics = (
    <Row gutter={[12, 12]}>
      {[
        ['计划预算', r.budget],
        ['已发生净支出', r.net],
        ['未执行承诺', r.commitment],
        ['剩余可用预算', r.available],
        ['未确认意向', r.intention],
        ['预计最终支出', r.forecast],
      ].map(([title, value]) => (
        <Col xs={12} lg={8} key={title}>
          <Card size="small">
            <Statistic title={title} value={money(value)} suffix={r.currency} />
          </Card>
        </Col>
      ))}
    </Row>
  );
  return (
    <Card
      title={d.input.name}
      extra={<Button onClick={onEdit}>编辑预算与采购</Button>}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {r.warnings.map((w) => (
          <Alert key={w} type="warning" showIcon message={w} />
        ))}
        <Tabs
          items={[
            {
              key: 'overview',
              label: '总览',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {metrics}
                  <Progress
                    percent={
                      Number(r.budget) > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (Number(r.net) / Number(r.budget)) * 100,
                            ),
                          )
                        : 0
                    }
                  />
                  <Typography.Paragraph>
                    {d.input.startsOn} 至 {d.input.endsOn} ·{' '}
                    {r.countdown >= 0
                      ? `还有 ${r.countdown} 天`
                      : '节日已开始或结束'}{' '}
                    · 采购关联 {r.purchased}/{r.totalPurchases}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary">
                    {(r.scope as string) ||
                      '节日预算与月度预算分别计算，计划不产生真实支出。'}
                  </Typography.Text>
                  <Space wrap>
                    <Link to="/budgets">月度预算</Link>
                    <Link to="/budgets/annual">年度预算</Link>
                    <Link to="/cashflow">现金流</Link>
                    <Link to="/goals">储蓄目标</Link>
                    <Link to="/promotions">优惠权益</Link>
                  </Space>
                  <Descriptions
                    title="提前储蓄建议"
                    items={[
                      {
                        key: 'target',
                        label: '目标',
                        children: money(r.saving.target),
                      },
                      {
                        key: 'gap',
                        label: '缺口',
                        children: money(r.saving.gap),
                      },
                      {
                        key: 'monthly',
                        label: '每月建议预留',
                        children: money(r.saving.monthly),
                      },
                    ]}
                  />
                  <Alert message={r.saving.note} />
                </Space>
              ),
            },
            {
              key: 'budget',
              label: '消费预算',
              children: (
                <>
                  {metrics}
                  <Table
                    rowKey="category"
                    pagination={false}
                    dataSource={d.input.categories ?? []}
                    columns={[
                      { title: '预算分类', dataIndex: 'category' },
                      { title: '计划', dataIndex: 'amount', render: money },
                      {
                        title: '实际净支出',
                        render: (_, row) =>
                          money(
                            r.categories.find(
                              (c) => c.category === row.category,
                            )?.net ?? '0.00',
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'purchases',
              label: '采购清单',
              children: (
                <>
                  <List
                    dataSource={d.input.purchases}
                    locale={{ emptyText: '尚无采购项目' }}
                    renderItem={(p) => (
                      <List.Item
                        actions={[
                          <Button
                            key="approval"
                            loading={busy}
                            onClick={async () => {
                              const res = (await act(
                                '/purchases/' + p.id + '/approval',
                                {},
                              )) as { id: string } | undefined;
                              if (res)
                                message.success(
                                  '已创建审批草稿，请前往 AI 消费审批提交',
                                );
                            }}
                          >
                            交给 AI 审批
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space wrap>
                              {p.name}
                              <Tag>{purchaseStates[p.state]}</Tag>
                            </Space>
                          }
                          description={
                            <>
                              {p.recipient || '未指定对象'} · {money(p.amount)}{' '}
                              {d.input.currency} · {p.category}
                              {p.url && (
                                <p>
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    查看商品
                                  </a>
                                </p>
                              )}
                            </>
                          }
                        />
                      </List.Item>
                    )}
                  />
                  <Space wrap>
                    <Link to="/spending-approvals">打开 AI 消费审批</Link>
                    <Button
                      onClick={async () => {
                        try {
                          setValueCompare(
                            await read('/' + id + '/value-compare'),
                          );
                        } catch (e) {
                          message.error(errorText(e));
                        }
                      }}
                    >
                      比较哪个更值得买
                    </Button>
                    <Link to="/planning/spending-value">
                      打开消费价值实验室
                    </Link>
                  </Space>
                </>
              ),
            },
            {
              key: 'ai',
              label: 'AI 规划',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Alert message="发送已授权的财务摘要、节日与采购信息给现有 AI 服务。方案仅为建议，采纳后只新增采购意向。" />
                  <Input.TextArea
                    aria-label="方案调整要求"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    maxLength={3000}
                    placeholder="例如：预算减少20%，保留给父母的礼物预算"
                  />
                  <Popconfirm
                    title="确认将节日及授权财务摘要发送给 AI？"
                    onConfirm={async () => {
                      const res = (await act('/ai-plans', {
                        confirmTransmission: true,
                        instruction,
                      })) as { id: string; result: AiResult } | undefined;
                      if (res) setAi(res);
                    }}
                  >
                    <Button type="primary" loading={busy}>
                      AI 生成三种方案 / 调整
                    </Button>
                  </Popconfirm>
                  {a ? (
                    <>
                      <Alert
                        message={a.result.review || '以下为模型建议'}
                        description={[
                          ...a.result.missing,
                          ...a.result.assumptions,
                        ].join('；')}
                      />
                      <Row gutter={[12, 12]}>
                        {a.result.plans.map((p, i) => (
                          <Col xs={24} md={8} key={i}>
                            <Card title={p.name}>
                              <Statistic
                                title="建议总支出"
                                value={money(p.total)}
                                suffix={d.input.currency}
                              />
                              <p>保留资金：{money(p.reserve)}</p>
                              <List
                                size="small"
                                dataSource={p.items}
                                renderItem={(x) => (
                                  <List.Item>
                                    {x.name} · {money(x.amount)}
                                  </List.Item>
                                )}
                              />
                              <p>优势：{p.advantages}</p>
                              <p>代价：{p.tradeoffs}</p>
                              <p>月度预算：{p.monthlyImpact}</p>
                              <p>现金流：{p.cashflowImpact}</p>
                              <p>活动：{p.activities.join('；')}</p>
                              <p>风险：{p.risks.join('；')}</p>
                              <p>{p.reason}</p>
                              <Popconfirm
                                title="确认将此方案项目添加为采购意向？不会自动购买或记账。"
                                onConfirm={() =>
                                  act('/ai-plans/' + a.id + '/adopt', {
                                    option: i,
                                    confirm: true,
                                  })
                                }
                              >
                                <Button loading={busy}>确认采纳</Button>
                              </Popconfirm>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    </>
                  ) : (
                    <Empty description="尚未生成 AI 方案" />
                  )}
                  <Link to="/settings/ai">AI 授权设置</Link>
                </Space>
              ),
            },
            {
              key: 'transactions',
              label: '真实流水',
              children: (
                <>
                  <Space wrap>
                    <Button
                      type="primary"
                      onClick={() => {
                        form.resetFields();
                        setLinkOpen(true);
                      }}
                    >
                      关联已有交易 / 退款
                    </Button>
                    <Link to="/bookkeeping/new">创建真实支出后关联</Link>
                  </Space>
                  <Table
                    rowKey="id"
                    scroll={{ x: 650 }}
                    dataSource={r.allocations}
                    columns={[
                      { title: '类型', dataIndex: 'type' },
                      { title: '分类', render: (_, v) => v.input.category },
                      {
                        title: '原币归属',
                        render: (_, v) =>
                          `${money(v.input.amount)} ${v.originalCurrency}`,
                      },
                      {
                        title: '报告金额',
                        dataIndex: 'converted',
                        render: money,
                      },
                      {
                        title: '汇率来源',
                        render: (_, v) =>
                          `${v.input.rateSource} · ${v.input.rateDate ?? '同币种'}`,
                      },
                      {
                        title: '操作',
                        render: (_, v) => (
                          <Popconfirm
                            title="确认撤销归属？原交易保持不变。"
                            onConfirm={() =>
                              act('/allocations/' + v.id + '/revoke', {})
                            }
                          >
                            <Button danger loading={busy}>
                              撤销关联
                            </Button>
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'review',
              label: '复盘报告',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {metrics}
                  <p>
                    已确认归属退款：{money(r.refunds)} {r.currency}；预算偏差：
                    {money(r.variance)}
                  </p>
                  <Alert
                    type={r.complete ? 'success' : 'warning'}
                    message={
                      r.complete
                        ? '已关联交易数据校验通过；完整性仍取决于是否关联全部相关流水。'
                        : '存在待核对交易或退款，暂不能作为最终复盘。'
                    }
                  />
                  <Input.TextArea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    maxLength={4000}
                    placeholder="记录实际体验与明年优化建议"
                  />
                  <InputNumber
                    aria-label="满意度"
                    min={1}
                    max={5}
                    value={satisfaction}
                    onChange={setSatisfaction}
                    placeholder="满意度 1至5（可选）"
                  />
                  <Button
                    loading={busy}
                    onClick={() =>
                      act('/reviews', { satisfaction, note: review })
                    }
                  >
                    保存复盘快照
                  </Button>
                  {d.input.recurrence === 'Yearly' && (
                    <Popconfirm
                      title="按已登记的重复规则创建下一年空采购计划？"
                      onConfirm={() => act('/repeat', { confirm: true })}
                    >
                      <Button loading={busy}>确认创建下一年计划</Button>
                    </Popconfirm>
                  )}
                  <FestivalAttachments
                    id={id}
                    version={d.version}
                    onSaved={refresh}
                  />
                  <History id={id} />
                </Space>
              ),
            },
          ]}
        />
      </Space>
      <Modal
        open={!!valueCompare}
        title="候选采购价值比较"
        footer={null}
        onCancel={() => setValueCompare(undefined)}
        width={800}
      >
        {valueCompare?.limitations.map((x) => (
          <Alert key={x} message={x} />
        ))}
        <Table
          rowKey="id"
          dataSource={valueCompare?.results}
          columns={[
            {
              title: '方案',
              render: (_, x) =>
                x.id === 'keep-cash' ? '保留资金' : valueCompare?.names[x.id],
            },
            { title: '成本', dataIndex: 'totalCost', render: money },
            { title: '预算余量', dataIndex: 'remaining', render: money },
            { title: '待确认', render: (_, x) => x.reasons.join('；') },
          ]}
        />
      </Modal>
      <Modal
        open={linkOpen}
        title="关联真实交易"
        onCancel={() => setLinkOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        width={700}
      >
        <Input.Search
          placeholder="搜索流水备注或交易编号"
          onSearch={(v) => {
            setKeyword(v);
            setTxPage(1);
          }}
        />
        <Table
          size="small"
          rowKey="id"
          loading={txs.isLoading}
          dataSource={txs.data?.items}
          pagination={{
            current: txPage,
            pageSize: 20,
            total: txs.data?.total,
            onChange: setTxPage,
          }}
          columns={[
            { title: '日期', render: (_, t) => t.occurredAt.slice(0, 10) },
            {
              title: '交易',
              render: (_, t) =>
                `${t.type} ${money(t.amount)} ${t.currency} ${t.note}`,
            },
            {
              title: '选择',
              render: (_, t) => (
                <Button
                  onClick={() =>
                    form.setFieldsValue({
                      transactionId: t.id,
                      amount: t.amount,
                      rate: 1,
                      rateSource:
                        t.currency === d.input.currency
                          ? 'SameCurrency'
                          : 'UserConfirmed',
                    })
                  }
                >
                  选择
                </Button>
              ),
            },
          ]}
        />
        {txs.isError && (
          <Alert
            type="error"
            message="交易加载失败"
            action={<Button onClick={() => txs.refetch()}>重试</Button>}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            category: 'Other',
            rate: 1,
            rateSource: 'SameCurrency',
            note: '',
          }}
          onFinish={async (v) => {
            const res = await act('/allocations', v);
            if (res) setLinkOpen(false);
          }}
        >
          <Form.Item
            name="transactionId"
            label="交易编号"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Space wrap>
            <Form.Item
              name="amount"
              label="原币归属金额"
              rules={[{ required: true, pattern: /^\d+(\.\d{1,2})?$/ }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="category"
              label="节日分类"
              rules={[{ required: true }]}
            >
              <Input maxLength={80} />
            </Form.Item>
          </Space>
          <Form.Item name="entryId" label="拆分分录（可选）">
            <Select
              allowClear
              options={(
                txs.data?.items.find((t) => t.id === selectedTx)?.entries ?? []
              ).map((e) => ({
                value: e.id,
                label: `${e.categoryId} · ${money(e.amount)}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="purchaseId" label="对应采购（可选）">
            <Select
              allowClear
              options={d.input.purchases.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item
              name="rate"
              label="原币至报告币种汇率"
              rules={[{ required: true }]}
            >
              <InputNumber min={0.00000001} precision={8} />
            </Form.Item>
            <Form.Item
              name="rateSource"
              label="汇率来源"
              rules={[{ required: true }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item name="rateDate" label="汇率日期（跨币种必填）">
              <Input type="date" />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="归属备注">
            <Input maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
function History({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['festival-history', id],
    queryFn: () =>
      read<
        {
          id: string;
          createdAt: string;
          content: { action: string; version: number };
        }[]
      >('/' + id + '/history'),
  });
  return (
    <List
      header="调整与关联审计（最近100条）"
      dataSource={q.data}
      renderItem={(r) => (
        <List.Item>
          {r.createdAt} · {r.content.action} · v{r.content.version}
        </List.Item>
      )}
    />
  );
}
