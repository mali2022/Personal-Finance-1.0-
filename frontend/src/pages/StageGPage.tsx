import { currencyOptions } from '../constants/currencies';
import { useCurrencyState } from '../hooks/useCurrency';
import { TemplateImport } from '../components/TemplateImport';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { localizedPair } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Drawer, Form, Input, Pagination, Space, Switch, Table, Tabs } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { investmentApi } from '../api/investments';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import AdvanceGroupEditor from './AdvanceGroupEditor';
import Chart from '../components/Chart';
import { useUI } from '../stores/ui';
import type { ApiResponse, Currency } from '../types';

type Row = {
  id: string;
  version: string;
  currency?: Currency;
  [key: string]: unknown;
};
type Field = {
  name: string;
  label: string;
  kind?: 'account' | 'category' | 'date' | 'boolean' | 'select' | 'month';
  options?: [string, string][];
  optional?: boolean;
  initial?: unknown;
};
type Config = {
  title: string;
  path: string;
  rule: string;
  fields: Field[];
  array?: { name: string; label: string; fields: Field[] };
  columns: string[];
};
const currencies: [string,string][] = currencyOptions().map(o=>[o.value,o.label]);
const currency: Field = {
  name: 'currency',
  get label(){return tr("币种");},
  kind: 'select',
  options: currencies,
  initial: 'CNY',
};
const amount: Field = {
  name: 'amount',
  get label(){return tr('金额（原币）');},
  initial: '0.00',
};
const account: Field = {
  name: 'accountId',
  get label(){return tr('实际资金账户');},
  kind: 'account',
};
const category: Field = {
  name: 'categoryId',
  get label(){return tr("支出分类");},
  kind: 'category',
  optional: true,
};
const note: Field = {
  name: 'note',
  get label(){return tr("备注");},
  optional: true,
  initial: '',
};
const date = (name: string, label: string): Field => ({
  name,
  label,
  kind: 'date',
  initial: dayjs().format('YYYY-MM-DD'),
});
const month: Field = {
  name: 'month',
  get label(){return tr("所属月份");},
  kind: 'month',
  initial: dayjs().format('YYYY-MM'),
};
const componentFields: Field[] = [
  { name: 'name', get label(){return tr("项目名称");} },
  {
    name: 'kind',
    get label(){return tr("构成");},
    kind: 'select',
    options: [
      localizedPair('Earning','应发'),
      localizedPair('Deduction','扣款'),
      localizedPair('Adjustment','净额调整'),
    ],
    initial: 'Earning',
  },
  amount,
];
const basketFields: Field[] = [
  { name: 'product', get label(){return tr("商品名称");} },
  {
    name: 'brand',
    get label(){return tr("品牌（不填仅与未注明品牌样本比较）");},
    optional: true,
    initial: '',
  },
  { name: 'specification', get label(){return tr("可比规格/品牌");} },
  {
    name: 'unit',
    get label(){return tr("单位（g/100g/kg/ml/L/件/次，或自定义同规格单位）");},
    initial: '件',
  },
  { name: 'quantity', get label(){return tr("固定基准数量");}, initial: '1' },
];
const configs: Record<string, Config> = {
  externalFacts: {
    get title(){return tr("账本外第三方付款事实");},
    path: '/external-payment-facts',
    rule: '实际资金由账本外人员支付。这里只记录赠与、承诺待还或参考事实，不虚构本人现金收入、扣款或负债；待还事实需要另行核对真实责任。',
    columns: ['name', 'payer', 'consumer', 'amount', 'nature'],
    fields: [
      { name: 'name', get label(){return tr("付款事项");} },
      { name: 'payer', get label(){return tr("实际出资人");} },
      { name: 'consumer', get label(){return tr("消费人");} },
      currency,
      amount,
      date('occurredAt', '实际付款日期'),
      {
        name: 'nature',
        get label(){return tr("经济性质");},
        kind: 'select',
        options: [
          localizedPair('Gift','赠与事实'),
          localizedPair('PromisedRepayment','承诺待还（仅事实，需核对）'),
          localizedPair('ReferenceOnly','仅供参考'),
        ],
        initial: 'ReferenceOnly',
      },
      note,
    ],
  },
  holds: {
    get title(){return tr("冻结与在途资金");},
    path: '/fund-holds',
    rule: '创建、确认与释放不改变账面资金；结算才创建真实交易。可用余额仅扣减已确认且明确仍包含于账面余额的受限资金，储蓄预留独立。',
    columns: ['type', 'state', 'amount', 'remaining'],
    fields: [
      account,
      {
        name: 'type',
        get label(){return tr("资金状态");},
        kind: 'select',
        options: [
          localizedPair('AuthorizationHold','授权冻结'),
          localizedPair('AccountRestriction','账户限制'),
          localizedPair('PendingDebit','待扣款'),
          localizedPair('PendingCredit','待到账'),
          localizedPair('SettlementPending','结算在途'),
        ],
        initial: 'AuthorizationHold',
      },
      amount,
      {
        name: 'includedInBookBalance',
        get label(){return tr("已包含于账面余额");},
        kind: 'boolean',
        initial: true,
      },
      {
        name: 'reducesAvailable',
        get label(){return tr("减少可用余额（待到账应关闭）");},
        kind: 'boolean',
        initial: true,
      },
      note,
    ],
  },
  prepayments: {
    get title(){return tr("预付款与押金");},
    path: '/prepayments',
    rule: '先在原账本登记支付，再关联档案。专用资产账户模式：关联同币种本金转账，资产只计账户余额。历史支出模式：仅跟踪，不自动改写历史或增加资产。',
    columns: ['name', 'accountingMode', 'amount', 'remaining', 'state'],
    fields: [
      { name: 'name', get label(){return tr("商户/合同名称");} },
      {
        name: 'counterparty',
        get label(){return tr("商户或收款方");},
        optional: true,
        initial: '',
      },
      {
        name: 'contractReference',
        get label(){return tr("合同/订单编号");},
        optional: true,
        initial: '',
      },
      {
        name: 'type',
        get label(){return tr("合同性质");},
        kind: 'select',
        options: [
          localizedPair('RefundableDeposit','可退押金'),
          localizedPair('ServiceAdvance','预付服务'),
          localizedPair('GoodsAdvance','预付货款'),
          localizedPair('StoredPrincipal','储值本金'),
          localizedPair('Guarantee','保证金'),
          localizedPair('Unconfirmed','待确认'),
        ],
        initial: 'Unconfirmed',
      },
      { name: 'fundingTransactionId', get label(){return tr("已确认付款交易编号");} },
      {
        name: 'accountingMode',
        get label(){return tr("既有支付口径");},
        kind: 'select',
        options: [
          localizedPair('TrackingOnly','历史支出，仅跟踪'),
          localizedPair('AssetAccount','专用资产账户本金转账'),
        ],
        initial: 'TrackingOnly',
      },
      { ...date('expiresOn', '到期日期'), optional: true, initial: undefined },
      note,
    ],
  },
  payroll: {
    get title(){return tr("工资管理");},
    path: '/payroll',
    rule: '工资条不再次入账。应发、扣款和实发按明细精确计算；银行到账仅关联已有收入，差额保留核对。',
    columns: [
      'month',
      'employer',
      'gross',
      'deduction',
      'net',
      'actual',
      'difference',
    ],
    fields: [
      month,
      date('payDate', '发薪日期'),
      { name: 'employer', get label(){return tr("雇主");} },
      currency,
      {
        name: 'state',
        get label(){return tr("状态");},
        kind: 'select',
        options: [
          localizedPair('Draft','草稿'),
          localizedPair('Confirmed','已确认'),
          localizedPair('Cancelled','已取消（须先解除到账与扣款关联）'),
        ],
        initial: 'Draft',
      },
      note,
    ],
    array: { name: 'components', get label(){return tr("工资构成");}, fields: componentFields },
  },
  contributions: {
    get title(){return tr("社保缴费");},
    path: '/social-contributions',
    rule: '按实际地区、月份和缴费项目记录，不预设政策比例；个人和单位缴费分别展示，不新增现金支出或单位收入。',
    columns: [
      'month',
      'region',
      'kind',
      'personalAmount',
      'employerAmount',
      'state',
    ],
    fields: [],
  },
  housing: {
    get title(){return tr("住房公积金");},
    path: '/housing-fund',
    rule: '缴存明细不改变资金。已登记的公积金资产只采用原账户；手动余额只是来源明确的核对记录，不叠加净资产。',
    columns: [
      'month',
      'region',
      'personalAmount',
      'employerAmount',
      'reportedBalance',
      'balanceSource',
    ],
    fields: [],
  },
  instruments: {
    get title(){return tr("付款授权工具");},
    path: '/payment-instruments',
    rule: '授权工具没有余额。本人账户付款只扣实际资金账户；消费人和授权人分别保存；授权不自动产生应收借款。',
    columns: [
      'name',
      'type',
      'authorizer',
      'consumer',
      'monthlyLimit',
      'state',
    ],
    fields: [
      { name: 'name', get label(){return tr("付款工具名称");} },
      {
        name: 'type',
        get label(){return tr("类型");},
        kind: 'select',
        options: [
          localizedPair('WeChatFamilyCard','微信亲情卡'),
          localizedPair('AlipayFamilyCard','支付宝亲情卡'),
          localizedPair('SupplementaryCard','银行卡附属卡'),
          localizedPair('ThirdPartyAuthorization','其他授权付款'),
          localizedPair('Other','其他'),
        ],
        initial: 'WeChatFamilyCard',
      },
      account,
      { name: 'authorizer', get label(){return tr("授权人");} },
      { name: 'consumer', get label(){return tr("消费人");} },
      date('startsOn', '有效起始日期'),
      { ...date('endsOn', '有效截止日期'), optional: true, initial: undefined },
      {
        name: 'monthlyLimit',
        get label(){return tr("月度限额（不填表示不限）");},
        optional: true,
      },
      {
        name: 'state',
        get label(){return tr("状态");},
        kind: 'select',
        options: [
          localizedPair('Active','有效'),
          localizedPair('Paused','暂停'),
          localizedPair('Revoked','撤销'),
        ],
        initial: 'Active',
      },
      note,
    ],
  },
  advances: {
    get title(){return tr("代买代付与实物往来");},
    path: '/advances',
    rule: '实际付款拆为本人费用与专项应收，合计不重复过账。多人使用家庭分摊；信用卡付款增加负债，收回本金不算普通收入，交付不再次扣款。',
    columns: [
      'name',
      'counterparty',
      'amount',
      'ownAmount',
      'receivable',
      'settled',
      'remaining',
      'deliveryState',
    ],
    fields: [
      { name: 'name', get label(){return tr("商品/服务名称");} },
      { name: 'counterparty', get label(){return tr("应返还人");} },
      { name: 'payer', get label(){return tr("实际付款人");}, optional: true, initial: '' },
      { name: 'platform', get label(){return tr("购买平台");}, optional: true, initial: '' },
      { name: 'merchant', get label(){return tr("商户");}, optional: true, initial: '' },
      {
        name: 'consumer',
        get label(){return tr("使用人（不填沿用授权消费人）");},
        optional: true,
        initial: '',
      },
      { name: 'beneficiary', get label(){return tr("受益人");}, optional: true, initial: '' },
      account,
      { ...amount, get label(){return tr("实际付款总额");} },
      { name: 'ownAmount', get label(){return tr("本人承担金额（含赠与）");}, initial: '0.00' },
      date('occurredAt', '实际支付日期'),
      category,
      { name: 'quantity', get label(){return tr("商品数量");}, initial: '1' },
      { name: 'unit', get label(){return tr("单位");}, initial: '件' },
      { name: 'recipient', get label(){return tr("实物接收人");}, optional: true, initial: '' },
      {
        name: 'instrumentId',
        get label(){return tr("付款授权工具（可选）");},
        kind: 'select',
        options: [],
        optional: true,
      },
      note,
    ],
  },
  advancePlans: {
    get title(){return tr("待购与取消计划");},
    path: '/advances/plans',
    rule: '只记录预计采购；待购买或取消都不生成现金、负债或应收。确认实际采购时复用现有代付账本。',
    columns: [
      'name',
      'counterparty',
      'plannedAmount',
      'plannedOwnAmount',
      'state',
    ],
    fields: [
      { name: 'name', get label(){return tr("商品或事项");} },
      { name: 'counterparty', get label(){return tr("应返还人");} },
      account,
      { name: 'plannedAmount', get label(){return tr("预计总额（不入账）");} },
      { name: 'plannedOwnAmount', get label(){return tr("预计本人承担额");}, initial: '0.00' },
      { name: 'quantity', get label(){return tr("数量");}, initial: '1' },
      { name: 'unit', get label(){return tr("单位");}, initial: '件' },
      note,
    ],
  },
  prices: {
    get title(){return tr("商品价格样本");},
    path: '/product-prices',
    rule: '研究样本不产生支出。记录数量与总价，服务端换算标准单位；商品规格和价格口径不同的样本分别分析。',
    columns: [
      'product',
      'productCategory',
      'specification',
      'date',
      'quantity',
      'unit',
      'currency',
      'amount',
      'unitPrice',
      'priceKind',
      'brand',
      'listedAmount',
      'discountAmount',
    ],
    fields: [
      ...basketFields.map((x) =>
        x.name === 'quantity' ? { ...x, label: tr("样本商品数量") } : x,
      ),
      currency,
      date('date', '样本日期'),
      amount,
      {
        name: 'priceKind',
        get label(){return tr("价格口径");},
        kind: 'select',
        options: [
          localizedPair('Paid','实际到手价'),
          localizedPair('Listed','标价'),
        ],
        initial: 'Paid',
      },
      { name: 'source', get label(){return tr("样本来源");} },
      {
        name: 'productCategory',
        get label(){return tr("商品类别");},
        optional: true,
        initial: '',
      },
      { name: 'merchant', get label(){return tr("样本商户");}, optional: true, initial: '' },
      {
        name: 'listedAmount',
        get label(){return tr("同数量原始标价（可选，不替代到手价指数）");},
        optional: true,
      },
      {
        name: 'discontinued',
        get label(){return tr("此日期起停售（停止使用旧价格补值）");},
        kind: 'boolean',
        initial: false,
      },
      {
        name: 'sourceTransactionId',
        get label(){return tr("原消费交易编号（可选，沿用原优惠详情）");},
        optional: true,
      },
      {
        name: 'excluded',
        get label(){return tr("排除异常样本");},
        kind: 'boolean',
        initial: false,
      },
    ],
  },
  baskets: {
    get title(){return tr("固定生活成本篮子");},
    path: '/living-cost/baskets',
    rule: '固定数量不会随实际采购量变化。指数采用相同商品、规格和标准单位；缺少样本时展示覆盖率，不用零填充。',
    columns: ['name', 'baseDate', 'priceKind'],
    fields: [
      { name: 'name', get label(){return tr("篮子名称");} },
      currency,
      date('baseDate', '基准日期'),
      {
        name: 'priceKind',
        get label(){return tr("价格口径");},
        kind: 'select',
        options: [
          localizedPair('Paid','实际到手价'),
          localizedPair('Listed','标价'),
        ],
        initial: 'Paid',
      },
    ],
    array: { name: 'items', get label(){return tr("固定篮子条目");}, fields: basketFields },
  },
};
const contributionFields: Field[] = [
  month,
  date('paidDate', '实际缴纳日期'),
  { name: 'region', get label(){return tr("参保地区");} },
  currency,
  { name: 'basis', get label(){return tr("缴费基数");}, initial: '0.00' },
  { name: 'personalAmount', get label(){return tr("个人缴费");}, initial: '0.00' },
  { name: 'employerAmount', get label(){return tr("单位缴费");}, initial: '0.00' },
  {
    name: 'state',
    get label(){return tr("状态");},
    kind: 'select',
    options: [
      localizedPair('Pending','待缴纳'),
      localizedPair('Confirmed','已缴纳'),
      localizedPair('Cancelled','已取消'),
    ],
    initial: 'Confirmed',
  },
  { name: 'supplementary', get label(){return tr("补缴");}, kind: 'boolean', initial: false },
  { name: 'payrollId', get label(){return tr("关联工资条");}, optional: true },
  {
    name: 'payrollComponentId',
    get label(){return tr("关联个人扣款项目（可选）");},
    optional: true,
  },
  note,
];
configs.contributions.fields = [
  ...contributionFields,
  {
    name: 'kind',
    get label(){return tr("缴费项目");},
    kind: 'select',
    options: [
      localizedPair('Pension','养老'),
      localizedPair('Medical','医疗'),
      localizedPair('Unemployment','失业'),
      localizedPair('WorkInjury','工伤'),
      localizedPair('Maternity','生育'),
      localizedPair('Other','其他'),
    ],
    initial: 'Pension',
  },
];
configs.housing.fields = [
  ...contributionFields,
  {
    name: 'loanBusinessId',
    get label(){return tr("关联已有公积金贷款（可选）");},
    optional: true,
  },
  {
    name: 'kind',
    get label(){return tr("项目");},
    kind: 'select',
    options: [localizedPair('HousingFund','住房公积金')],
    initial: 'HousingFund',
  },
  { ...account, get label(){return tr("已有公积金资产账户（可不关联）");}, optional: true },
  {
    name: 'reportedBalance',
    get label(){return tr("可靠来源的账户余额（可不填）");},
    optional: true,
  },
  {
    name: 'balanceSource',
    get label(){return tr("余额来源");},
    kind: 'select',
    options: [
      localizedPair('NoBalance','无可靠余额'),
      localizedPair('ManualStatement','手动对账单'),
      localizedPair('ProviderStatement','机构对账单'),
    ],
    initial: 'NoBalance',
  },
];
const labels: Record<string, string> = localizedLabels({
  brand: '品牌',
  listedAmount: '同数量标价',
  discountAmount: '明确标价与到手价差额',
  contractReference: '合同/订单编号',
  cancellationReason: '取消原因',
  payer: '实际付款人',
  platform: '购买平台',
  merchant: '商户',
  beneficiary: '受益人',
  sourceTransactionId: '原消费与优惠详情',
  nature: '经济性质',
  settlements: '实际收回/退货退款',
  fundingTransactions: '实际付款分录与原交易',
  history: '状态与角色变更历史',
  name: '名称',
  type: '类型',
  state: '状态',
  amount: '金额',
  remaining: '剩余',
  accountingMode: '核算口径',
  month: '所属月',
  employer: '雇主',
  gross: '应发',
  deduction: '扣款',
  net: '实发',
  actual: '到账',
  difference: '差额',
  region: '地区',
  kind: '项目',
  personalAmount: '个人缴费',
  employerAmount: '单位缴费',
  reportedBalance: '核对余额',
  balanceSource: '来源',
  authorizer: '授权人',
  consumer: '消费人',
  monthlyLimit: '月度限额',
  counterparty: '应返还人',
  ownAmount: '本人承担',
  receivable: '约定应收',
  settled: '已收回',
  deliveryState: '交付',
  product: '商品',
  specification: '规格',
  date: '日期',
  quantity: '数量',
  unitPrice: '单位价格',
  priceKind: '价格口径',
  baseDate: '基准日',
  cashImpact: '真实现金影响',
  plannedAmount: '预计总额（不入账）',
  plannedOwnAmount: '预计本人承担额',
  accountImpact: '付款账户账面变化',
  liabilityImpact: '信用卡负债变化',
  expenseImpact: '费用影响',
  ordinaryIncome: '普通收入影响',
  coverage: '覆盖率%',
  index: '指数',
  baseCost: '基准成本',
  currentCost: '当前成本',
  change: '成本差额',
});
const moneyKeys = new Set([
  'listedAmount',
  'discountAmount',
  'amount',
  'remaining',
  'gross',
  'deduction',
  'net',
  'actual',
  'difference',
  'personalAmount',
  'employerAmount',
  'reportedBalance',
  'monthlyLimit',
  'ownAmount',
  'receivable',
  'settled',
  'cashImpact',
  'plannedAmount',
  'plannedOwnAmount',
  'accountImpact',
  'liabilityImpact',
  'expenseImpact',
  'ordinaryIncome',
  'expense',
  'income',
]);
const enumLabels: Record<string, string> = localizedLabels({
  PromisedRepayment: '承诺待还（需核对）',
  ReferenceOnly: '仅供参考',
  Planned: '待购买',
  Draft: '草稿',
  Confirmed: '已确认',
  Active: '有效',
  Released: '已释放',
  Settled: '已结算',
  Revoked: '已撤销',
  Expired: '已失效',
  Closed: '已结清',
  TrackingOnly: '历史费用跟踪',
  AssetAccount: '专用资产账户',
  Purchased: '已购买',
  PendingDelivery: '待交付',
  Delivered: '已交付',
  Returned: '已退回',
  Paid: '到手价',
  Listed: '标价',
  Pending: '待缴纳',
  Cancelled: '已取消',
  Paused: '已暂停',
  NoBalance: '无可靠余额',
  ManualStatement: '手动对账单',
  ProviderStatement: '机构对账单',
});
async function get(path: string, params?: Record<string, unknown>) {
  return (await apiClient.get<ApiResponse<unknown>>(path, { params })).data
    .data;
}
function rowsOf(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (
    data &&
    typeof data === 'object' &&
    'items' in data &&
    Array.isArray(data.items)
  )
    return data.items as Row[];
  return [];
}
function AssociationSelector({
  field,
  id,
  value,
  onChange,
}: {
  field: Field;
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  useLocale();
  const form = Form.useFormInstance();
  const payrollId = Form.useWatch('payrollId', form) as string | undefined;
  const hidden = useUI((s) => s.hidden);
  const component = field.name === 'payrollComponentId';
  const loan = field.name === 'loanBusinessId';
  const q = useQuery({
    queryKey: [
      'stage-g',
      'association-options',
      field.name,
      component ? payrollId : null,
    ],
    enabled: !component || !!payrollId,
    queryFn: () =>
      get(
        component ? `/payroll/${payrollId}` : loan ? '/business' : '/payroll',
        { pageSize: 100, ...(loan ? { kind: 'Borrowed' } : {}) },
      ),
  });
  const rows = component
    ? rowsOf(
        (q.data as { components?: unknown[] } | undefined)?.components,
      ).filter((row) => row.kind === 'Deduction')
    : rowsOf(q.data);
  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      allowClear
      showSearch
      optionFilterProp="label"
      loading={q.isLoading}
      disabled={component && !payrollId}
      placeholder={component && !payrollId ? tr("先选择工资条") : tr("选择已有记录")}
      options={rows.map((row) => ({
        value: row.id,
        label: hidden
          ? `•••• · ${row.id.slice(-8)}`
          : component
            ? `${row.name} · ${row.amount}`
            : loan
              ? `${row.counterparty} · ${row.currency}`
              : `${row.month} · ${row.employer} · ${row.currency}`,
      }))}
    />
  );
}
function FieldInput({
  field,
  id,
  value,
  checked,
  onChange,
}: {
  field: Field;
  id?: string;
  value?: unknown;
  checked?: boolean;
  onChange?: (value: unknown) => void;
}) {
  const text = typeof value === 'string' ? value : undefined;
  if (
    ['payrollId', 'payrollComponentId', 'loanBusinessId'].includes(field.name)
  )
    return (
      <AssociationSelector
        field={field}
        id={id}
        value={text}
        onChange={(v) => onChange?.(v)}
      />
    );
  if (field.kind === 'account')
    return (
      <AccountSelector id={id} value={text} onChange={(v) => onChange?.(v)} />
    );
  if (field.kind === 'category')
    return (
      <CategorySelector
        id={id}
        value={text}
        onChange={(v) => onChange?.(v)}
        kind="Expense"
      />
    );
  if (field.kind === 'boolean')
    return <Switch id={id} checked={checked} onChange={(v) => onChange?.(v)} />;
  if (field.kind === 'select')
    return (
      <Select
        id={id}
        value={text}
        onChange={(v) => onChange?.(v)}
        options={field.options?.map(([value, label]) => ({ value, label: tr(label) }))}
      />
    );
  return (
    <Input
      id={id}
      value={text}
      onChange={(e) => onChange?.(e.target.value)}
      type={
        field.kind === 'date'
          ? 'date'
          : field.kind === 'month'
            ? 'month'
            : 'text'
      }
    />
  );
}
function FieldItem({ field, prefix }: { field: Field; prefix?: number }) {
  return (
    <Form.Item
      name={prefix == null ? field.name : [prefix, field.name]}
      label={tr(field.label)}
      initialValue={field.initial}
      valuePropName={field.kind === 'boolean' ? 'checked' : 'value'}
      rules={
        field.optional
          ? []
          : [{ required: true, message: tr('请填写{0}',tr(field.label)) }]
      }
    >
      <FieldInput field={field} />
    </Form.Item>
  );
}

