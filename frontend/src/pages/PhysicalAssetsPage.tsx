import { lazy, Suspense, useState } from 'react';
import { AiLazyMarkdown as AiMarkdown } from '../components/ai/AiLazyMarkdown';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  physicalApi,
  methods,
  states,
  costNames,
  eventNames,
  type PhysicalCategory,
  type PhysicalRow,
} from '../api/physicalAssets';
import { investmentApi } from '../api/investments';
import { accountApi } from '../api/finance';
import { Select } from '../components/TouchSelect';
import { DateInput } from '../components/ResponsiveDatePicker';
import { PageTitle } from '../components/PageTitle';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { CURRENCY_CODES } from '../constants/currencies';
import { usePreferredCurrency } from '../hooks/useCurrency';

const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));
const label = (map: Record<string, string>, key: string) => map[key] ?? key;
const today = () => dayjs().format('YYYY-MM-DD');
const Chart = lazy(() => import('../components/Chart'));
type Editor = {
  kind: 'create' | 'profile' | 'rule' | 'event' | 'cost' | 'category';
  asset?: PhysicalRow;
  category?: PhysicalCategory;
};
export default function PhysicalAssetsPage() {
  const currency = usePreferredCurrency();
  const hidden = useUI((s) => s.hidden);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [filters, setFilters] = useState({
    date: today(),
    currency: '',
    search: '',
    categoryId: '',
    state: '',
  });
  const [editor, setEditor] = useState<Editor>();
  const [activeTab, setActiveTab] = useState('overview');
  const [detailId, setDetailId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [aiMode, setAiMode] = useState('health');
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const report = useQuery({
    queryKey: ['physical-center', filters],
    queryFn: () => physicalApi.report(filters),
  });
  const categories = useQuery({
    queryKey: ['physical-categories'],
    queryFn: physicalApi.categories,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const data = report.data;
  const detail = data?.items.find((x) => x.id === detailId);
  const categoryOptions = (categories.data ?? [])
    .filter((x) => x.enabled)
    .map((x) => ({ value: x.id, label: x.name }));
  const kind = Form.useWatch('kind', form);
  const method = Form.useWatch('method', form);
  async function refresh() {
    await Promise.all(
      [
        'physical-center',
        'physical-categories',
        'managed-assets',
        'asset-allocation',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
    setAnswer('');
  }
  function open(e: Editor) {
    setEditor(e);
    form.resetFields();
    const a = e.asset;
    const p = a?.profile;
    const defaults = {
      categoryId: null,
      code: '',
      brand: '',
      model: '',
      serialNumber: '',
      merchant: '',
      paymentAccountId: null,
      photoUrl: '',
      receiptUrl: '',
      location: '',
      holder: '',
      tags: '',
      quantity: 1,
      initialState: 'Active',
      maintenanceDays: 180,
      inventoryDays: 365,
      staleDays: 90,
      idleDays: 90,
    };
    const category = categories.data?.find((x) => x.id === p?.categoryId);
    form.setFieldsValue(
      e.kind === 'create'
        ? {
            name: '',
            type: 'Other',
            currency,
            cost: '0',
            acquiredDate: today(),
            state: 'Active',
            note: '',
          }
        : e.kind === 'profile'
          ? { ...defaults, ...p, name: a?.name, note: a?.note }
          : e.kind === 'rule'
            ? {
                date: today(),
                method: category?.defaultMethod ?? 'Manual',
                source: '',
                lifeMonths: category?.defaultLifeMonths ?? 60,
                residual: 0,
                annualRate: 20,
              }
            : e.kind === 'event'
              ? { date: today(), kind: 'Active', reason: '', quantity: 0 }
              : e.kind === 'cost'
                ? { kind: 'Maintenance', reason: '' }
                : {
                    name: '',
                    parentId: null,
                    sort: 0,
                    enabled: true,
                    tags: '',
                    defaultMethod: 'Manual',
                    defaultLifeMonths: 60,
                    ...e.category,
                  },
    );
  }
  async function submit() {
    const v = await form.validateFields();
    if (!editor) return;
    setBusy(true);
    try {
      const a = editor.asset;
      let path = '/physical-assets';
      let verb: 'post' | 'put' = 'post';
      let version = a?.version;
      if (editor.kind === 'profile') {
        path += `/${a!.id}/profile`;
        verb = 'put';
        for (const key of [
          'categoryId',
          'paymentAccountId',
          'inServiceDate',
          'warrantyUntil',
        ])
          v[key] ||= null;
      }
      if (editor.kind === 'rule') {
        path += `/${a!.id}/rules`;
        for (const key of [
          'amount',
          'marketValue',
          'netRealizableValue',
          'replacementCost',
        ])
          v[key] ??= null;
      }
      if (editor.kind === 'event') {
        path += `/${a!.id}/events`;
        v.quantity = ['Transferred', 'Sold', 'Scrapped', 'Lost'].includes(
          v.kind,
        )
          ? v.quantity
          : 0;
        v.reversesId = v.kind === 'Reverse' ? v.reversesId : null;
      }
      if (editor.kind === 'cost') path += `/${a!.id}/costs`;
      if (editor.kind === 'category') {
        path =
          '/physical-categories' +
          (editor.category ? `/${editor.category.id}` : '');
        verb = editor.category ? 'put' : 'post';
        version = editor.category?.version;
        v.parentId ||= null;
      }
      await investmentApi.save(path, v, version, verb);
      setEditor(undefined);
      await refresh();
      void message.success('已保存');
    } catch (e) {
      void message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeCategory(c: PhysicalCategory, targetId?: string) {
    try {
      await investmentApi.save(
        `/physical-categories/${c.id}/remove`,
        {
          reason: targetId ? '用户合并资产分类' : '用户删除空分类',
          targetId: targetId ?? null,
        },
        c.version,
      );
      await refresh();
    } catch (e) {
      void message.error((e as Error).message);
    }
  }
  async function reverseCost(a: PhysicalRow, id: string) {
    try {
      await investmentApi.save(
        `/physical-assets/${a.id}/costs/${id}/reverse`,
        { reason: '用户撤销费用归属' },
        a.version,
      );
      await refresh();
    } catch (e) {
      void message.error((e as Error).message);
    }
  }
  const field = (
    name: string,
    title: string,
    required = false,
    child = <Input maxLength={150} />,
  ) => (
    <Form.Item
      key={name}
      name={name}
      label={title}
      rules={required ? [{ required: true, message: `请填写${title}` }] : []}
    >
      {child}
    </Form.Item>
  );
  const money = (n: number | null, code: string) =>
    n == null ? '未知' : <Money value={String(n)} currency={code} />;
  const metrics = data?.groups.map((g) => (
    <Card key={g.currency} title={`${g.currency} · 资产总览`}>
      <div
        style={{
          display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
          gap: 16,
        }}
      >
        {[
          ['总估值（已覆盖）', money(g.totalValue, g.currency)],
          ['原始购置成本', money(g.originalCost, g.currency)],
          ['剩余购置成本', money(g.remainingCost, g.currency)],
          ['账面价值', money(g.bookValue, g.currency)],
          ['累计折旧', money(g.depreciation, g.currency)],
          ['剩余数量', g.quantity],
          [
            '保值率',
            g.retentionPercent == null ? '未知' : `${g.retentionPercent}%`,
          ],
          ['现金使用成本', money(g.usageCost, g.currency)],
          ['持有成本', money(g.ownershipCost, g.currency)],
          ['闲置率（档案数）', `${g.idlePercent ?? '—'}%`],
          ['分类集中度', `${g.concentrationPercent ?? '—'}%`],
          ['更换成本（已覆盖）', money(g.replacementCost, g.currency)],
          ['较上月估值变化', money(g.valueChange, g.currency)],
        ].map(([title, value]) => (
          <div key={String(title)}>
            <div style={{ color: 'var(--text-secondary, #777)' }}>{title}</div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>
        缺少估值：{g.missing} 项 · 缺少更换成本：{g.replacementMissing} 项
      </p>
    </Card>
  ));
  function categoryTree(parent: string | null = null): DataNode[] {
    return (categories.data ?? [])
      .filter((x) => x.parentId === parent)
      .map((x) => ({
        key: x.id,
        title: `${x.name}${x.enabled ? '' : '（已停用）'}`,
        children: categoryTree(x.id),
      }));
  }
  if (report.isError)
    return <ErrorState error={report.error} retry={() => report.refetch()} />;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="page-heading">
        <PageTitle>实物资产中心</PageTitle>
        <Button
          type="primary"
          disabled={hidden}
          onClick={() => open({ kind: 'create' })}
        >
          新增资产
        </Button>
      </div>
      <Card>
        <Space wrap>
          <DateInput
            type="date"
            value={filters.date}
            onChange={(e) => {
              setFilters({ ...filters, date: e.target.value });
              setAnswer('');
            }}
          />
          <Select
            aria-label="币种筛选"
            value={filters.currency}
            options={[
              { value: '', label: '全部币种（分列）' },
              ...CURRENCY_CODES.map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => {
              setFilters({ ...filters, currency: value });
              setAnswer('');
            }}
          />
          <Select
            aria-label="分类筛选"
            value={filters.categoryId}
            options={[{ value: '', label: '全部分类' }, ...categoryOptions]}
            onChange={(value) => {
              setFilters({ ...filters, categoryId: value });
              setAnswer('');
            }}
          />
          <Select
            aria-label="状态筛选"
            value={filters.state}
            options={[{ value: '', label: '全部状态' }, ...options(states)]}
            onChange={(value) => {
              setFilters({ ...filters, state: value });
              setAnswer('');
            }}
          />
          <Input.Search
            placeholder="名称、编码、品牌、位置、持有人、标签"
            allowClear
            onSearch={(value) => {
              setFilters({ ...filters, search: value });
              setAnswer('');
            }}
            style={{ width: 320, maxWidth: '100%' }}
          />
        </Space>
      </Card>
      {hidden ? (
        <Alert message="隐私模式已开启，实物档案与分析已隐藏" />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: '资产总览',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {metrics?.length ? (
                    metrics
                  ) : (
                    <Empty description="暂无资产，先新增一份档案" />
                  )}
                  <Alert
                    type="info"
                    message="统一统计口径"
                    description={data?.scope}
                  />
                  <Card title="分类结构与估值趋势">
                    {data?.groups.map((g) => (
                      <div key={g.currency}>
                        <h3>{g.currency} 分类结构</h3>
                        <Suspense fallback={null}>
                          <Chart
                            option={{
                              tooltip: { trigger: 'item' },
                              series: [
                                {
                                  type: 'pie',
                                  radius: ['40%', '70%'],
                                  data: g.distribution
                                    .filter((x) => x.value > 0)
                                    .map((x) => ({
                                      name: x.name,
                                      value: x.value,
                                    })),
                                },
                              ],
                            }}
                          />
                        </Suspense>
                        <Table
                          size="small"
                          rowKey="name"
                          pagination={false}
                          dataSource={g.distribution}
                          columns={[
                            { title: '分类', dataIndex: 'name' },
                            {
                              title: '估值（已覆盖）',
                              render: (_, r) => money(r.value, g.currency),
                            },
                            { title: '缺少估值', dataIndex: 'missing' },
                            { title: '数量', dataIndex: 'quantity' },
                          ]}
                        />
                        <h3>近12个月同日估值</h3>
                        <Suspense fallback={null}>
                          <Chart
                            option={{
                              tooltip: { trigger: 'axis' },
                              xAxis: {
                                type: 'category',
                                data: g.trend.map((x) => x.date),
                              },
                              yAxis: { type: 'value' },
                              series: [
                                {
                                  type: 'line',
                                  name: g.currency,
                                  connectNulls: false,
                                  data: g.trend.map((x) =>
                                    x.missing > 0 ? null : x.value,
                                  ),
                                },
                              ],
                            }}
                          />
                        </Suspense>
                        <Table
                          size="small"
                          rowKey="date"
                          pagination={false}
                          dataSource={g.trend}
                          columns={[
                            { title: '日期', dataIndex: 'date' },
                            {
                              title: '估值（已覆盖）',
                              render: (_, r) => money(r.value, g.currency),
                            },
                            { title: '缺少估值', dataIndex: 'missing' },
                          ]}
                        />
                      </div>
                    ))}
                  </Card>
                </Space>
              ),
            },
            {
              key: 'assets',
              label: '资产档案',
              children: (
                <Card>
                  <Table<PhysicalRow>
                    rowKey="id"
                    loading={report.isLoading}
                    dataSource={data?.items}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 15 }}
                    columns={[
                      {
                        title: '名称 / 编码',
                        render: (_, a) => (
                          <Button type="link" onClick={() => setDetailId(a.id)}>
                            {a.name}
                            {a.profile?.code ? ` · ${a.profile.code}` : ''}
                          </Button>
                        ),
                      },
                      { title: '分类', dataIndex: 'categoryName' },
                      {
                        title: '状态',
                        render: (_, a) => label(states, a.value.state),
                      },
                      { title: '数量', render: (_, a) => a.value.quantity },
                      {
                        title: '原始成本',
                        render: (_, a) =>
                          money(a.value.originalCost, a.currency),
                      },
                      {
                        title: '账面价值',
                        render: (_, a) => money(a.value.bookValue, a.currency),
                      },
                      {
                        title: '当前估值',
                        render: (_, a) => money(a.value.value, a.currency),
                      },
                      {
                        title: '异常',
                        render: (_, a) =>
                          a.anomalies.map((x) => (
                            <Tag color="orange" key={x}>
                              {x}
                            </Tag>
                          )),
                      },
                      {
                        title: '操作',
                        render: (_, a) => (
                          <Space wrap>
                            <Button
                              onClick={() =>
                                open({ kind: 'profile', asset: a })
                              }
                            >
                              档案
                            </Button>
                            <Button
                              onClick={() => open({ kind: 'rule', asset: a })}
                            >
                              估值
                            </Button>
                            <Button
                              onClick={() => open({ kind: 'event', asset: a })}
                            >
                              生命周期
                            </Button>
                            <Button
                              onClick={() => open({ kind: 'cost', asset: a })}
                            >
                              关联费用
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'categories',
              label: '分类管理',
              children: (
                <Card
                  extra={
                    <Button onClick={() => open({ kind: 'category' })}>
                      新增分类
                    </Button>
                  }
                >
                  <Tree treeData={categoryTree()} defaultExpandAll />
                  {categories.isError && (
                    <ErrorState
                      error={categories.error}
                      retry={() => categories.refetch()}
                    />
                  )}
                  <Table<PhysicalCategory>
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    dataSource={categories.data}
                    columns={[
                      { title: '分类', dataIndex: 'name' },
                      { title: '排序', dataIndex: 'sort' },
                      { title: '标签', dataIndex: 'tags' },
                      {
                        title: '默认估值',
                        render: (_, c) => label(methods, c.defaultMethod),
                      },
                      {
                        title: '状态',
                        render: (_, c) => (c.enabled ? '启用' : '停用'),
                      },
                      {
                        title: '操作',
                        render: (_, c) => (
                          <Space>
                            <Button
                              onClick={() =>
                                open({ kind: 'category', category: c })
                              }
                            >
                              编辑
                            </Button>
                            <Popconfirm
                              title="删除此空分类？有引用或子分类时会阻止删除。"
                              onConfirm={() => removeCategory(c)}
                            >
                              <Button danger>删除</Button>
                            </Popconfirm>
                            <Select
                              placeholder="合并至…"
                              style={{ minWidth: 130 }}
                              options={categoryOptions.filter(
                                (x) => x.value !== c.id,
                              )}
                              onChange={(value) => {
                                const target = categories.data?.find(
                                  (x) => x.id === value,
                                );
                                if (target) AppModalMerge(c, target);
                              }}
                            />
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'reminders',
              label: `提醒与盘点（${data?.reminders.length ?? 0}）`,
              children: (
                <Card>
                  <Table
                    rowKey={(r) => `${r.assetId}-${r.kind}`}
                    dataSource={data?.reminders}
                    columns={[
                      { title: '资产', dataIndex: 'name' },
                      {
                        title: '提醒',
                        render: (_, r) =>
                          label(
                            {
                              Warranty: '保修到期',
                              Maintenance: '维护周期',
                              Valuation: '长期未估值',
                              Inventory: '定期盘点',
                              Idle: '长期闲置',
                            },
                            r.kind,
                          ),
                      },
                      { title: '到期日', dataIndex: 'due' },
                      {
                        title: '状态',
                        render: (_, r) => (
                          <Tag color={r.overdue ? 'red' : 'orange'}>
                            {r.overdue ? '已到期' : '即将到期'}
                          </Tag>
                        ),
                      },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Button
                            onClick={() => {
                              const a = data?.items.find(
                                (x) => x.id === r.assetId,
                              );
                              if (a)
                                open({
                                  kind:
                                    r.kind === 'Valuation' ? 'rule' : 'event',
                                  asset: a,
                                });
                            }}
                          >
                            处理
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'ai',
              label: 'AI 分析与检索',
              children: (
                <Card>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert message="使用当前筛选的真实数据库摘要，经现有 DeepSeek 接入分析；不含照片、凭证、序列号、持有人、位置和备注。缺少市场价格时明确未知。" />
                    <Select
                      value={aiMode}
                      onChange={setAiMode}
                      options={options({
                        health: '资产健康检查',
                        cost: '成本解释',
                        replacement: '更换建议',
                        search: '自然语言检索',
                      })}
                    />
                    <Input.TextArea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      maxLength={1000}
                      placeholder="输入问题或检索条件，例如：哪些资产保值率低于50%？"
                    />
                    <Checkbox
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    >
                      同意向 AI 发送当前资产汇总、资产名称与分类名称
                    </Checkbox>
                    <Button
                      type="primary"
                      loading={aiBusy}
                      disabled={!consent || report.isFetching}
                      onClick={async () => {
                        setAiBusy(true);
                        setAnswer('');
                        try {
                          const result = await physicalApi.analysis(
                            { sendSummary: consent, mode: aiMode, question },
                            filters,
                          );
                          setAnswer(result.explanation);
                        } catch (e) {
                          void message.error((e as Error).message);
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                    >
                      开始分析
                    </Button>
                    {answer && (
                      <AiMarkdown text={answer} />
                    )}
                  </Space>
                </Card>
              ),
            },
          ]}
        />
      )}
      <Drawer
        width={620}
        open={!!editor && !hidden}
        onClose={() => !busy && setEditor(undefined)}
        title={label(
          {
            create: '新增资产',
            profile: '资产档案',
            rule: '登记估值规则与观察值',
            event: '生命周期 / 盘点',
            cost: '关联已有支出',
            category: '资产分类',
          },
          editor?.kind ?? '',
        )}
        extra={
          <Button type="primary" loading={busy} onClick={() => void submit()}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical" disabled={busy}>
          {editor?.kind === 'create' && (
            <>
              {field('name', '资产名称', true)}
              {field(
                'type',
                '资产类型',
                true,
                <Select
                  options={options({
                    Property: '房产',
                    Vehicle: '车辆',
                    Valuable: '贵重物品',
                    Other: '其他实物',
                  })}
                />,
              )}
              {field(
                'currency',
                '币种',
                true,
                <Select options={CURRENCY_CODES.map((value) => ({ value }))} />,
              )}
              {field('cost', '原始购置成本', true)}
              {field(
                'acquiredDate',
                '购置日期',
                true,
                <DateInput type="date" />,
              )}
              {field(
                'note',
                '备注',
                false,
                <Input.TextArea maxLength={2000} />,
              )}
            </>
          )}
          {editor?.kind === 'profile' && (
            <>
              {field('name', '资产名称', true)}
              {field(
                'note',
                '备注',
                false,
                <Input.TextArea maxLength={2000} />,
              )}
              {field(
                'categoryId',
                '独立资产分类',
                false,
                <Select allowClear options={categoryOptions} />,
              )}
              {[
                'code',
                'brand',
                'model',
                'serialNumber',
                'merchant',
                'location',
                'holder',
                'tags',
              ].map((key, i) =>
                field(
                  key,
                  [
                    '资产编码',
                    '品牌',
                    '型号',
                    '序列号',
                    '购置商户',
                    '位置',
                    '持有人',
                    '标签',
                  ][i],
                ),
              )}
              {field(
                'paymentAccountId',
                '付款账户（仅记录归属）',
                false,
                <Select
                  allowClear
                  options={accounts.data?.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.currency})`,
                  }))}
                />,
              )}
              {field(
                'quantity',
                '原始数量',
                true,
                <InputNumber
                  min={0.0001}
                  max={100000000}
                  precision={4}
                  disabled={!!editor.asset?.profile}
                />,
              )}
              {field(
                'initialState',
                '初始状态',
                true,
                <Select
                  disabled={!!editor.asset?.profile}
                  options={options({
                    New: '新增待启用',
                    Active: '已启用',
                    Idle: '闲置',
                  })}
                />,
              )}
              {field(
                'inServiceDate',
                '启用日期',
                false,
                <DateInput type="date" />,
              )}
              {field(
                'warrantyUntil',
                '保修到期',
                false,
                <DateInput type="date" />,
              )}
              {field(
                'photoUrl',
                '照片 HTTPS 链接',
                false,
                <Input maxLength={2000} />,
              )}
              {field(
                'receiptUrl',
                '凭证 HTTPS 链接',
                false,
                <Input maxLength={2000} />,
              )}
              {[
                'maintenanceDays',
                'inventoryDays',
                'staleDays',
                'idleDays',
              ].map((key, i) =>
                field(
                  key,
                  [
                    '维护周期（天，0关闭）',
                    '盘点周期（天，0关闭）',
                    '未估值提醒（天）',
                    '闲置提醒（天）',
                  ][i],
                  true,
                  <InputNumber min={i < 2 ? 0 : 1} max={36500} precision={0} />,
                ),
              )}
            </>
          )}
          {editor?.kind === 'rule' && (
            <>
              {field('date', '估值生效日期', true, <DateInput type="date" />)}
              {field(
                'method',
                '估值模式',
                true,
                <Select options={options(methods)} />,
              )}
              {['Manual', 'Fixed', 'QuantityPrice'].includes(method) &&
                field(
                  'amount',
                  method === 'QuantityPrice' ? '单价' : '总估值',
                  true,
                  <InputNumber min={0} precision={2} />,
                )}
              {['StraightLine', 'DecliningBalance'].includes(method) && (
                <>
                  {field(
                    'lifeMonths',
                    '使用寿命（月）',
                    true,
                    <InputNumber min={1} max={1200} precision={0} />,
                  )}
                  {field(
                    'residual',
                    '原始总残值',
                    true,
                    <InputNumber min={0} precision={2} />,
                  )}
                  {method === 'DecliningBalance' &&
                    field(
                      'annualRate',
                      '年折旧率（%）',
                      true,
                      <InputNumber min={0} max={100} />,
                    )}
                </>
              )}
              {field(
                'marketValue',
                '有来源的市场总估值',
                method === 'Market',
                <InputNumber min={0} precision={2} />,
              )}
              {field(
                'netRealizableValue',
                '估计净变现总价值',
                false,
                <InputNumber min={0} precision={2} />,
              )}
              {field(
                'replacementCost',
                '有依据的更换总成本',
                false,
                <InputNumber min={0} precision={2} />,
              )}
              {field(
                'source',
                '估值依据 / 市场观察来源',
                true,
                <Input.TextArea maxLength={1000} />,
              )}
            </>
          )}
          {editor?.kind === 'event' && (
            <>
              {field('date', '发生日期', true, <DateInput type="date" />)}
              {field(
                'kind',
                '事件类型',
                true,
                <Select options={options(eventNames)} />,
              )}
              {['Transferred', 'Sold', 'Scrapped', 'Lost'].includes(kind) &&
                field(
                  'quantity',
                  '处置数量（支持部分处置）',
                  true,
                  <InputNumber
                    min={0.0001}
                    max={editor.asset?.value.quantity}
                    precision={4}
                  />,
                )}
              {kind === 'Reverse' &&
                field(
                  'reversesId',
                  '撤销原事件（从最近事件依次撤销）',
                  true,
                  <Select
                    options={editor.asset?.events
                      .filter(
                        (e) =>
                          e.kind !== 'Reverse' &&
                          !editor.asset?.events.some(
                            (r) => r.reversesId === e.id,
                          ),
                      )
                      .map((e) => ({
                        value: e.id,
                        label: `${e.date} ${label(eventNames, e.kind)} ${e.quantity || ''}`,
                      }))}
                  />,
                )}
              {field(
                'reason',
                '原因 / 审计说明',
                true,
                <Input.TextArea maxLength={1000} />,
              )}
            </>
          )}
          {editor?.kind === 'cost' && (
            <>
              {field('transactionId', '已有支出交易 ID', true)}
              {field(
                'kind',
                '费用类型',
                true,
                <Select options={options(costNames)} />,
              )}
              {field(
                'reason',
                '归属说明',
                false,
                <Input.TextArea maxLength={1000} />,
              )}
            </>
          )}
          {editor?.kind === 'category' && (
            <>
              {field('name', '分类名称', true)}
              {field(
                'parentId',
                '上级分类（最多三级）',
                false,
                <Select
                  allowClear
                  options={(categories.data ?? [])
                    .filter((x) => x.id !== editor.category?.id)
                    .map((x) => ({ value: x.id, label: x.name }))}
                />,
              )}
              {field(
                'sort',
                '排序',
                true,
                <InputNumber min={-100000} max={100000} precision={0} />,
              )}
              <Form.Item name="enabled" valuePropName="checked">
                <Checkbox>启用</Checkbox>
              </Form.Item>
              {field('tags', '标签')}
              {field(
                'defaultMethod',
                '默认估值模式',
                true,
                <Select options={options(methods)} />,
              )}
              {field(
                'defaultLifeMonths',
                '默认使用寿命（月）',
                true,
                <InputNumber min={1} max={1200} precision={0} />,
              )}
            </>
          )}
        </Form>
      </Drawer>
      <Drawer
        width={900}
        open={!!detail && !hidden}
        title={detail?.name}
        onClose={() => setDetailId(undefined)}
      >
        {detail && (
          <>
            <Descriptions
              column={2}
              bordered
              items={[
                {
                  key: 'cost',
                  label: '原始成本',
                  children: money(detail.value.originalCost, detail.currency),
                },
                {
                  key: 'book',
                  label: '账面价值',
                  children: money(detail.value.bookValue, detail.currency),
                },
                {
                  key: 'market',
                  label: '市场估值',
                  children: money(detail.value.marketValue, detail.currency),
                },
                {
                  key: 'net',
                  label: '估计净变现价值',
                  children: money(
                    detail.value.netRealizableValue,
                    detail.currency,
                  ),
                },
                {
                  key: 'method',
                  label: '当前估值模式',
                  children: label(methods, detail.value.method),
                },
                {
                  key: 'state',
                  label: '状态',
                  children: label(states, detail.value.state),
                },
                { key: 'note', label: '备注', children: detail.note },
                ...Object.entries(detail.profile ?? {})
                  .filter(([key]) =>
                    [
                      'code',
                      'brand',
                      'model',
                      'serialNumber',
                      'merchant',
                      'location',
                      'holder',
                      'tags',
                      'warrantyUntil',
                      'inServiceDate',
                    ].includes(key),
                  )
                  .map(([key, value]) => ({
                    key,
                    label: label(
                      {
                        code: '编码',
                        brand: '品牌',
                        model: '型号',
                        serialNumber: '序列号',
                        merchant: '商户',
                        location: '位置',
                        holder: '持有人',
                        tags: '标签',
                        warrantyUntil: '保修到期',
                        inServiceDate: '启用日期',
                      },
                      key,
                    ),
                    children: String(value ?? '—'),
                  })),
              ]}
            />
            {detail.profile?.photoUrl && (
              <p>
                <a
                  href={detail.profile.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看照片
                </a>
              </p>
            )}
            {detail.profile?.receiptUrl && (
              <p>
                <a
                  href={detail.profile.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看购置凭证
                </a>
              </p>
            )}
            <h3>估值规则历史</h3>
            <Table
              rowKey="id"
              scroll={{ x: 'max-content' }}
              dataSource={detail.rules}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '模式', render: (_, r) => label(methods, r.method) },
                {
                  title: '金额 / 单价',
                  render: (_, r) => money(r.amount, detail.currency),
                },
                { title: '依据', dataIndex: 'source' },
                {
                  title: '市场价值',
                  render: (_, r) => money(r.marketValue, detail.currency),
                },
                {
                  title: '净变现价值',
                  render: (_, r) =>
                    money(r.netRealizableValue, detail.currency),
                },
              ]}
            />
            <h3>历史手动估值</h3>
            <Table
              rowKey="id"
              dataSource={detail.valuations}
              columns={[
                { title: '日期', dataIndex: 'date' },
                {
                  title: '金额',
                  render: (_, r) => money(r.amount, detail.currency),
                },
                { title: '来源', dataIndex: 'source' },
              ]}
            />
            <h3>生命周期审计</h3>
            <Table
              rowKey="id"
              dataSource={detail.events}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '事件', render: (_, e) => label(eventNames, e.kind) },
                { title: '数量', dataIndex: 'quantity' },
                { title: '原因', dataIndex: 'reason' },
                { title: '冲销原记录', dataIndex: 'reversesId' },
              ]}
            />
            <h3>持有费用（仅关联）</h3>
            <Table
              rowKey="id"
              scroll={{ x: 'max-content' }}
              dataSource={detail.costs}
              columns={[
                { title: '交易 ID', dataIndex: 'transactionId' },
                { title: '费用', render: (_, c) => label(costNames, c.kind) },
                {
                  title: '金额',
                  render: (_, c) => money(c.amount, detail.currency),
                },
                {
                  title: '状态',
                  render: (_, c) =>
                    c.reversed
                      ? '已撤销'
                      : c.valid
                        ? '有效'
                        : '失效 / 不在统计日内',
                },
                {
                  title: '操作',
                  render: (_, c) =>
                    !c.reversed && (
                      <Popconfirm
                        title="撤销此费用归属？原交易将保留。"
                        onConfirm={() => reverseCost(detail, c.id)}
                      >
                        <Button danger>撤销关联</Button>
                      </Popconfirm>
                    ),
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </Space>
  );
  function AppModalMerge(source: PhysicalCategory, target: PhysicalCategory) {
    modal.confirm({
      title: `将“${source.name}”合并至“${target.name}”？`,
      content: '资产归属会迁移，原分类会删除。有子分类时请先处理子分类。',
      onOk: () => removeCategory(source, target.id),
    });
  }
}
