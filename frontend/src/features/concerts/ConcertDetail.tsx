import { useState } from 'react';
import { concertLocalTime } from './time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'antd';
import { Link } from 'react-router-dom';
import { useUI } from '../../stores/ui';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { Select } from '../../components/TouchSelect';
import { TransactionDrawer } from '../transactions/TransactionDrawer';
import { saveBlob } from '../../utils/download';
import { decimal, minor } from '../../utils/finance';
import { t as tr } from '../../i18n';
import { concertApi } from './api';
import type {
  Concert,
  Cost,
  Order,
  Planned,
  Refund,
  Companion,
  Scene,
  Ticket,
} from './api';
import { categories, orderStates, refundStates, sceneStates } from './labels';
import { DataEditor, SceneEditor } from './ConcertForms';
import { ConcertClosingPanel } from './ConcertClosingPanel';
import { ConcertPayablesPanel } from './ConcertPayablesPanel';
import { interestApi } from './interestApi';
import type { Field } from './ConcertForms';

type Collection = 'orders' | 'costs' | 'plans' | 'refunds' | 'companions';
type Row = Order | Cost | Planned | Refund | Companion;
const opts = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label: tr(label) }));
function auditSummary(raw: string) {
  try {
    const event = JSON.parse(raw) as {
      from?: string;
      to?: string;
      orderChanges?: {
        from?: string;
        to: string;
        refundFrom?: string;
        refundTo: string;
      }[];
      refundChanges?: { from?: string; to: string }[];
      before?: Ticket[];
      after?: Ticket[];
    };
    const parts: string[] = [];
    if (Array.isArray(event.after)) {
      for (const [index, ticket] of event.after.entries()) {
        const before = Array.isArray(event.before) ? event.before.find(t => t.id === ticket.id)?.gift : undefined;
        if (JSON.stringify(before) !== JSON.stringify(ticket.gift)) {
          const describe = (gift: Ticket['gift']) => gift ? `${gift.from} → ${gift.recipient}，${gift.giftedOn}，${gift.state === 'Given' ? '已登记赠送' : '记录已撤销'}，${gift.platformAllowed ? '用户已确认平台规则' : '用户未确认平台规则'}${gift.note ? `，备注：${gift.note}` : ''}` : '无赠送记录';
          parts.push(`门票 ${index + 1} 赠送记录：${describe(before)} → ${describe(ticket.gift)}`);
        }
        const previousSale = Array.isArray(event.before) ? event.before.find(t => t.id === ticket.id)?.transfer : undefined;
        if (JSON.stringify(previousSale) !== JSON.stringify(ticket.transfer)) {
          const describeSale = (sale: Ticket['transfer']) => sale ? `${sale.seller} → ${sale.buyer}，${sale.transferredOn}，约定 ${sale.agreedAmount}，${sale.state === 'Recorded' ? '已登记转让' : '记录已撤销'}，收款明细 ${sale.receipts.map(p => p.amount).join('、') || '无'}，返款明细 ${sale.returns.map(p => p.amount).join('、') || '无'}${sale.note ? `，备注：${sale.note}` : ''}` : '无转让记录';
          parts.push(`门票 ${index + 1} 转让：${describeSale(previousSale)} → ${describeSale(ticket.transfer)}`);
        }
      }
    }
    if (event.to && event.from !== event.to)
      parts.push(
        `${tr('场次')}：${tr(sceneStates[event.from || ''] || '新建')} → ${tr(sceneStates[event.to] || event.to)}`,
      );
    for (const order of event.orderChanges || []) {
      if (order.from !== order.to)
        parts.push(
          `${tr('订单')}：${tr(orderStates[order.from || ''] || '新建')} → ${tr(orderStates[order.to] || order.to)}`,
        );
      if (order.refundFrom !== order.refundTo)
        parts.push(
          `${tr('订单退款')}：${tr(refundStates[order.refundFrom || ''] || '未申请')} → ${tr(refundStates[order.refundTo] || order.refundTo)}`,
        );
    }
    for (const refund of event.refundChanges || [])
      parts.push(
        `${tr('退款进度')}：${tr(refundStates[refund.from || ''] || '新建')} → ${tr(refundStates[refund.to] || refund.to)}`,
      );
    return parts.join('；') || tr('档案资料、费用关联或附件已更新');
  } catch {
    return tr('档案已更新');
  }
}
interface Edit {
  kind: Collection;
  row: Record<string, unknown>;
  base: Scene;
}
export function ConcertDetail({
  id,
  scenes,
  onClose,
}: {
  id: string;
  scenes: Scene[];
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['concert', id],
    queryFn: () => concertApi.detail(id),
  });
  const cache = useQueryClient();
  const artistCatalog=useQuery({queryKey:['music-catalog'],queryFn:interestApi.catalog});
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const openEntry = useUI((s) => s.openEntry);
  const [editScene, setEditScene] = useState(false);
  const [editor, setEditor] = useState<Edit>();
  const [keyword, setKeyword] = useState('');
  const [transaction, setTransaction] = useState<string>();
  const [orderAttachment, setOrderAttachment] = useState('');
  const [uploading, setUploading] = useState(false);
  const choices = useQuery({
    queryKey: [
      'concert-transactions',
      q.data?.input.currency,
      keyword,
      editor?.kind === 'refunds',
    ],
    enabled: !!editor,
    queryFn: () =>
      concertApi.transactions(
        q.data!.input.currency,
        keyword,
        editor?.kind === 'refunds',
      ),
  });
  const advances = useQuery({
    queryKey: ['concert-advances', q.data?.input.currency, keyword],
    enabled: editor?.kind === 'companions',
    queryFn: () => concertApi.advances(q.data!.input.currency, keyword),
  });
  const attachments = useQuery({
    queryKey: ['concert-attachments', id],
    queryFn: () => concertApi.attachments(id),
  });
  const history = useQuery({
    queryKey: ['concert-history', id],
    queryFn: () => concertApi.history(id),
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['concert', id] }),
      cache.invalidateQueries({ queryKey: ['concert', 'tour-report'] }),
      cache.invalidateQueries({ queryKey: ['concerts'] }),
      cache.invalidateQueries({ queryKey: ['concert-annual'] }),
      cache.invalidateQueries({ queryKey: ['concert-history', id] }),
      cache.invalidateQueries({ queryKey: ['concert-attachments', id] }),
    ]);
  };
  const d = q.data;
  const c = d?.input;
  const r = d?.report;
  const money = (value: string) => (
    <Money value={value} currency={c!.currency as 'CNY'} />
  );
  const newRow = (kind: Collection, row?: Row) => {
    if (!d || hidden) return;
    setKeyword('');
    const defaults: Record<Collection, Row> = {
      orders: {
        id: crypto.randomUUID(),
        platform: c?.platform || '',
        number: '',
        orderedOn: null,
        paidOn: null,
        facePrice: '0.00',
        quantity: 1,
        paidAmount: '0.00',
        fee: '0.00',
        tier: '',
        seat: '',
        holder: '',
        state: 'Planning',
        refundState: 'None',
        paymentTransactionId: null,
        paymentParts: [],
        attachmentIds: [],
      },
      costs: {
        id: crypto.randomUUID(),
        category: 'Ticket',
        transactionId: '',
        entryId: null,
        amount: '0.00',
        payer: '本人',
        bearer: '本人',
      },
      plans: {
        id: crypto.randomUUID(),
        category: 'Ticket',
        title: '',
        amount: '0.00',
        state: 'Planned',
        costId: null,
      },
      refunds: {
        id: crypto.randomUUID(),
        costId: '',
        state: 'Requested',
        requestedAmount: '0.00',
        nonRefundable: '0.00',
        transactionId: null,
        receivedAmount: '0.00',
        note: '',
      },
      companions: {
        id: crypto.randomUUID(),
        name: '',
        holder: '',
        payer: '本人',
        bearer: '',
        ratio: 100,
        amount: '0.00',
        advanceId: null,
        costId: null,
      },
    };
    setEditor({ kind, row: { ...(row || defaults[kind]) }, base: d });
  };
  const transactionOptions = (choices.data || []).map((t) => ({
    value: t.id,
    label: `${t.occurredAt.slice(0, 10)} ${t.merchant || t.note || t.type} · ${t.amount} ${t.currency} · ${t.id.slice(0, 8)}`,
  }));
  const allCosts: Cost[] = [
    ...(c?.costs || []),
    ...(c?.orders || []).flatMap((o) => {
      const combined = !!o.paymentParts?.length;
      const parts = combined
        ? o.paymentParts!
        : o.paymentTransactionId
          ? [
              {
                transactionId: o.paymentTransactionId,
                amount: o.paidAmount,
                fee: o.fee,
              },
            ]
          : [];
      return parts.flatMap((p, index) => {
        const suffix = combined ? ':' + index : '';
        return [
          {
            id: 'ticket:' + o.id + suffix,
            category: 'Ticket',
            transactionId: p.transactionId,
            amount: decimal(minor(p.amount) - minor(p.fee)),
            entryId: null,
            payer: '本人',
            bearer: o.holder,
          },
          {
            id: 'fee:' + o.id + suffix,
            category: 'Fee',
            transactionId: p.transactionId,
            amount: p.fee,
            entryId: null,
            payer: '本人',
            bearer: o.holder,
          },
        ].filter((x) => minor(x.amount) > 0n);
      });
    }),
  ];
  const costOptions = allCosts.map((x) => ({
    value: x.id,
    label: `${tr(categories[x.category])} · ${x.amount} · ${x.id.startsWith('ticket:') ? tr('订单门票') : x.id.startsWith('fee:') ? tr('订单手续费') : x.transactionId.slice(0, 8)}`,
  }));
  const txField = (
    name = 'transactionId',
    label = '关联真实交易',
    required = true,
  ): Field => ({
    name,
    label,
    required,
    options: transactionOptions,
    search: setKeyword,
    hint: '可输入商户、备注或交易ID搜索，最多显示最近100笔；金额须明确分配。',
  });
  const categoryField: Field = {
    name: 'category',
    label: '费用类别',
    required: true,
    options: opts(categories),
  };
  const fields: Record<Collection, Field[]> = {
    orders: [
      {name:'origin',label:'门票付款 / 免费获赠来源',kind:'ticket-origin'},
      {name:'artistAllocation',label:'订单门票及手续费的艺人比例覆盖',kind:'artist-allocation',disabled:artistCatalog.isPending||artistCatalog.isError,options:artistCatalog.data?.topics.filter(t=>t.input.kind==='Artist').map(t=>({value:t.id,label:t.input.name}))??[],hint:'先启用场次联合费用模式。此处默认模式沿用场次比例，明确比例覆盖本订单门票和手续费；商品保持独立。'},
      { name: 'platform', label: '票务平台', required: true },
      { name: 'number', label: '订单编号' },
      { name: 'orderedOn', label: '下单日期', kind: 'date' },
      { name: 'paidOn', label: '支付日期', kind: 'date' },
      {
        name: 'facePrice',
        label: '单张票面价格',
        kind: 'amount',
        required: true,
      },
      { name: 'quantity', label: '张数', kind: 'number', required: true },
      {
        name: 'paidAmount',
        label: '实付总额（含手续费）',
        kind: 'amount',
        required: true,
      },
      { name: 'fee', label: '其中手续费', kind: 'amount', required: true },
      { name: 'tier', label: '票档' },
      { name: 'seat', label: '座位' },
      { name: 'holder', label: '持票人（姓名或昵称）' },
      { name: 'tickets', label: '逐张门票档案', kind: 'tickets', currency: c?.currency },
      {
        name: 'state',
        label: '订单状态',
        required: true,
        options: opts(orderStates),
      },
      {
        name: 'refundState',
        label: '订单退款状态',
        required: true,
        options: opts(refundStates),
      },
      txField(
        'paymentTransactionId',
        '关联付款交易（不会自动创建流水）',
        false,
      ),
      {
        name: 'paymentParts',
        label: '组合付款（代付或多笔来源，可选）',
        kind: 'payments',
        options: transactionOptions,
        search: setKeyword,
        hint: '使用组合付款时请清空单笔付款；各来源金额合计须等于订单实付，手续费合计也须一致。代付分别选择原本人支出和原应收垫付，不再创建重复付款。',
      },
    ],
    costs: [
      {name:'artistAllocation',label:'本笔费用艺人比例覆盖',kind:'artist-allocation',disabled:artistCatalog.isPending||artistCatalog.isError,options:artistCatalog.data?.topics.filter(t=>t.input.kind==='Artist').map(t=>({value:t.id,label:t.input.name}))??[],hint:'先启用场次联合费用模式。默认模式沿用场次比例，明确比例只覆盖本费用，退款按原分币权重冲减。'},
      categoryField,
      txField(),
      {
        name: 'entryId',
        label: '交易拆分分录（可选）',
        options: (choices.data || []).flatMap((t) =>
          t.entries.map((e) => ({
            value: e.id,
            label: `${t.id.slice(0, 8)} · ${e.amount} · ${e.categoryId.slice(0, 8)}`,
          })),
        ),
      },
      { name: 'amount', label: '本场归属金额', kind: 'amount', required: true },
      { name: 'payer', label: '实际付款人' },
      { name: 'bearer', label: '费用承担人' },
    ],
    plans: [
      categoryField,
      { name: 'title', label: '计划费用名称', required: true },
      { name: 'amount', label: '计划金额', kind: 'amount', required: true },
      {
        name: 'state',
        label: '计划状态',
        required: true,
        options: opts({
          Planned: '未发生',
          Realized: '已发生并关联',
          Cancelled: '已取消',
        }),
      },
      { name: 'costId', label: '关联已发生费用', options: costOptions },
    ],
    refunds: [
      { name: 'ticketId', label: '逐票退款归属（可选）', options: [{ value: '__order__', label: '整笔费用（不指定门票）' }, ...(c?.orders ?? []).flatMap(o => (o.tickets ?? []).map(t => ({ value: t.id, label: `${o.number || o.platform} · ${t.seat || t.attendee || t.id} · 实付分配 ${t.paidShare ?? '未填'}` })))], hint: '先在门票档案填写本票实付分配。退款必须关联同订单的原费用与真实退款流水，不能再重复新增一笔退款。' },
      {
        name: 'costId',
        label: '原费用分配',
        required: true,
        options: costOptions,
      },
      {
        name: 'state',
        label: '退款进度',
        required: true,
        options: opts(refundStates),
      },
      {
        name: 'requestedAmount',
        label: '申请退款金额',
        kind: 'amount',
        required: true,
      },
      {
        name: 'nonRefundable',
        label: '不可退费用 / 服务费扣除',
        kind: 'amount',
        required: true,
      },
      txField('transactionId', '原交易下的实际退款流水', false),
      {
        name: 'receivedAmount',
        label: '本场实际到账金额',
        kind: 'amount',
        required: true,
      },
      { name: 'note', label: '备注', kind: 'textarea' },
    ],
    companions: [
      { name: 'name', label: '同行者姓名或昵称', required: true },
      { name: 'holder', label: '持票人' },
      { name: 'payer', label: '实际付款人' },
      { name: 'bearer', label: '费用承担人' },
      { name: 'costId', label: '分摊所属费用', options: costOptions },
      { name: 'ratio', label: '分摊比例（%）', kind: 'number', required: true },
      { name: 'amount', label: '分摊金额', kind: 'amount', required: true },
      {
        name: 'advanceId',
        label: '关联现有代买代付应收（可选）',
        search: setKeyword,
        options: (advances.data || [])
          .filter((a) => a.currency === c?.currency)
          .map((a) => ({
            value: a.id,
            label: `${a.name} · ${a.receivable} ${a.currency}`,
          })),
        hint: '关联完整应收及其原始垫付流水；已结算与待结算从原服务读取，未关联仅作分摊计划。',
      },
    ],
  };
  const rowButton = (kind: Collection) => (
    <Button
      aria-label={tr('新增')}
      disabled={hidden}
      onClick={() => newRow(kind)}
    >
      {tr('新增')}
    </Button>
  );
  const editButton = (kind: Collection, row: Row) => (
    <Button type="link" disabled={hidden} onClick={() => newRow(kind, row)}>
      {tr('编辑')}
    </Button>
  );
  const costTab = (
    <>
      <Space className="mb16" wrap>
        {rowButton('costs')}
        <Button onClick={() => openEntry('Expense')}>
          {tr('使用原记账流程新增支出')}
        </Button>
        <Input.Search
          placeholder={tr('已知交易ID：查看或核对原交易')}
          onSearch={setTransaction}
          style={{ width: 300 }}
        />
      </Space>
      <Table<Cost>
        rowKey="id"
        dataSource={allCosts}
        scroll={{ x: 850 }}
        columns={[
          { title: tr('类别'), render: (_, x) => tr(categories[x.category]) },
          { title: tr('归属金额'), render: (_, x) => money(x.amount) },
          {
            title: tr('付款人 / 承担人'),
            render: (_, x) => (
              <Sensitive>
                {x.payer} / {x.bearer}
              </Sensitive>
            ),
          },
          {
            title: tr('交易'),
            render: (_, x) => (
              <Button
                type="link"
                onClick={() => setTransaction(x.transactionId)}
              >
                {tr('查看原交易')}
              </Button>
            ),
          },
          {
            title: tr('操作'),
            render: (_, x) =>
              x.id.includes(':')
                ? tr('由门票订单管理')
                : editButton('costs', x),
          },
        ]}
      />
    </>
  );
  return (
    <Drawer
      open
      width="min(1250px, 100vw)"
      title={tr('演唱会档案')}
      onClose={onClose}
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !d || !c || !r ? (
        <Empty description={tr('正在加载')} />
      ) : (
        <>
          <Space wrap className="mb16">
            <h2>
              <Sensitive>{c.title}</Sensitive>
            </h2>
            <Tag>{tr(sceneStates[c.state])}</Tag>
            <Button disabled={hidden} onClick={() => setEditScene(true)}>
              {tr('编辑档案 / 场次状态')}
            </Button>
          </Space>
          <Descriptions
            column={{ xs: 1, md: 3 }}
            items={[
              {
                key: 'artist',
                label: tr('艺人 / 巡演'),
                children: (
                  <Sensitive>
                    {c.artist} / {c.tourName || '—'}
                    <div>{c.artistLink?.artistId ? '已关联主艺人档案' : c.artistLink ? '未关联艺人档案' : '历史名称口径'}</div>
                  </Sensitive>
                ),
              },
              {
                key: 'date',
                label: tr('开始时间'),
                children: concertLocalTime(c),
              },
              {
                key: 'venue',
                label: tr('城市 / 场馆'),
                children: `${c.city} / ${c.venue}`,
              },
              {
                key: 'people',
                label: tr('预计 / 实际人数'),
                children: `${c.expectedPeople} / ${c.actualPeople}`,
              },
              {
                key: 'number',
                label: tr('内部场次编号'),
                children: c.sessionNumber || '—',
              },
              {
                key: 'organizer',
                label: tr('主办方 / 平台'),
                children: `${c.organizer || '—'} / ${c.platform || '—'}`,
              },
              {
                key: 'note',
                label: tr('备注'),
                children: <Sensitive>{c.note || '—'}</Sensitive>,
              },
            ]}
          />
          {r.warnings.map((w) => (
            <Alert
              key={w}
              className="mb16"
              type="warning"
              showIcon
              message={w}
            />
          ))}
          <ConcertClosingPanel detail={q.data!} onSaved={refresh}/>
          <ConcertPayablesPanel currency={c.currency} onSaved={refresh}/>
          {r.ticketTransfers && r.ticketTransfers.rows.length > 0 && <Card title="转让票款与回收后净负担" className="mb16">
            <Space wrap><span>已收：{money(r.ticketTransfers.received)}</span><span>实际返款：{money(r.ticketTransfers.returned)}</span><span>有效净回收：{money(r.ticketTransfers.netRecovery)}</span><span>回收后净负担：{r.personalAfterTransfers != null ? money(r.personalAfterTransfers) : '—'}</span></Space>
            <Table rowKey="ticketId" dataSource={r.ticketTransfers.rows} pagination={false} scroll={{ x: 950 }} columns={[
              { title: '转让人 / 买家', render: (_, sale) => `${sale.seller} / ${sale.buyer}` },
              { title: '已收', render: (_, sale) => money(sale.received) }, { title: '已返', render: (_, sale) => money(sale.returned) },
              { title: '原代付已结算（不重复冲减成本）', render: (_,sale) => money(sale.advanceSettlement??'0.00') }, { title: '有效净回收', render: (_, sale) => money(sale.netRecovery) }, { title: '未收约定额（仅提醒）', render: (_, sale) => money(sale.uncollected) },
              { title: '撤销记录待核对返款', render: (_, sale) => money(sale.pendingReturn) },
              { title: '真实流水', render: (_, sale) => <Space direction="vertical">{sale.receipts.map(p => <Button key={p.transactionId} onClick={() => setTransaction(p.transactionId)}>收入 {p.amount}</Button>)}{sale.returns.map(p => <Button key={p.transactionId} onClick={() => setTransaction(p.transactionId)}>返款 {p.amount}</Button>)}</Space> },
            ]} />
          </Card>}
          {r.artistAttribution && <Card title="联合演出艺人费用归属" className="mb16">
            <Table rowKey={artist => artist.artistId || 'unassigned'} dataSource={r.artistAttribution} pagination={false} scroll={{ x: 950 }} columns={[
              { title: '艺人 / 未分配', dataIndex: 'name' },
              { title: '场次原费用比例', render: (_, artist) => artist.sceneRatio == null ? '商品独立分配' : `${artist.sceneRatio}%` },
              { title: '已确认原费用', render: (_, artist) => money(artist.originalCosts) },
              { title: '已核实退款', render: (_, artist) => money(artist.confirmedRefunds) },
              { title: '全场净费用归属', render: (_, artist) => money(artist.actual) },
              { title: '本人普通消费净额', render: (_, artist) => money(artist.ownExpenseNet) },
              { title: '已确认赠送/核销', render: (_, artist) => money(artist.confirmedLoss) },
              { title: '个人最终自担', render: (_, artist) => money(artist.personalNetCost) },
            ]} />
          </Card>}
          <Tabs
            items={[
              {
                key: 'summary',
                label: tr('统计与预算'),
                children: (
                  <>
                    <div className="concert-metrics">
                      {(
                        [
                          ['场次总预算', r.totalBudget],
                          ['原始费用', r.originalCosts],
                          ['已确认退款', r.confirmedRefunds],
                          ['全场净费用', r.actual],
                          ['本人净成本', r.personalNetCost],
                          ['未发生计划费用', r.planned],
                          ['预算剩余', r.remaining],
                          ['计入计划后可用', r.availableAfterPlans],
                          ['超支金额', r.overspent],
                          ['待结算垫付', r.pendingAdvances],
                        ] as const
                      ).map(([label, value]) => (
                        <Card size="small" key={label}>
                          <span>{tr(label)}</span>
                          <div>{money(value)}</div>
                        </Card>
                      ))}
                    </div>
                    <p>
                      {tr('预算使用率')}：
                      {r.budgetUsage == null ? '—' : r.budgetUsage + '%'}
                    </p>
                    <Table
                      rowKey="category"
                      dataSource={r.budgets}
                      pagination={false}
                      scroll={{ x: 700 }}
                      columns={[
                        {
                          title: tr('预算类别'),
                          render: (_, x) => tr(categories[x.category]),
                        },
                        ...(
                          [
                            'budget',
                            'actual',
                            'planned',
                            'remaining',
                            'overspent',
                          ] as const
                        ).map((key, i) => ({
                          title: tr(
                            [
                              '预算金额',
                              '实际已发生',
                              '未发生计划费用',
                              '预算剩余',
                              '超支金额',
                            ][i],
                          ),
                          render: (_: unknown, x: (typeof r.budgets)[number]) =>
                            money(x[key]),
                        })),
                      ]}
                    />
                    <h3>{tr('费用类别占比')}</h3>
                    <Table
                      rowKey="category"
                      dataSource={r.categories}
                      pagination={false}
                      columns={[
                        {
                          title: tr('类别'),
                          render: (_, x) => tr(categories[x.category]),
                        },
                        {
                          title: tr('净费用'),
                          render: (_, x) => money(x.actual),
                        },
                        { title: tr('占比'), render: (_, x) => `${x.share}%` },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'orders',
                label: tr('门票订单'),
                children: (
                  <>
                    <Space className="mb16" wrap>
                      {rowButton('orders')}
                      <Button onClick={() => openEntry('Expense')}>
                        {tr('使用原记账流程付款')}
                      </Button>
                    </Space>
                    <Table<Order>
                      rowKey="id"
                      dataSource={c.orders}
                      scroll={{ x: 1100 }}
                      columns={[
                        {
                          title: tr('平台 / 订单号'),
                          render: (_, o) => (
                            <Sensitive>
                              {o.platform} / {o.number || '—'}
                            </Sensitive>
                          ),
                        },
                        {
                          title: tr('单张票面价 / 张数'),
                          render: (_, o) => (
                            <>
                              {money(o.facePrice)} × {o.quantity}
                            </>
                          ),
                        },
                        {
                          title: tr('实付总额'),
                          render: (_, o) => money(o.paidAmount),
                        },
                        {
                          title: tr('其中手续费'),
                          render: (_, o) => money(o.fee),
                        },
                        {
                          title: tr('票档 / 座位 / 持票人'),
                          render: (_, o) => (
                            <Sensitive>
                              {o.tier} / {o.seat} / {o.holder}
                              {(o.tickets ?? []).map(ticket => <div key={ticket.id}>
                                {ticket.tier} / {ticket.seat} / {ticket.attendee} · {ticket.format === 'Paper' ? '纸质票' : '电子票'} · {{ Pending: '待领取', Received: '已领取', Used: '已使用', Cancelled: '已取消' }[ticket.state]}
                                {ticket.gift && <div>赠送记录：{ticket.gift.from} → {ticket.gift.recipient} · {ticket.gift.giftedOn} · {ticket.gift.state === 'Given' ? '已登记赠送' : '记录已撤销'}</div>}
                                {ticket.transfer && <div>转让记录：{ticket.transfer.seller} → {ticket.transfer.buyer} · {ticket.transfer.transferredOn} · {ticket.transfer.state === 'Recorded' ? '已登记' : '记录已撤销'} · 约定 {money(ticket.transfer.agreedAmount)}</div>}
                              </div>)}
                            </Sensitive>
                          ),
                        },
                        {
                          title: tr('订单状态'),
                          render: (_, o) => tr(orderStates[o.state]),
                        },
                        {
                          title: tr('退款状态'),
                          render: (_, o) => tr(refundStates[o.refundState]),
                        },
                        {
                          title: tr('操作'),
                          render: (_, o) => editButton('orders', o),
                        },
                      ]}
                    />
                  </>
                ),
              },
              { key: 'costs', label: tr('专项费用'), children: costTab },
              {
                key: 'plans',
                label: tr('计划费用'),
                children: (
                  <>
                    {rowButton('plans')}
                    <Table<Planned>
                      rowKey="id"
                      dataSource={c.plans}
                      columns={[
                        { title: tr('名称'), dataIndex: 'title' },
                        {
                          title: tr('类别'),
                          render: (_, p) => tr(categories[p.category]),
                        },
                        {
                          title: tr('计划金额'),
                          render: (_, p) => money(p.amount),
                        },
                        {
                          title: tr('状态'),
                          render: (_, p) =>
                            tr(
                              p.state === 'Planned'
                                ? '未发生'
                                : p.state === 'Realized'
                                  ? '已发生并关联'
                                  : '已取消',
                            ),
                        },
                        {
                          title: tr('操作'),
                          render: (_, p) => editButton('plans', p),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'refunds',
                label: tr('退款与取消'),
                children: (
                  <>
                    <Space className="mb16" wrap>
                      {rowButton('refunds')}
                      <Button onClick={() => openEntry('Refund')}>
                        {tr('使用原退款记账流程')}
                      </Button>
                    </Space>
                    <Table<Refund>
                      rowKey="id"
                      expandable={{expandedRowRender:r=><Sensitive>逐票归属：{r.ticketId??'整笔费用'}</Sensitive>}}
                      dataSource={c.refunds}
                      scroll={{ x: 800 }}
                      columns={[
                        {
                          title: tr('原费用'),
                          render: (_, x) =>
                            costOptions.find((o) => o.value === x.costId)
                              ?.label,
                        },
                        {
                          title: tr('申请金额'),
                          render: (_, x) => money(x.requestedAmount),
                        },
                        {
                          title: tr('不可退费用'),
                          render: (_, x) => money(x.nonRefundable),
                        },
                        {
                          title: tr('实际到账'),
                          render: (_, x) => money(x.receivedAmount),
                        },
                        {
                          title: tr('退款进度'),
                          render: (_, x) => tr(refundStates[x.state]),
                        },
                        {
                          title: tr('操作'),
                          render: (_, x) => editButton('refunds', x),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'companions',
                label: tr('同行与分摊'),
                children: (
                  <>
                    <Space className="mb16" wrap>
                      {rowButton('companions')}
                      <Link to="/advances">
                        {tr('进入原代买代付服务创建 / 结算 / 处理商家退款')}
                      </Link>
                    </Space>
                    <Table
                      rowKey="id"
                      dataSource={r.companions}
                      scroll={{ x: 900 }}
                      columns={[
                        {
                          title: tr('姓名 / 持票人'),
                          render: (_, x) => (
                            <Sensitive>
                              {x.name} / {x.holder}
                            </Sensitive>
                          ),
                        },
                        {
                          title: tr('付款人 / 承担人'),
                          render: (_, x) => (
                            <Sensitive>
                              {x.payer} / {x.bearer}
                            </Sensitive>
                          ),
                        },
                        { title: tr('比例'), render: (_, x) => `${x.ratio}%` },
                        {
                          title: tr('分摊金额'),
                          render: (_, x) => money(x.amount),
                        },
                        {
                          title: tr('已结算'),
                          render: (_, x) =>
                            x.linked ? money(x.settled) : tr('仅计划'),
                        },
                        {
                          title: tr('待结算'),
                          render: (_, x) => (x.linked ? money(x.pending) : '—'),
                        },
                        {
                          title: tr('操作'),
                          render: (_, x) =>
                            editButton(
                              'companions',
                              c.companions.find((p) => p.id === x.id)!,
                            ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'attachments',
                label: tr('附件'),
                children: (
                  <>
                    <Space className="mb16" wrap>
                      <Select
                        style={{ width: 250 }}
                        value={orderAttachment}
                        onChange={setOrderAttachment}
                        options={[
                          { value: '', label: tr('场次附件') },
                          ...c.orders.map((o) => ({
                            value: o.id,
                            label: `${o.platform} / ${o.number || o.id.slice(0, 8)}`,
                          })),
                        ]}
                      />
                      <Upload
                        accept=".png,.jpg,.jpeg,.pdf"
                        showUploadList={false}
                        disabled={hidden || uploading}
                        beforeUpload={(file) => {
                          if (file.size > 10 * 1024 * 1024) {
                            message.error(tr('附件最大10MB'));
                            return false;
                          }
                          setUploading(true);
                          void concertApi
                            .upload(id, d.version, file, orderAttachment)
                            .then(refresh)
                            .catch((e) => message.error(e.message))
                            .finally(() => setUploading(false));
                          return false;
                        }}
                      >
                        <Button loading={uploading} disabled={hidden}>
                          {tr('上传附件')}
                        </Button>
                      </Upload>
                    </Space>
                    {attachments.isError && (
                      <ErrorState
                        error={attachments.error}
                        retry={() => attachments.refetch()}
                      />
                    )}
                    <Table
                      rowKey="id"
                      dataSource={attachments.data}
                      columns={[
                        {
                          title: tr('文件名'),
                          render: (_, a) => <Sensitive>{a.name}</Sensitive>,
                        },
                        {
                          title: tr('所属'),
                          render: (_, a) =>
                            a.orderId ? tr('门票订单') : tr('场次档案'),
                        },
                        {
                          title: tr('操作'),
                          render: (_, a) => (
                            <Button
                              disabled={hidden}
                              onClick={() =>
                                void concertApi
                                  .download(id, a.id)
                                  .then((blob) => saveBlob(blob, a.name))
                                  .catch((e) => message.error(e.message))
                              }
                            >
                              {tr('下载')}
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'history',
                label: tr('状态与审计'),
                children: (
                  <>
                    {history.isError && (
                      <ErrorState
                        error={history.error}
                        retry={() => history.refetch()}
                      />
                    )}
                    <Table
                      rowKey="id"
                      dataSource={history.data}
                      expandable={{expandedRowRender:h=><Sensitive><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{h.changes}</pre></Sensitive>}}
                      columns={[
                        { title: tr('时间'), dataIndex: 'createdAt' },
                        {
                          title: tr('操作'),
                          render: (_, h) =>
                            tr(
                              h.action === 'Create'
                                ? '新建档案'
                                : h.action === 'Attachment'
                                  ? '附件更新'
                                  : '修改档案',
                            ),
                        },
                        {
                          title: tr('状态变化'),
                          render: (_, h) => (
                            <pre
                              style={{ whiteSpace: 'pre-wrap', maxWidth: 650 }}
                            >
                              {auditSummary(h.changes)}
                            </pre>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
            ]}
          />
        </>
      )}
      {editor && (
        <DataEditor
          title={tr(
            {
              orders: '门票订单',
              costs: '费用分配',
              plans: '计划费用',
              refunds: '退款进度',
              companions: '同行与费用分摊',
            }[editor.kind],
          )}
          fields={fields[editor.kind]}
          value={editor.row}
          onClose={() => setEditor(undefined)}
          onSave={async (row) => {
            const values = editor.base.input[editor.kind] as Row[];
            const next = values.some((x) => x.id === row.id)
              ? values.map((x) => (x.id === row.id ? row : x))
              : [...values, row];
            await concertApi.save(
              { ...editor.base.input, [editor.kind]: next } as Concert,
              editor.base,
            );
            await refresh();
            setEditor(undefined);
            message.success(tr('已保存'));
          }}
        />
      )}
      {editScene && d && (
        <SceneEditor
          scene={d}
          scenes={scenes}
          onClose={() => setEditScene(false)}
          onSaved={refresh}
        />
      )}
      <TransactionDrawer
        id={transaction}
        onClose={() => setTransaction(undefined)}
      />
    </Drawer>
  );
}