export default function StageGPage({ module }: { module: string }) {
  useLocale();
  const config = configs[module];
  const [searchParams] = useSearchParams();
  const accountId = module === 'holds' ? searchParams.get('accountId') : null;
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{
    row?: Row;
    action?: string;
    fields: Field[];
  }>();
  const [detail, setDetail] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    body: Record<string, unknown>;
    result: Record<string, unknown>;
    path: string;
    version?: string;
  }>();
  const [form] = Form.useForm();
  const instruments = useQuery({
    queryKey: ['stage-g', 'advance-instruments'],
    enabled: module === 'advances',
    queryFn: () => get('/payment-instruments'),
  });
  const q = useQuery({
    queryKey: ['stage-g', module, page, accountId],
    queryFn: () =>
      get(config.path, {
        page,
        pageSize: 20,
        ...(accountId ? { accountId } : {}),
      }),
  });
  const rows = rowsOf(q.data);
  const total =
    q.data && typeof q.data === 'object' && 'total' in q.data
      ? Number(q.data.total)
      : rows.length;
  function show(row?: Row, action?: string, fields = config.fields) {
    form.resetFields();
    setPreview(undefined);
    setEditor({
      row,
      action,
      fields: fields.map((field) =>
        field.name === 'instrumentId'
          ? {
              ...field,
              options: rowsOf(instruments.data)
                .filter((item) => item.state === 'Active')
                .map(
                  (item) => [item.id, String(item.name)] as [string, string],
                ),
            }
          : field,
      ),
    });
    if (row && !action) form.setFieldsValue(row);
  }
  async function inspect(row: Row) {
    try {
      const data = await get(
        module === 'holds'
          ? `/fund-holds/${row.id}/history`
          : `${config.path}/${row.id}`,
      );
      setDetail(data);
    } catch (e) {
      message.error((e as { message: string }).message);
    }
  }
  function value(key: string, v: unknown, c?: Currency) {
    if (v == null) return '—';
    if (hidden) return '••••';
    if (moneyKeys.has(key) && typeof v === 'string')
      return <Money value={v} currency={c} />;
    return enumLabels[String(v)] ?? String(v);
  }
  async function correct(row: Row) {
    try {
      const data = await get(
        module === 'holds'
          ? `/fund-holds/${row.id}/history`
          : `/prepayments/${row.id}`,
      );
      const events = (
        Array.isArray(data)
          ? data
          : (data as { history: Record<string, unknown>[] }).history
      ) as Record<string, unknown>[];
      const reversed = new Set(events.map((event) => event.reversalOfId));
      const eligible = events.filter(
        (event) =>
          !event.reversalOfId &&
          !reversed.has(event.id) &&
          (module === 'holds'
            ? event.action === 'Settle'
            : ['Consume', 'Refund', 'WriteOff'].includes(String(event.action))),
      );
      if (!eligible.length) {
        message.info(tr("没有可更正的结算事件"));
        return;
      }
      show(row, 'correct', [
        {
          name: 'eventId',
          label: tr("原结算事件"),
          kind: 'select',
          options: eligible.map((event) => [
            String(event.id),
            `${enumLabels[String(event.action)] || event.action} · ${event.amount} · ${dayjs(String(event.createdAt)).format('YYYY-MM-DD HH:mm')}`,
          ]),
        },
        reason,
      ]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : tr("历史加载失败"));
    }
  }
  async function submit(confirm = false) {
    setBusy(true);
    try {
      if (confirm && preview) {
        await investmentApi.save(preview.path, preview.body, preview.version);
      } else {
        const raw = await form.validateFields();
        const body: Record<string, unknown> = { ...raw };
        for (const key of Object.keys(body))
          if (
            body[key] === '' &&
            ![
              'note',
              'recipient',
              'counterparty',
              'contractReference',
              'payer',
              'platform',
              'merchant',
              'consumer',
              'beneficiary',
              'brand',
              'productCategory',
            ].includes(key)
          )
            body[key] = null;
        if (['advances', 'externalFacts'].includes(module) && !editor?.action)
          body.occurredAt = `${raw.occurredAt}T12:00:00+08:00`;
        if (module === 'advances' && !editor?.action && raw.instrumentId)
          body.instrumentVersion = rowsOf(instruments.data).find(
            (item) => item.id === raw.instrumentId,
          )?.version;
        let path = config.path;
        let method: 'post' | 'put' = 'post';
        let previewPath: string | undefined;
        const row = editor?.row;
        const action = editor?.action;
        if (row && !action) {
          path += `/${row.id}`;
          method = 'put';
        }
        if (action === 'reconcile') path += `/${row!.id}/reconcile`;
        if (action === 'unlink') path += `/${row!.id}/unlink`;
        if (action === 'correct') {
          path += `/${row!.id}/correct`;
          previewPath = `${config.path}/${row!.id}/correction-preview`;
        }
        if (action === 'delivery') path += `/${row!.id}/delivery`;
        if (action === 'cancel-plan') path += `/${row!.id}/cancel`;
        if (action === 'purchase-plan') {
          path += `/${row!.id}/purchase`;
          previewPath = `${config.path}/${row!.id}/purchase-preview`;
          body.occurredAt = `${raw.occurredAt}T12:00:00+08:00`;
        }
        if (action === 'settle-advance') {
          path += `/${row!.id}/settle`;
          body.occurredAt = `${raw.occurredAt}T12:00:00+08:00`;
          previewPath = `${config.path}/${row!.id}/settlement-preview`;
        }
        if (action === 'resolve-advance') {
          path += `/${row!.id}/resolve`;
          previewPath = `${config.path}/${row!.id}/resolution-preview`;
          if (raw.action === 'MerchantRefund')
            body.settlement = {
              accountId: raw.accountId,
              amount: raw.amount,
              occurredAt: `${raw.occurredAt}T23:59:00+08:00`,
              note: raw.reason,
            };
          delete body.accountId;
          delete body.occurredAt;
        }
        if (action === 'authorized-payment') {
          path = '/authorized-payments';
          body.instrumentId = row!.id;
          body.instrumentVersion = row!.version;
          body.transaction = {
            type: 'Expense',
            accountId: row!.accountId,
            amount: raw.amount,
            categoryId: raw.categoryId,
            occurredAt: `${raw.occurredAt}T12:00:00+08:00`,
            note: raw.note ?? '',
          };
          for (const k of ['amount', 'categoryId', 'occurredAt', 'note'])
            delete body[k];
          previewPath = '/authorized-payments/preview';
        }
        if (action === 'hold' || action === 'prepayment') {
          path += `/${row!.id}/${action === 'hold' ? 'actions' : 'settle'}`;
          previewPath = `${config.path}/${row!.id}/${action === 'hold' ? 'preview' : 'settlement-preview'}`;
          if (
            raw.action === 'Settle' ||
            (action === 'prepayment' &&
              (row!.accountingMode === 'AssetAccount' ||
                raw.action === 'Refund'))
          ) {
            body.transaction = {
              type: raw.transactionType,
              accountId:
                action === 'hold'
                  ? row!.accountId
                  : row!.accountingMode === 'AssetAccount'
                    ? row!.assetAccountId
                    : raw.accountId,
              amount: raw.amount,
              categoryId: raw.categoryId,
              toAccountId: raw.toAccountId || undefined,
              originalTransactionId:
                row!.accountingMode === 'TrackingOnly'
                  ? row!.fundingTransactionId
                  : undefined,
              occurredAt: `${raw.occurredAt}T23:59:00+08:00`,
              note: raw.reason,
            };
          }
          for (const key of [
            'transactionType',
            'categoryId',
            'accountId',
            'toAccountId',
            'occurredAt',
          ])
            delete body[key];
        }
        if (module === 'advances' && !action) previewPath = '/advances/preview';
        if (previewPath) {
          const result = await investmentApi.preview(
            previewPath,
            body,
            row?.version,
          );
          setPreview({
            body,
            path,
            version: row?.version,
            result: result as Record<string, unknown>,
          });
          return;
        }
        // Non-cash metadata has an explicit financial explanation in the editor.
        await investmentApi.save(path, body, row?.version, method);
      }
      setEditor(undefined);
      setPreview(undefined);
      await cache.invalidateQueries();
      message.success(tr("已保存"));
    } catch (e) {
      message.error(
        (e as { message?: string }).message ||
          tr("请检查表单并重试；发生版本冲突时请刷新。"),
      );
    } finally {
      setBusy(false);
    }
  }
  const paymentFields = [
    amount,
    { ...category, optional: false },
    date('occurredAt', '实际交易日期'),
    note,
  ];
  const reason: Field = { name: 'reason', label: tr("原因") };
  const holdFields: Field[] = [
    {
      name: 'action',
      label: tr("动作"),
      kind: 'select',
      options: [
        localizedPair('Confirm','确认（金额填0）'),
        localizedPair('Release','部分/全部释放'),
        localizedPair('Settle','实际结算'),
        localizedPair('Expire','失效（金额填0）'),
        localizedPair('Revoke','撤销（金额填0）'),
      ],
      initial: 'Confirm',
    },
    amount,
    reason,
    {
      name: 'transactionType',
      label: tr("结算资金交易类型"),
      kind: 'select',
      options: [
        localizedPair('Expense','实际消费'),
        localizedPair('Transfer','实际转出'),
        localizedPair('Income','实际到账收入'),
        localizedPair('Refund','实际到账退款'),
      ],
      optional: true,
    },
    category,
    {
      name: 'toAccountId',
      label: tr("转入账户（转账必填）"),
      kind: 'account',
      optional: true,
    },
    date('occurredAt', '结算日期'),
  ];
  const prepaymentFields: Field[] = [
    {
      name: 'action',
      label: tr("动作"),
      kind: 'select',
      options: [
        localizedPair('Consume','消费使用'),
        localizedPair('Refund','实际退回'),
        localizedPair('WriteOff','核销/失效'),
      ],
      initial: 'Consume',
    },
    amount,
    reason,
    {
      name: 'transactionType',
      label: tr("真实结算类型（历史使用/失效不填）"),
      kind: 'select',
      options: [
        localizedPair('Expense','预付资产消费'),
        localizedPair('Transfer','预付资产退回'),
        localizedPair('Refund','历史支出退款'),
        localizedPair('AssetLoss','预付资产核销'),
      ],
      optional: true,
    },
    category,
    { ...account, label: tr("历史退款收款账户"), optional: true },
    {
      name: 'toAccountId',
      label: tr("资产退回收款账户"),
      kind: 'account',
      optional: true,
    },
    date('occurredAt', '结算日期'),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr(config.title)}</PageTitle>
        </div>
        {module === 'advances' && (
          <AdvanceGroupEditor
            onSaved={() => {
              void cache.invalidateQueries({ queryKey: ['stage-g'] });
            }}
          />
        )}
        {module === 'prices' && <TemplateImport kind="prices" />}
        <Button type="primary" onClick={() => show()}>
          {tr("新增记录")}</Button>
        {module === 'prices' && <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const response = await apiClient.post<ApiResponse<{ imported: number; skipped: number }>>('/product-prices/defaults', {}, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
            await cache.invalidateQueries({ queryKey: ['stage-g', 'prices'] });
            message.success(`已加入 ${response.data.data.imported} 项默认参考价，保留 ${response.data.data.skipped} 项已有默认记录。`);
          } catch (error) { message.error((error as { message: string }).message); }
          finally { setBusy(false); }
        }}>补充默认价格表</Button>}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card>
          <Table<Row>
            rowKey="id"
            loading={q.isPending}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 850 }}
            columns={[
              ...config.columns.map((key) => ({
                title: module === 'prices' && key === 'amount' ? '样本总价（元）' : module === 'prices' && key === 'unitPrice' ? '单价（元/单位）' : labels[key] || key,
                key,
                render: (_: unknown, row: Row) =>
                  value(key, row[key], row.currency),
              })),
              {
                title: tr("操作"),
                key: 'actions',
                render: (_: unknown, row: Row) => (
                  <Space wrap>
                    {[
                      'payroll',
                      'advancePlans',
                      'instruments',
                      'contributions',
                      'housing',
                    ].includes(module) &&
                      (module !== 'advancePlans' ||
                        row.state === 'Planned') && (
                        <Button size="small" onClick={() => show(row)}>
                          {tr("修改")}</Button>
                      )}
                    {['holds', 'prepayments', 'advances', 'payroll'].includes(
                      module,
                    ) && (
                      <Button size="small" onClick={() => inspect(row)}>
                        {tr("详情/历史")}</Button>
                    )}
                    {['holds', 'prepayments'].includes(module) && (
                      <Button size="small" onClick={() => correct(row)}>
                        {tr("更正原结算")}</Button>
                    )}
                    {module === 'advancePlans' && row.state === 'Planned' && (
                      <>
                        <Button
                          size="small"
                          onClick={() =>
                            show(row, 'purchase-plan', [
                              { ...amount, label: tr("实际付款总额") },
                              {
                                name: 'ownAmount',
                                label: tr("实际本人承担额"),
                                initial: '0.00',
                              },
                              category,
                              date('occurredAt', '实际付款日期'),
                            ])
                          }
                        >
                          {tr("确认实际采购")}</Button>
                        <Button
                          size="small"
                          onClick={() => show(row, 'cancel-plan', [reason])}
                        >
                          {tr("取消待购")}</Button>
                      </>
                    )}
                    {module === 'advancePlans' &&
                      typeof row.advanceId === 'string' && (
                        <Button
                          size="small"
                          onClick={async () => {
                            try {
                              setDetail(
                                await get(`/advances/${row.advanceId}`),
                              );
                            } catch (error) {
                              message.error(
                                error instanceof Error
                                  ? error.message
                                  : tr("读取失败"),
                              );
                            }
                          }}
                        >
                          {tr("采购与交付详情")}</Button>
                      )}
                    {module === 'holds' &&
                      ['Draft', 'Confirmed'].includes(String(row.state)) && (
                        <Button
                          size="small"
                          onClick={() => show(row, 'hold', holdFields)}
                        >
                          {tr("状态操作")}</Button>
                      )}
                    {module === 'prepayments' && row.state === 'Active' && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'prepayment', prepaymentFields)
                        }
                      >
                        {tr("结算")}</Button>
                    )}
                    {module === 'payroll' && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'reconcile', [
                            {
                              name: 'transactionId',
                              label: tr("已确认工资收入交易编号"),
                            },
                          ])
                        }
                      >
                        {tr("关联到账")}</Button>
                    )}
                    {module === 'payroll' && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'unlink', [
                            {
                              name: 'transactionId',
                              label: tr("需解除关联的到账交易编号"),
                            },
                          ])
                        }
                      >
                        {tr("解除到账关联")}</Button>
                    )}
                    {module === 'advances' && row.businessId != null && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'settle-advance', [
                            account,
                            amount,
                            date('occurredAt', '实际收回日期'),
                            note,
                          ])
                        }
                      >
                        {tr("收回本金")}</Button>
                    )}
                    {module === 'advances' && row.businessId != null && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'resolve-advance', [
                            {
                              name: 'action',
                              label: tr("应收处理"),
                              kind: 'select',
                              options: [
                                localizedPair('Gift','部分/全部转为赠与'),
                                localizedPair('WriteOff','无法收回核销'),
                                localizedPair('MerchantRefund','商家退货实际到账冲减应收'),
                              ],
                              initial: 'Gift',
                            },
                            amount,
                            reason,
                            category,
                            {
                              ...account,
                              label: tr("商家退款实际收款账户"),
                              optional: true,
                            },
                            date('occurredAt', '实际退款日期'),
                          ])
                        }
                      >
                        {tr("减免/退货")}</Button>
                    )}
                    {module === 'advances' && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'delivery', [
                            {
                              name: 'state',
                              label: tr("交付状态"),
                              kind: 'select',
                              options: [
                                localizedPair('PendingDelivery','待交付'),
                                localizedPair('Delivered','已交付'),
                                localizedPair('Returned','已退回'),
                              ],
                            },
                            date('deliveredOn', '交付日期'),
                            { name: 'recipient', label: tr("接收人") },
                          ])
                        }
                      >
                        {tr("实物交付")}</Button>
                    )}
                    {module === 'instruments' && row.state === 'Active' && (
                      <Button
                        size="small"
                        onClick={() =>
                          show(row, 'authorized-payment', paymentFields)
                        }
                      >
                        {tr("授权付款")}</Button>
                    )}
                    {module === 'baskets' && (
                      <Link
                        to={`/analytics/living-cost/index?basketId=${row.id}`}
                      >
                        {tr("计算指数")}</Link>
                    )}
                  </Space>
                ),
              },
            ]}
          />
          <Pagination
            className="mt20"
            current={page}
            pageSize={20}
            total={total}
            showSizeChanger={false}
            onChange={setPage}
          />
        </Card>
      )}
      <Drawer
        title={
          editor?.action ? tr("业务操作") : editor?.row ? tr("修改记录") : tr("新增记录")
        }
        open={!!editor}
        onClose={() => setEditor(undefined)}
        width={540}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setPreview(undefined)}
        >
          <h3 className="form-section-title">{tr("基本信息与资金归属")}</h3>
          {editor?.fields.map((field) => (
            <FieldItem key={field.name} field={field} />
          ))}
          {!editor?.action && config.array && (
            <Form.List name={config.array.name}>
              {(fields, { add, remove }) => (
                <>
                  <h3>{config.array!.label}</h3>
                  {fields.map(({ key, name }) => (
                    <Card key={key} size="small" className="mb16">
                      {config.array!.fields.map((field) => (
                        <FieldItem
                          key={field.name}
                          field={field}
                          prefix={name}
                        />
                      ))}
                      <Button onClick={() => remove(name)}>{tr("移除此项")}</Button>
                    </Card>
                  ))}
                  <Button
                    onClick={() =>
                      add(
                        Object.fromEntries(
                          config.array!.fields.map((x) => [x.name, x.initial]),
                        ),
                      )
                    }
                  >
                    {tr("增加条目")}</Button>
                </>
              )}
            </Form.List>
          )}
        </Form>
        {preview && (
          <Card title={tr("资金影响预览")} className="mt20">
            <Descriptions
              column={1}
              items={Object.entries(preview.result)
                .filter(
                  ([k, v]) =>
                    !['id', 'accountId', 'preview', 'before'].includes(k) &&
                    (typeof v === 'string' || typeof v === 'boolean'),
                )
                .map(([k, v]) => ({
                  key: k,
                  label: labels[k] || k,
                  children: value(k, v, editor?.row?.currency),
                }))}
            />
          </Card>
        )}
        <Space className="mt20">
          <Button type="primary" loading={busy} onClick={() => submit(false)}>
            {preview
              ? tr("重新预览")
              : editor?.action || module === 'advances'
                ? tr("预览/核对")
                : tr("保存（不新增现金交易）")}
          </Button>
          {preview && (
            <Button type="primary" loading={busy} onClick={() => submit(true)}>
              {tr("确认资金影响并保存")}</Button>
          )}
        </Space>
      </Drawer>
      <Drawer
        title={tr("记录与关联历史")}
        open={detail != null}
        onClose={() => setDetail(undefined)}
        width={620}
      >
        {hidden ? (
          <Alert message={tr("隐私模式已隐藏记录内容")} />
        ) : (
          <RecordDetail data={detail} />
        )}
      </Drawer>
    </>
  );
}
function RecordDetail({ data }: { data: unknown }) {
  useLocale();
  if (Array.isArray(data))
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {data.map((item, i) => (
          <Card key={i} size="small">
            <RecordDetail data={item} />
          </Card>
        ))}
      </Space>
    );
  if (!data || typeof data !== 'object') return null;
  return (
    <>
      {Object.entries(data).map(([key, v]) =>
        typeof v === 'object' && v != null ? (
          <Card key={key} title={labels[key] || key} className="mb16">
            <RecordDetail data={v} />
          </Card>
        ) : (
          <p key={key}>
            <strong>{labels[key] || key}：</strong>
            {enumLabels[String(v)] ?? String(v ?? '—')}
            {[
              'transactionId',
              'ownTransactionId',
              'fundingTransactionId',
              'sourceTransactionId',
              'id',
            ].includes(key) &&
              key !== 'id' &&
              typeof v === 'string' && (
                <Link to={`/transactions/${v}`}> {tr("查看交易")}</Link>
              )}
          </p>
        ),
      )}
    </>
  );
}
function LaborAnalysis() {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const [year, setYear] = useState(dayjs().format('YYYY'));
  const [currency, setCurrency] = useCurrencyState();
  const [kind, setKind] = useState('payroll');
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const withdrawals = useQuery({
    queryKey: [
      'stage-g',
      'housing-withdrawals',
      year,
      currency,
      withdrawalPage,
    ],
    queryFn: () =>
      get('/housing-fund/withdrawals', {
        year,
        currency,
        page: String(withdrawalPage),
        pageSize: '12',
      }),
    enabled: kind === 'housing' && /^\d{4}$/.test(year),
  });
  const withdrawalData = withdrawals.data as
    | {
        items?: {
          id: string;
          amount: string;
          occurredAt: string;
          currency: Currency;
        }[];
        total?: number;
        rule?: string;
      }
    | undefined;
  const q = useQuery({
    queryKey: ['stage-g', 'labor-analysis', year, currency, kind],
    queryFn: () =>
      get(
        kind === 'payroll'
          ? '/payroll/summary'
          : '/social-contributions/summary',
        {
          year,
          currency,
          ...(kind === 'housing' ? { kind: 'HousingFund' } : {}),
        },
      ),
    enabled: /^\d{4}$/.test(year),
  });
  const data = q.data as
    | {
        rows?: Record<string, unknown>[];
        rule?: string;
        missingMonths?: string[];
        componentStructure?: {
          kind: string;
          name: string;
          amount: string;
          months?: { month: string; amount: string }[];
        }[];
        cumulativePersonal?: string;
        cumulativeEmployer?: string;
        cumulativeRule?: string;
        balanceHistory?: {
          id: string;
          date: string;
          balance: string;
          balanceSource: string;
        }[];
      }
    | undefined;
  const columns =
    kind === 'payroll'
      ? [
          'month',
          'gross',
          'deduction',
          'net',
          'actual',
          'difference',
          'yearOverYearNetPercent',
          'monthOverMonthNetPercent',
          'draftCount',
        ]
      : ['month', 'personal', 'employer', 'pendingPersonal'];
  return (
    <Card title={tr("年度工资与缴费分析")}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          aria-label={tr("统计年份")}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ width: 100 }}
        />
        <Select
          aria-label={tr("统计币种")}
          value={currency}
          onChange={setCurrency}
          options={currencies.map(([value, label]) => ({ value, label: tr(label) }))}
        />
        <Select
          aria-label={tr("统计类型")}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'payroll', label: tr("工资") },
            { value: 'social', label: tr("社保") },
            { value: 'housing', label: tr("公积金") },
          ]}
        />
      </Space>
      {q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Alert
            type="info"
            message={data?.rule || tr("按原币展示；分析记录不会生成资金流水。")}
          />
          {!hidden && kind === 'payroll' && (
            <Chart
              option={{
                tooltip: { trigger: 'axis' },
                legend: { data: [tr("应发"), tr("实发"), tr("实际到账")] },
                xAxis: {
                  type: 'category',
                  data: data?.rows?.map((row) => row.month) || [],
                },
                yAxis: { type: 'value', name: currency },
                series: [
                  localizedPair('gross','应发'),
                  localizedPair('net','实发'),
                  localizedPair('actual','实际到账'),
                ].map(([key, name]) => ({
                  type: 'line',
                  name,
                  connectNulls: false,
                  data:
                    data?.rows?.map((row) =>
                      Number(row.count) > 0 ? Number(row[key]) : null,
                    ) || [],
                })),
              }}
            />
          )}
          {kind === 'housing' && data?.cumulativePersonal != null && (
            <Card title={tr("已记录公积金缴费累计")}>
              <p>{data.cumulativeRule}</p>
              <Space>
                {tr("个人：")}<Money value={data.cumulativePersonal} currency={currency} />
                {tr("单位：")}<Money
                  value={data.cumulativeEmployer || '0.00'}
                  currency={currency}
                />
              </Space>
            </Card>
          )}
          <Table
            loading={q.isLoading}
            dataSource={data?.rows || []}
            rowKey={(row) => String(row.month)}
            pagination={false}
            scroll={{ x: 680 }}
            expandable={
              kind !== 'payroll'
                ? {
                    expandedRowRender: (row) =>
                      hidden ? (
                        <p>••••</p>
                      ) : (
                        <Table
                          scroll={{ x: 'max-content' }}
                          rowKey="id"
                          pagination={false}
                          dataSource={
                            (row.basis || []) as Record<string, unknown>[]
                          }
                          columns={[
                            {
                              title: tr("险种"),
                              dataIndex: 'kind',
                              render: (v) => enumLabels[String(v)] || String(v),
                            },
                            {
                              title: tr("基数"),
                              dataIndex: 'basis',
                              render: (v) => (
                                <Money value={String(v)} currency={currency} />
                              ),
                            },
                            {
                              title: tr("实际个人比例%"),
                              dataIndex: 'personalRatePercent',
                              render: (v) =>
                                v == null ? '基数缺失或为零' : String(v),
                            },
                            {
                              title: tr("实际单位比例%"),
                              dataIndex: 'employerRatePercent',
                              render: (v) =>
                                v == null ? '基数缺失或为零' : String(v),
                            },
                          ]}
                        />
                      ),
                  }
                : undefined
            }
            columns={columns.map((key) => ({
              title:
                (
                  {
                    month: '月份',
                    personal: '个人缴费',
                    employer: '单位缴费',
                    pendingPersonal: '待缴个人金额',
                    yearOverYearNetPercent: '实发同比%',
                    monthOverMonthNetPercent: '实发环比%',
                    draftCount: '其中草稿数',
                    ...labels,
                  } as Record<string, string>
                )[key] || key,
              dataIndex: key,
              render: (value: unknown, row: Record<string, unknown>) =>
                key === 'month' ? (
                  String(value)
                ) : hidden ? (
                  '••••'
                ) : key === 'draftCount' ? (
                  String(value)
                ) : key.endsWith('Percent') ? (
                  value == null ? (
                    '缺少可比样本'
                  ) : (
                    String(value)
                  )
                ) : kind === 'payroll' && Number(row.count) === 0 ? (
                  '暂无记录'
                ) : (
                  <Money value={String(value)} currency={currency} />
                ),
            }))}
          />
          {kind === 'payroll' && !!data?.componentStructure?.length && (
            <Table
              scroll={{ x: 'max-content' }}
              rowKey={(row) => row.kind + row.name}
              dataSource={data.componentStructure}
              pagination={false}
              expandable={{
                expandedRowRender: (row) => (
                  <Table
                    scroll={{ x: 'max-content' }}
                    rowKey="month"
                    pagination={false}
                    dataSource={row.months || []}
                    columns={[
                      { title: tr("所属月份"), dataIndex: 'month' },
                      {
                        title: tr("该工资构成的月度金额（奖金/补贴按所录名称）"),
                        dataIndex: 'amount',
                        render: (v) => <Money value={v} currency={currency} />,
                      },
                    ]}
                  />
                ),
              }}
              columns={[
                {
                  title: tr("工资构成"),
                  dataIndex: 'name',
                  render: (value) => (hidden ? '••••' : value),
                },
                {
                  title: tr("类型"),
                  dataIndex: 'kind',
                  render: (value) => enumLabels[value] || value,
                },
                {
                  title: tr("年度原币金额"),
                  dataIndex: 'amount',
                  render: (value) => (
                    <Money value={value} currency={currency} />
                  ),
                },
              ]}
            />
          )}
          {kind === 'housing' && !!data?.balanceHistory?.length && (
            <Table
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={data.balanceHistory}
              pagination={{ pageSize: 12 }}
              columns={[
                { title: tr("余额核对日期"), dataIndex: 'date' },
                {
                  title: tr("来源"),
                  dataIndex: 'balanceSource',
                  render: (v) => (hidden ? '••••' : v),
                },
                {
                  title: tr("余额记录（不另计资产）"),
                  dataIndex: 'balance',
                  render: (value) => (
                    <Money value={value} currency={currency} />
                  ),
                },
              ]}
            />
          )}
          {kind === 'housing' && (
            <Card title={tr("实际公积金提取")}>
              {withdrawals.error ? (
                <ErrorState error={withdrawals.error} />
              ) : (
                <>
                  <p>{withdrawalData?.rule}</p>
                  <Table
                    scroll={{ x: 'max-content' }}
                    rowKey="id"
                    loading={withdrawals.isLoading}
                    dataSource={withdrawalData?.items || []}
                    pagination={{
                      current: withdrawalPage,
                      pageSize: 12,
                      total: withdrawalData?.total || 0,
                      onChange: setWithdrawalPage,
                    }}
                    columns={[
                      {
                        title: tr("实际日期"),
                        dataIndex: 'occurredAt',
                        render: (v) => dayjs(String(v)).format('YYYY-MM-DD'),
                      },
                      {
                        title: tr("原币提取金额"),
                        dataIndex: 'amount',
                        render: (v, row) => (
                          <Money value={v} currency={row.currency} />
                        ),
                      },
                      {
                        title: tr("原转账"),
                        render: (_, row) => (
                          <Link to={`/transactions/${row.id}`}>{tr("查看交易")}</Link>
                        ),
                      },
                    ]}
                  />
                </>
              )}
            </Card>
          )}
          {!!data?.missingMonths?.length && (
            <Alert
              type="warning"
              message={tr("以下月份没有缴费记录：{0}。不能据此认定未缴费。", data.missingMonths.join('、'))}
            />
          )}
        </>
      )}
    </Card>
  );
}
export function PayrollHub() {
  useLocale();
  return (
    <Tabs
      defaultActiveKey="payroll"
      items={[
        {
          key: 'analysis',
          label: tr("年度工资与缴费"),
          children: <LaborAnalysis />,
        },
        {
          key: 'payroll',
          label: tr("工资条"),
          children: <StageGPage module="payroll" />,
        },
        {
          key: 'social',
          label: tr("社保"),
          children: <StageGPage module="contributions" />,
        },
        {
          key: 'housing',
          label: tr("公积金"),
          children: <StageGPage module="housing" />,
        },
      ]}
    />
  );
}
export function LivingCostHub() {
  useLocale();
  return (
    <Tabs
      items={[
        {
          key: 'baskets',
          label: tr("固定篮子"),
          children: <StageGPage module="baskets" />,
        },
        {
          key: 'prices',
          label: tr("商品价格"),
          children: <StageGPage module="prices" />,
        },
      ]}
    />
  );
}
export function AdvancesHub() {
  useLocale();
  return (
    <Tabs
      defaultActiveKey="purchased"
      items={[
        {
          key: 'purchased',
          label: tr("实际代付与交付"),
          children: <StageGPage module="advances" />,
        },
        {
          key: 'plans',
          label: tr("待购与取消"),
          children: <StageGPage module="advancePlans" />,
        },
      ]}
    />
  );
}
export function PaymentInstrumentsHub() {
  useLocale();
  return (
    <Tabs
      items={[
        {
          key: 'instruments',
          label: tr("本人账户付款授权"),
          children: <StageGPage module="instruments" />,
        },
        {
          key: 'external',
          label: tr("账本外第三方付款"),
          children: <StageGPage module="externalFacts" />,
        },
      ]}
    />
  );
}
