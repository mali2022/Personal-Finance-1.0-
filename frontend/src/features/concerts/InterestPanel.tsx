import { InterestAdvice } from './InterestAdvice';
import { ArtistProfileFields } from './ArtistProfileFields';
import { TopicHistory } from './TopicHistory';
import { InterestHistoryMatch } from './InterestHistoryMatch';
import { InterestFiles } from './InterestFiles';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Checkbox,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  App,
} from 'antd';
import { Link } from 'react-router-dom';
import { interestApi } from './interestApi';
import type { Item, Purchase, PurchaseRecord, Topic, ArtistProfile } from './interestApi';
import { concertApi } from './api';
import { ErrorState } from '../../components/Feedback';
import { currencyOptions } from '../../constants/currencies';
import { useUI } from '../../stores/ui';
const types = [
  ['Daily', '日常商品'],
  ['LiveMerch', '现场周边'],
  ['Album', '专辑'],
  ['Collection', '收藏'],
  ['ConcertDirect', '演出直接消费'],
  ['Travel', '演出行程'],
].map(([value, label]) => ({ value, label }));
const emptyItem = (): Item => ({
  id: crypto.randomUUID(),
  related: true,
  name: '',
  brandId: null,
  category: '服饰',
  specification: '',
  quantity: 1,
  unitPrice: '0',
  discount: '0',
  shipping: '0',
  tax: '0',
  paid: '0',
  purpose: 'Daily',
  state: 'Pending',
  artists: [],
  note: '',
});
export function InterestPanel({
  section,
}: {
  section: 'daily' | 'catalog' | 'collection' | 'analysis';
}) {
  const { message } = App.useApp();
  const cache = useQueryClient();
  const hidden = useUI((s) => s.hidden);
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState('CNY');
  const [year, setYear] = useState(new Date().getFullYear());
  const [artist, setArtist] = useState<string>();
  const [brand, setBrand] = useState<string>();
  const [merchant, setMerchant] = useState('');
  const [scene, setScene] = useState<string>();
  const catalog = useQuery({
    queryKey: ['music-catalog'],
    queryFn: interestApi.catalog,
  });
  const purchases = useQuery({
    queryKey: ['music-purchases', page],
    queryFn: () => interestApi.purchases(page),
  });
  const scenes = useQuery({ queryKey: ['concerts'], queryFn: concertApi.list });
  const report = useQuery({
    queryKey: ['music-report', currency, year, artist, brand, merchant, scene],
    queryFn: () =>
      interestApi.report({
        currency,
        year,
        artist,
        brand,
        merchant: merchant || undefined,
        scene,
      }),
    enabled: section === 'analysis',
  });
  const lifetime = useQuery({
    queryKey: [
      'music-report',
      'lifetime',
      currency,
      artist,
      brand,
      merchant,
      scene,
    ],
    queryFn: () =>
      interestApi.report({
        currency,
        year: 0,
        artist,
        brand,
        merchant: merchant || undefined,
        scene,
      }),
    enabled: section === 'analysis',
  });
  const [editing, setEditing] = useState<PurchaseRecord | null>();
  const [topic, setTopic] = useState<Topic | null>();
  const [topicHistory, setTopicHistory] = useState<Topic>();
  const [catalogSearch, setCatalogSearch] = useState('');
  const [form] = Form.useForm<Purchase>();
  const [topicForm] = Form.useForm();
  const topicKind = Form.useWatch('kind', topicForm);
  const [linkForm] = Form.useForm();
  const [editingLink, setEditingLink] = useState<{
    id: string;
    version: string;
  }>();
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState(false);
  const purchaseCurrency = Form.useWatch('currency', form) || 'CNY';
  const choices = useQuery({
    queryKey: ['music-payment-choices', purchaseCurrency],
    enabled: editing !== undefined,
    queryFn: () => concertApi.transactions(purchaseCurrency, '', false),
  });
  const artists = (catalog.data?.topics || [])
    .filter((t) => t.input.kind === 'Artist')
    .map((t) => ({ value: t.id, label: t.input.name }));
  const brands = (catalog.data?.topics || [])
    .filter((t) => t.input.kind === 'Brand')
    .map((t) => ({ value: t.id, label: t.input.name }));
  const sceneOptions = (scenes.data || []).map((t) => ({
    value: t.id,
    label: t.input.title,
  }));
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['music-purchases'] }),
      cache.invalidateQueries({ queryKey: ['music-report'] }),
      cache.invalidateQueries({ queryKey: ['music-catalog'] }),
      cache.invalidateQueries({ queryKey: ['concerts'] }),
      cache.invalidateQueries({ queryKey: ['concert'] }),
      cache.invalidateQueries({ queryKey: ['concert-annual'] }),
    ]);
  };
  const edit = (r: PurchaseRecord | null) => {
    setEditing(r);
    form.setFieldsValue(
      r?.input || {
        purchasedOn: new Date().toLocaleDateString('sv-SE', {
          timeZone: 'Asia/Shanghai',
        }),
        currency: 'CNY',
        channel: '',
        merchant: '',
        orderNumber: '',
        transactionId: null,
        sceneId: null,
        type: 'Daily',
        state: 'Planned',
        items: [emptyItem()],
        refunds: [],
        tags: [],
        note: '',
      },
    );
  };
  if (hidden) return <Alert message="隐私模式下已隐藏商品与兴趣消费资料" />;
  if (catalog.isError)
    return <ErrorState error={catalog.error} retry={() => catalog.refetch()} />;
  const list = (purchases.data?.items || []).filter(
    (r) => section !== 'collection' || r.input.state === 'Purchased',
  );
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {(section === 'daily' || section === 'collection') && (
        <>
          <Space wrap>
            <Button type="primary" onClick={() => edit(null)}>
              新增购买 / 计划
            </Button>
            <Button onClick={() => setCards(!cards)}>
              {cards ? '表格视图' : '卡片视图'}
            </Button>
            <Link to="/transactions">前往记账</Link>
            <InterestHistoryMatch topics={catalog.data?.topics || []} />
          </Space>
          {purchases.isError ? (
            <ErrorState
              error={purchases.error}
              retry={() => purchases.refetch()}
            />
          ) : cards ? (
            <div className="concert-report-grid">
              {list.map((r) => (
                <Card
                  key={r.id}
                  title={r.input.items.map((i) => i.name).join('、')}
                  extra={<Button onClick={() => edit(r)}>编辑</Button>}
                >
                  {r.input.purchasedOn} · {r.input.currency} ·{' '}
                  {r.input.state === 'Planned' ? '购买计划' : '购买档案'}
                  <p>{r.input.merchant}</p>
                  {r.input.items.map((i) => (
                    <p key={i.id}>
                      {i.name} × {i.quantity}，实付 {i.paid}，{i.specification}
                    </p>
                  ))}
                </Card>
              ))}
            </div>
          ) : (
            <Table
              rowKey="id"
              loading={purchases.isPending}
              dataSource={list}
              scroll={{ x: 800 }}
              pagination={{
                current: page,
                pageSize: 20,
                total: purchases.data?.total,
                onChange: setPage,
              }}
              columns={[
                { title: '日期', render: (_, r) => r.input.purchasedOn },
                {
                  title: '商品',
                  render: (_, r) => r.input.items.map((i) => i.name).join('、'),
                },
                { title: '商户', render: (_, r) => r.input.merchant },
                { title: '币种', render: (_, r) => r.input.currency },
                { title: '状态', render: (_, r) => <Tag>{r.input.state}</Tag> },
                {
                  title: '付款',
                  render: (_, r) =>
                    r.input.transactionId ? (
                      <Link to={'/transactions/' + r.input.transactionId}>
                        真实交易
                      </Link>
                    ) : (
                      '计划，不计支出'
                    ),
                },
                {
                  title: '操作',
                  render: (_, r) => (
                    <Space>
                      <Button onClick={() => edit(r)}>
                        编辑 / 分配 / 退款
                      </Button>
                      {r.input.state === 'Planned' && (
                        <Button
                          onClick={async () => {
                            try {
                              await interestApi.approval(r);
                              message.success('已提交建议审批，不产生扣款');
                            } catch (e) {
                              message.error(
                                (e as Error).message || '操作失败，请重试',
                              );
                            }
                          }}
                        >
                          审批建议
                        </Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
      {section === 'catalog' && (
        <>
          <Button
            onClick={() => {
              setTopic(null);
              topicForm.setFieldsValue({ name: '', kind: 'Artist', note: '', artistProfile: { type: 'Solo', aliases: [], members: [] } });
            }}
          >
            新增艺人 / 品牌
          </Button>
          <Input aria-label="搜索艺人名称或别名" placeholder="搜索名称或别名" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} style={{ maxWidth: 320, margin: 8 }} />
          <Table
            rowKey="id"
            dataSource={catalog.data?.topics.filter(t => [t.input.name, ...(t.input.artistProfile?.aliases ?? [])].some(name => name.toLowerCase().includes(catalogSearch.toLowerCase())))}
            pagination={{ pageSize: 20 }} scroll={{ x: 1000 }}
            columns={[
              { title: '名称', render: (_, t) => t.input.name },
              {
                title: '类型',
                render: (_, t) => (t.input.kind === 'Brand' ? '品牌' : t.input.artistProfile?.type === 'Band' ? '乐队 / 组合' : t.input.artistProfile?.type === 'Solo' ? '个人艺人' : '艺人 / 乐队（未区分）'),
              },
              { title: '别名', render: (_, t) => t.input.artistProfile?.aliases.join('、') || '—' },
              { title: '成员', render: (_, t) => t.input.artistProfile?.members.map(m => `${catalog.data?.topics.find(p => p.id === m.artistId)?.input.name || m.artistId}（${m.role || '未填角色'}，${m.joinedOn || '未知'}—${m.leftOn || '未离开/未填'}）`).join('、') || '—' },
              { title: '备注', render: (_, t) => t.input.note },
              {
                title: '操作',
                render: (_, t) => (
                  <Space><Button
                    onClick={() => {
                      setTopic(t);
                      topicForm.setFieldsValue({ ...t.input, artistProfile: t.input.artistProfile ?? { type: 'Solo', aliases: [], members: [] } });
                    }}
                  >
                    编辑
                  </Button><Button onClick={() => setTopicHistory(t)}>修改历史</Button></Space>
                ),
              },
            ]}
          />
          <Card title="品牌与艺人关系">
            <Form
              form={linkForm}
              layout="inline"
              onFinish={async (b) => {
                try {
                  await interestApi.save(
                    'links',
                    {
                      ...b,
                      startsOn: b.startsOn || null,
                      endsOn: b.endsOn || null,
                      note: b.note || '',
                    },
                    editingLink,
                  );
                  setEditingLink(undefined);
                  linkForm.resetFields();
                  await refresh();
                  message.success('已保存个人专题关系');
                } catch (e) {
                  message.error((e as Error).message || '操作失败，请重试');
                }
              }}
            >
              <Form.Item name="artistId" rules={[{ required: true }]}>
                <Select
                  placeholder="艺人"
                  options={artists}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item name="brandId" rules={[{ required: true }]}>
                <Select
                  placeholder="品牌"
                  options={brands}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item name="startsOn">
                <Input type="date" aria-label="生效日期" />
              </Form.Item>
              <Form.Item name="endsOn">
                <Input type="date" aria-label="结束日期" />
              </Form.Item>
              <Form.Item>
                <Button htmlType="submit">
                  {editingLink ? '保存关系' : '添加关联'}
                </Button>
              </Form.Item>
            </Form>
            <Table
              rowKey="id"
              dataSource={catalog.data?.links}
              columns={[
                {
                  title: '艺人',
                  render: (_, x) =>
                    artists.find((a) => a.value === x.input.artistId)?.label,
                },
                {
                  title: '品牌',
                  render: (_, x) =>
                    brands.find((a) => a.value === x.input.brandId)?.label,
                },
                {
                  title: '有效期',
                  render: (_, x) =>
                    `${x.input.startsOn || '不限'} — ${x.input.endsOn || '不限'}`,
                },
                {
                  title: '操作',
                  render: (_, x) => (
                    <Button
                      onClick={() => {
                        setEditingLink(x);
                        linkForm.setFieldsValue(x.input);
                      }}
                    >
                      修改关系 / 有效期
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
      {section === 'analysis' && (
        <>
          <Space wrap>
            <InputNumber value={year} onChange={(v) => v && setYear(v)} />
            <Select
              value={currency}
              onChange={setCurrency}
              options={currencyOptions()}
            />
            <Select
              allowClear
              placeholder="全部艺人"
              value={artist}
              onChange={setArtist}
              options={artists}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="全部品牌"
              value={brand}
              onChange={setBrand}
              options={brands}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="全部场次"
              value={scene}
              onChange={setScene}
              options={sceneOptions}
              style={{ width: 180 }}
            />
            <Input.Search
              placeholder="商户筛选"
              onSearch={setMerchant}
              style={{ width: 180 }}
            />
          </Space>
          {report.isError ? (
            <ErrorState error={report.error} retry={() => report.refetch()} />
          ) : (
            report.data && (
              <>
                <Alert message={report.data.rule} />
                {report.data.warnings.map((w) => (
                  <Alert type="warning" key={w} message={w} />
                ))}
                <div className="concert-metrics">
                  {[
                    ['累计净支出', lifetime.data?.totals.net || '—'],
                    ['全年实付', report.data.totals.paid],
                    [
                      '本月净支出',
                      report.data.months.find(
                        (m) => m.month === new Date().getMonth() + 1,
                      )?.totals.net || '0.00',
                    ],
                    ['关联场次净支出', report.data.concert.net],
                    ['退款', report.data.totals.refund],
                    ['净支出', report.data.totals.net],
                    ['非场次净支出', report.data.daily.net],
                  ].map(([label, value]) => (
                    <Card key={label} title={label}>
                      {currency} {value}
                    </Card>
                  ))}
                </div>
                <Tabs
                  items={[
                    {
                      key: 'years',
                      label: '年度趋势',
                      children: (
                        <Table
                          rowKey="year"
                          dataSource={lifetime.data?.years}
                          columns={[
                            { title: '年度', dataIndex: 'year' },
                            { title: '净支出', render: (_, r) => r.totals.net },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'types',
                      label: '消费类型结构',
                      children: (
                        <Table
                          rowKey="name"
                          dataSource={report.data.types}
                          columns={[
                            {
                              title: '类型',
                              render: (_, r) =>
                                types.find((t) => t.value === r.name)?.label ||
                                r.name,
                            },
                            { title: '净支出', render: (_, r) => r.totals.net },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'months',
                      label: '月度趋势',
                      children: (
                        <Table
                          rowKey="month"
                          dataSource={report.data.months}
                          columns={[
                            { title: '月份', dataIndex: 'month' },
                            { title: '净支出', render: (_, r) => r.totals.net },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'brands',
                      label: '品牌分布',
                      children: (
                        <Table
                          rowKey={(r) => r.id || 'none'}
                          dataSource={report.data.brands}
                          columns={[
                            {
                              title: '品牌',
                              render: (_, r) =>
                                brands.find((b) => b.value === r.id)?.label ||
                                '未关联',
                            },
                            { title: '净支出', render: (_, r) => r.totals.net },
                          ]}
                        />
                      ),
                    },
                    {
                      key: 'category',
                      label: '商品类别',
                      children: (
                        <Table
                          rowKey="name"
                          dataSource={report.data.categories}
                          columns={[
                            { title: '类别', dataIndex: 'name' },
                            { title: '净支出', render: (_, r) => r.totals.net },
                          ]}
                        />
                      ),
                    },
                  ]}
                />
                <Table
                  rowKey="itemId"
                  dataSource={report.data.rows}
                  scroll={{ x: 800 }}
                  columns={[
                    { title: '商品', dataIndex: 'name' },
                    { title: '日期', dataIndex: 'date' },
                    { title: '实付', dataIndex: 'paid' },
                    { title: '退款', dataIndex: 'refund' },
                    { title: '净支出', dataIndex: 'net' },
                    {
                      title: '实际交易',
                      render: (_, r) => (
                        <Link to={'/transactions/' + r.transactionId}>
                          明细
                        </Link>
                      ),
                    },
                  ]}
                />
                <Card title="专题预算（分析口径，不重复扣减分类预算）">
                  <Form
                    layout="inline"
                    onFinish={async (b) => {
                      try {
                        await interestApi.save('budgets', {
                          ...b,
                          year,
                          currency,
                          month: b.month || null,
                          artistId: artist || null,
                          brandId: brand || null,
                        });
                        await refresh();
                        message.success('预算已保存');
                      } catch (e) {
                        message.error(
                          (e as Error).message || '操作失败，请重试',
                        );
                      }
                    }}
                  >
                    <Form.Item name="name" rules={[{ required: true }]}>
                      <Input placeholder="预算名称" />
                    </Form.Item>
                    <Form.Item name="scope" initialValue="Daily">
                      <Select
                        options={[
                          { value: 'All', label: '全部' },
                          { value: 'Daily', label: '日常' },
                          { value: 'Concert', label: '演唱会' },
                        ]}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item name="month">
                      <InputNumber
                        min={1}
                        max={12}
                        placeholder="月度（可选）"
                      />
                    </Form.Item>
                    <Form.Item name="amount" rules={[{ required: true }]}>
                      <Input placeholder="预算金额" />
                    </Form.Item>
                    <Button htmlType="submit">保存当前筛选预算</Button>
                  </Form>
                  {report.data.budgets.map((b) => (
                    <Alert
                      key={b.input.name}
                      type={b.warning ? 'warning' : 'info'}
                      message={`${b.input.name}：已用 ${b.actual}，剩余 ${b.remaining}`}
                    />
                  ))}
                </Card>
              </>
            )
          )}
        </>
      )}
      <Modal
        open={topic !== undefined}
        title="艺人 / 品牌"
        onCancel={() => setTopic(undefined)}
        onOk={() => topicForm.submit()}
      >
        <Form
          form={topicForm}
          layout="vertical"
          onFinish={async (b) => {
            try {
              const profile = b.artistProfile as ArtistProfile | undefined;
              await interestApi.save('topics', { ...b, artistProfile: b.kind === 'Artist' ? {
                type: profile?.type || 'Solo', aliases: profile?.aliases || [],
                members: profile?.type === 'Band' ? (profile.members || []).map(m => ({ ...m, role: m.role || '', joinedOn: m.joinedOn || null, leftOn: m.leftOn || null })) : [],
              } : null }, topic || undefined);
              await cache.invalidateQueries({ queryKey: ['music-topic-history'] });
              await refresh();
              setTopic(undefined);
            } catch (e) {
              message.error((e as Error).message || '操作失败，请重试');
            }
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="kind" label="类型">
            <Select
              disabled={!!topic}
              options={[
                { value: 'Artist', label: '艺人 / 乐队' },
                { value: 'Brand', label: '品牌' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea />
          </Form.Item>
          {topicKind === 'Artist' && <ArtistProfileFields topics={catalog.data?.topics ?? []} currentId={topic?.id} />}
        </Form>
      </Modal>
      {topicHistory && <TopicHistory topic={topicHistory} topics={catalog.data?.topics ?? []} onClose={() => setTopicHistory(undefined)} />}
      <Modal
        width={1000}
        open={editing !== undefined}
        title="购买记录 / 计划"
        confirmLoading={saving}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (b) => {
            setSaving(true);
            try {
              await interestApi.save(
                'purchases',
                {
                  ...b,
                  transactionId: b.transactionId || null,
                  sceneId: b.sceneId || null,
                },
                editing || undefined,
              );
              await refresh();
              setEditing(undefined);
              message.success('已保存，未额外创建资金流水');
            } catch (e) {
              message.error((e as Error).message || '操作失败，请重试');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Space wrap>
            <Form.Item
              name="purchasedOn"
              label="购买日期"
              rules={[{ required: true }]}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item name="currency" label="币种">
              <Select options={currencyOptions()} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="state" label="记录类型">
              <Select
                options={[
                  { value: 'Planned', label: '计划 / 心愿' },
                  { value: 'Purchased', label: '真实购买' },
                  { value: 'Cancelled', label: '已取消' },
                ]}
                style={{ width: 150 }}
              />
            </Form.Item>
            <Form.Item name="type" label="消费类型">
              <Select options={types} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="sceneId" label="场次（可选，仅明确关联）">
            <Select allowClear options={sceneOptions} />
          </Form.Item>
          <Form.Item
            name="transactionId"
            label="付款交易（真实购买必填；实际账户沿用原交易）"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={(choices.data || [])
                .filter((t) => t.type === 'Expense' && !t.businessId)
                .map((t) => ({
                  value: t.id,
                  label: `${t.merchant || t.note || t.id} · ${t.amount} ${t.currency}`,
                }))}
            />
          </Form.Item>
          <Space wrap>
            {[
              ['merchant', '商户'],
              ['channel', '购买渠道'],
              ['orderNumber', '订单编号'],
            ].map(([key, label]) => (
              <Form.Item name={key} label={label} key={key}>
                <Input />
              </Form.Item>
            ))}
          </Space>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Card
                    key={f.key}
                    size="small"
                    title={`商品 ${f.name + 1}`}
                    extra={
                      <Button onClick={() => remove(f.name)}>移除明细</Button>
                    }
                  >
                    <Form.Item
                      name={[f.name, 'related']}
                      valuePropName="checked"
                    >
                      <Checkbox>
                        计入兴趣专题（普通商品取消勾选，并清空艺人与品牌）
                      </Checkbox>
                    </Form.Item>
                    <Form.Item name={[f.name, 'id']} hidden>
                      <Input />
                    </Form.Item>
                    <Space wrap>
                      <Form.Item
                        name={[f.name, 'name']}
                        label="商品名称"
                        rules={[{ required: true }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name={[f.name, 'brandId']} label="品牌">
                        <Select
                          allowClear
                          options={brands}
                          style={{ width: 150 }}
                        />
                      </Form.Item>
                      <Form.Item name={[f.name, 'category']} label="类别">
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[f.name, 'specification']}
                        label="款式 / 尺码 / 颜色 / 版本"
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name={[f.name, 'quantity']} label="数量">
                        <InputNumber min={1} precision={0} />
                      </Form.Item>
                      {[
                        ['unitPrice', '单价'],
                        ['discount', '优惠合计'],
                        ['shipping', '运费'],
                        ['tax', '税费'],
                        ['paid', '实付'],
                      ].map(([key, label]) => (
                        <Form.Item
                          key={key}
                          name={[f.name, key]}
                          label={label}
                          rules={[{ required: true }]}
                        >
                          <Input style={{ width: 100 }} />
                        </Form.Item>
                      ))}
                      <Form.Item name={[f.name, 'purpose']} label="用途">
                        <Select
                          style={{ width: 120 }}
                          options={[
                            'Daily',
                            'Support',
                            'Collection',
                            'Gift',
                            'Other',
                          ].map((value, i) => ({
                            value,
                            label: ['日常', '应援', '收藏', '赠送', '其他'][i],
                          }))}
                        />
                      </Form.Item>
                      <Form.Item name={[f.name, 'state']} label="商品状态">
                        <Select
                          style={{ width: 120 }}
                          options={[
                            'Pending',
                            'Held',
                            'Gifted',
                            'Sold',
                            'Returned',
                          ].map((value, i) => ({
                            value,
                            label: ['待收货', '持有', '赠送', '出售', '退货'][
                              i
                            ],
                          }))}
                        />
                      </Form.Item>
                    </Space>
                    <Form.List name={[f.name, 'artists']}>
                      {(shares, ops) => (
                        <>
                          {shares.map((a) => (
                            <Space key={a.key}>
                              <Form.Item
                                name={[a.name, 'artistId']}
                                rules={[{ required: true }]}
                              >
                                <Select
                                  placeholder="关联艺人"
                                  options={artists}
                                  style={{ width: 180 }}
                                />
                              </Form.Item>
                              <Form.Item
                                name={[a.name, 'amount']}
                                rules={[{ required: true }]}
                              >
                                <Input placeholder="明确分配金额" />
                              </Form.Item>
                              <Button onClick={() => ops.remove(a.name)}>
                                解除艺人关联
                              </Button>
                            </Space>
                          ))}
                          <Button onClick={() => ops.add({ amount: '0' })}>
                            添加艺人分配
                          </Button>
                        </>
                      )}
                    </Form.List>
                    <Form.Item name={[f.name, 'note']} label="商品备注">
                      <Input.TextArea />
                    </Form.Item>
                  </Card>
                ))}
                <Button onClick={() => add(emptyItem())}>添加商品明细</Button>
              </>
            )}
          </Form.List>
          <Form.List name="refunds">
            {(fields, ops) => (
              <>
                <p>退款分配（先在原账本登记退款）</p>
                {fields.map((f) => (
                  <Space key={f.key}>
                    <Form.Item
                      name={[f.name, 'transactionId']}
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="真实退款交易ID" />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'itemId']}
                      rules={[{ required: true }]}
                    >
                      <Select
                        placeholder="退款商品"
                        options={(form.getFieldValue('items') || []).map(
                          (i: Item) => ({ value: i.id, label: i.name }),
                        )}
                        style={{ width: 160 }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'amount']}
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="分配退款金额" />
                    </Form.Item>
                    <Button onClick={() => ops.remove(f.name)}>移除</Button>
                  </Space>
                ))}
                <Button onClick={() => ops.add({ amount: '0' })}>
                  添加退款分配
                </Button>
              </>
            )}
          </Form.List>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          {editing && (
            <InterestFiles
              record={editing}
              onVersion={(version) => setEditing({ ...editing, version })}
            />
          )}
          {editing && <InterestAdvice record={editing} />}
        </Form>
      </Modal>
    </Space>
  );
}
