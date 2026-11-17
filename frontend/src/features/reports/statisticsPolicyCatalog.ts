import type { LedgerPolicy, PolicyOptions } from './statisticsPolicyApi';
export type Bilingual = readonly [string, string];
export interface PolicyRule {
  id: string;
  title: Bilingual;
  detail: Bilingual;
  kind: 'option' | 'ledger' | 'fixed' | 'related' | 'unavailable';
  field?: keyof PolicyOptions | keyof LedgerPolicy;
  value?: boolean;
  link?: string;
}
export interface PolicyModule {
  id: string;
  title: Bilingual;
  rules: PolicyRule[];
}
const fixed = (
  id: string,
  title: Bilingual,
  detail: Bilingual,
  value?: boolean,
): PolicyRule => ({ id, title, detail, value, kind: 'fixed' });
const related = (
  id: string,
  title: Bilingual,
  detail: Bilingual,
  link: string,
): PolicyRule => ({ id, title, detail, link, kind: 'related' });
const unavailable = (
  id: string,
  title: Bilingual,
  detail: Bilingual,
): PolicyRule => ({ id, title, detail, kind: 'unavailable' });
const option = (
  field: keyof PolicyOptions,
  title: Bilingual,
  detail: Bilingual,
): PolicyRule => ({ id: field, title, detail, kind: 'option', field });
const ledger = (
  field: keyof LedgerPolicy,
  title: Bilingual,
  detail: Bilingual,
): PolicyRule => ({ id: field, title, detail, kind: 'ledger', field });
export const policyModules: PolicyModule[] = [
  {
    id: 'income',
    title: ['收入统计', 'Income'],
    rules: [
      fixed(
        'refund-income',
        ['退款优先冲减原支出', 'Refunds reduce original expenses'],
        [
          '沿用原费用分录和分类，按退款到账日冲减；不再记收入。',
          'Uses original expense entries and categories on receipt date; never adds income.',
        ],
        true,
      ),
      fixed(
        'loan-income',
        ['借款到账计入普通收入', 'Borrowing is ordinary income'],
        [
          '借款到账是现金流入与负债增加，在债务分析单列。',
          'Borrowing is cash inflow and increased debt, shown separately.',
        ],
        false,
      ),
      option(
        'includeCashRewards',
        [
          '已关联现金奖励参与分析收入',
          'Include linked cash rewards in analysis income',
        ],
        [
          '仅识别活动补贴和奖励返现的实际收入及有效追回；未关联红包按手工收入保留。',
          'Uses posted promotion subsidies, reward cashback and valid recoveries. Unlinked gifts remain manual income.',
        ],
      ),
      option(
        'includeDepositInterest',
        [
          '已关联存款利息参与分析收入',
          'Include linked deposit interest in analysis income',
        ],
        [
          '依据存款档案关联的实际利息流水；预计利息不产生收入。',
          'Uses actual interest transactions linked to deposit records; forecasts create no income.',
        ],
      ),
      option(
        'includeInvestmentCashIncome',
        ['已关联分红利息参与分析收入', 'Include linked investment cash income'],
        [
          '仅控制已入账的分红、利息收入；已实现价差损益在投资分析单列，不叠加。',
          'Controls posted dividend and interest income. Realized trading gains remain separate and are not added again.',
        ],
      ),
      unavailable(
        'disposal-income',
        ['出售回款与处置损益', 'Asset disposal proceeds and gains'],
        [
          '证券卖出已有本金与损益分离；其他实物资产暂无完整处置成本记录，不提供总回款计收入开关。',
          'Securities already separate proceeds and gains. Other asset disposals lack complete cost records.',
        ],
      ),
      fixed(
        'transfer-income',
        ['账户转入计入普通收入', 'Internal transfers count as income'],
        [
          '内部转账属于资金迁移；账户流入与统计收入分别展示。',
          'Internal transfers move funds; account inflow is separate from income.',
        ],
        false,
      ),
      fixed(
        'adjustment-income',
        ['余额调增计入普通收入', 'Upward adjustments count as income'],
        [
          '余额校正单列资产变动，不推定经济收入。',
          'Balance corrections are asset movements, not presumed income.',
        ],
        false,
      ),
    ],
  },
  {
    id: 'expense',
    title: ['支出统计', 'Expenses'],
    rules: [
      ledger(
        'includeFees',
        ['手续费计入支出', 'Include fees in expenses'],
        [
          '全账本开关。依据已有费用分类识别，保留费用退款的正负分录。',
          'Ledger-wide setting using existing fee categories, including fee reversals.',
        ],
      ),
      ledger(
        'includeAssetLoss',
        ['资产损失计入支出', 'Include asset losses in expenses'],
        [
          '全账本开关。默认关闭；无论开关状态均影响原账户余额。',
          'Ledger-wide; off by default. Original account balances always reflect losses.',
        ],
      ),
      ledger(
        'includeDecreasingAdjustments',
        ['余额调减计入支出', 'Include downward adjustments in expenses'],
        [
          '全账本开关。默认关闭，避免余额校正混入消费。',
          'Ledger-wide; off by default to keep corrections separate from spending.',
        ],
      ),
      fixed(
        'card-repayment',
        ['信用卡还款计入消费', 'Card repayments count as spending'],
        [
          '消费在刷卡时记录，还款只减少资金和欠款，防止重复。',
          'Spending is recorded at purchase; repayments reduce cash and debt without duplicating it.',
        ],
        false,
      ),
      fixed(
        'principal-expense',
        ['贷款本金偿还计入消费', 'Loan principal counts as spending'],
        [
          '本金归还单列债务现金流。',
          'Principal repayments are separate debt cash flows.',
        ],
        false,
      ),
      fixed(
        'interest-expense',
        ['已发生贷款利息计入费用', 'Posted loan interest counts as expense'],
        [
          '真实费用流水纳入收支；利息分类依赖债务核对，不能由还款总额推算。',
          'Posted expense entries count; interest classification requires debt reconciliation.',
        ],
        true,
      ),
      fixed(
        'withdrawal',
        ['提现计入普通支出', 'Cash withdrawal counts as expense'],
        [
          '按自有账户转账登记的提现属于资产迁移；手工记成消费的流水不会自动改写。',
          'Withdrawals recorded as own-account transfers move assets. Manual expense records are not reinterpreted.',
        ],
        false,
      ),
      fixed(
        'stored-value',
        ['充值与储值卡消费分离', 'Separate top-ups and stored-value spending'],
        [
          '充值按转账、实际使用按消费登记，避免两次计费。',
          'Top-ups use transfers and actual usage uses expenses to prevent double counting.',
        ],
        true,
      ),
      fixed(
        'refund-expense',
        ['退款抵减费用', 'Refunds offset expenses'],
        [
          '净支出允许负值，支持净额或费用退款分列展示。',
          'Net expense may be negative; choose net or separate presentation.',
        ],
        true,
      ),
      fixed(
        'coupon',
        ['优惠券面额计入现金支出', 'Coupon face value counts as cash expense'],
        [
          '优惠券和积分在优惠管理独立展示，消费按已入账净额。',
          'Coupons and points are tracked separately; expense follows posted net amounts.',
        ],
        false,
      ),
      fixed(
        'transfer-fee',
        ['转账手续费独立于本金', 'Transfer fees separate from principal'],
        [
          '手续费分录遵循上方全账本手续费开关。',
          'Fee entries follow the ledger-wide fee setting above.',
        ],
        true,
      ),
      fixed(
        'tax',
        [
          '实际支付税费与工资扣缴分离',
          'Separate paid taxes and payroll withholding',
        ],
        [
          '独立税费费用流水计支出；工资单扣税仅进入薪酬附表，不再重复产生现金支出。',
          'Separate paid tax entries count as expenses. Payroll withholding stays in the payroll schedule.',
        ],
        true,
      ),
      related(
        'capital',
        ['资产购置与普通消费', 'Asset acquisition and consumption'],
        [
          '投资本金采用资产转换；实物资产登记本身不自动冲销手工消费。',
          'Investment principal is an asset conversion. Registering a physical asset does not reverse manual expenses.',
        ],
        '/assets/allocation',
      ),
    ],
  },
  {
    id: 'accounts',
    title: ['转账与账户', 'Transfers and accounts'],
    rules: [
      option(
        'showAccountFlows',
        [
          '展示账户资金流与现金流结余率',
          'Show account movements and cash surplus rate',
        ],
        [
          '流动账户间同币种转账抵销后计算现金流；账户逐行仍显示完整资金流入流出。',
          'Cash flows net same-currency transfers between liquid accounts. Account rows retain full movements.',
        ],
      ),
      fixed(
        'internal',
        [
          '内部转账排除日常收支',
          'Exclude transfers from daily income and expenses',
        ],
        [
          '自有账户资金移动不改变经济收入或消费。',
          'Moving funds between own accounts creates no economic income or spending.',
        ],
        true,
      ),
      unavailable(
        'fx-transfer',
        [
          '跨币种转账汇兑差额单列',
          'Separate FX gains on cross-currency transfers',
        ],
        [
          '已有原币、到账金额与交易汇率；缺少完整历史外汇成本，不把币种差额直接称为已实现损益。',
          'Original amounts and rates exist, but complete historical FX costs are unavailable.',
        ],
      ),
      related(
        'holds',
        ['冻结、可用及待入账余额', 'Frozen, available and pending balances'],
        [
          '资金状态管理独立维护，不由统计开关改变账面余额。',
          'Fund-state management maintains these independently of reporting policy.',
        ],
        '/accounts/fund-status',
      ),
      fixed(
        'archived',
        ['归档账户保留历史交易', 'Retain archived-account history'],
        [
          '账期内真实交易继续参与统计，不按账户当前状态删除历史。',
          'Actual transactions remain in the selected period regardless of current account status.',
        ],
        true,
      ),
      fixed(
        'disabled',
        [
          '停用账户参与历史账面净资产',
          'Include disabled accounts in ledger net worth',
        ],
        [
          '历史余额按有效分录推算，期初生效历史缺失会提示估算限制。',
          'Historical balances use valid entries, with limits where opening-date history is missing.',
        ],
        true,
      ),
      fixed(
        'adjustment-class',
        ['余额调整独立归类', 'Classify balance adjustments separately'],
        [
          '账户变动包含调整；现金流指标排除校正和资产损失。',
          'Account movements include adjustments; cash flow excludes corrections and asset losses.',
        ],
        true,
      ),
      fixed(
        'pending-settled',
        [
          '待确认交易进入已结算分析',
          'Include pending records in settled analysis',
        ],
        [
          '本页分析只纳入 Confirmed 且已发生的交易。',
          'This analysis uses confirmed transactions that have already occurred.',
        ],
        false,
      ),
    ],
  },
  {
    id: 'debt',
    title: ['信用与贷款', 'Credit and loans'],
    rules: [
      option(
        'showDebtAnalysis',
        ['展示债务现金流分析', 'Show debt cash-flow analysis'],
        [
          '列示借入、本金偿还、信用还款、核对后的利息与手续费、剩余本金和计划余款。',
          'Shows borrowing, principal and card repayments, reconciled fees, remaining principal and planned payments.',
        ],
      ),
      fixed(
        'credit-spending',
        ['信用卡、花呗及白条消费计消费', 'Credit purchases count as spending'],
        [
          '消费信用账户的真实消费费用分录进入支出。',
          'Actual expense entries on credit accounts count as spending.',
        ],
        true,
      ),
      fixed(
        'credit-repeat',
        [
          '还款及分期本金重复计支出',
          'Count repayments and installment principal again',
        ],
        [
          '本金不重复确认消费；偿还计划本身不创建分录。',
          'Principal is not counted twice and plans create no ledger entries.',
        ],
        false,
      ),
      fixed(
        'loan-draw',
        [
          '消费贷到账计日常收入',
          'Consumer-loan proceeds count as daily income',
        ],
        [
          '借贷本金进入负债与资金流，不作为工资或生活收入。',
          'Loan proceeds affect debt and cash flow, not wages or daily income.',
        ],
        false,
      ),
      fixed(
        'loan-cost',
        ['融资成本按真实费用记账', 'Record actual financing costs'],
        [
          '分期费、利息、逾期费用或违约金须有费用流水；未独立分类的费用不擅自归类。',
          'Interest, installment, overdue and penalty costs require expense entries. Unclassified costs stay unclassified.',
        ],
        true,
      ),
      fixed(
        'remaining-debt',
        ['未偿本金计负债', 'Outstanding principal is debt'],
        [
          '业务剩余本金与账户负债分别展示，不将两者相加。',
          'Business principal and account liabilities are shown separately and never added together.',
        ],
        true,
      ),
      related(
        'allocation',
        [
          '债务本金、利息和手续费核对',
          'Reconcile principal, interest and fees',
        ],
        [
          '实际核对使用已有偿还计划；撤销或退款使关联失效，需重新核对。',
          'Uses existing repayment plans. Reversals and refunds invalidate allocations.',
        ],
        '/cashflow',
      ),
      related(
        'loan-schedules',
        ['预计每期还款', 'Expected installment payments'],
        [
          '独立还款测算不代表已记账或真实剩余负债。',
          'Standalone schedules are estimates, not posted facts or outstanding debt.',
        ],
        '/loan-schedules',
      ),
    ],
  },
  {
    id: 'investment',
    title: ['投资与资产', 'Investments and assets'],
    rules: [
      option(
        'showInvestmentAnalysis',
        ['展示投资损益附表', 'Show investment performance schedule'],
        [
          '沿用已有成本引擎，按结算日计算期间已实现损益、分红利息与期末浮盈。',
          'Uses the existing cost engine and settlement dates for realized gains, income and unrealized values.',
        ],
      ),
      option(
        'showWealthAnalysis',
        ['展示综合财富变动', 'Show wealth changes'],
        [
          '并列账面净资产变化与资产综合估值，明确估值缺口，不与日常结余重复相加。',
          'Shows ledger net-worth changes alongside consolidated valuation, with coverage gaps.',
        ],
      ),
      fixed(
        'investment-buy',
        ['投资买入计日常消费', 'Investment purchases count as daily spending'],
        [
          '采用 InvestmentPrincipal 的本金流水不计普通消费。',
          'InvestmentPrincipal entries do not count as ordinary consumption.',
        ],
        false,
      ),
      fixed(
        'investment-sell',
        [
          '证券卖出总回款计日常收入',
          'Gross investment sale proceeds count as daily income',
        ],
        [
          '本金回款与已实现损益分开核算。',
          'Principal proceeds and realized gains are calculated separately.',
        ],
        false,
      ),
      fixed(
        'unrealized',
        ['未实现浮盈计普通收入', 'Unrealized gains count as ordinary income'],
        [
          '浮盈进入资产估值附表，缺失估值不推定为零。',
          'Unrealized gains appear in valuation schedules; missing values are not zero.',
        ],
        false,
      ),
      fixed(
        'investment-cost',
        [
          '投资费用纳入成本或净收益',
          'Investment fees enter costs or net proceeds',
        ],
        [
          '买入费用进成本，卖出费用扣回款，已实现损益不再次扣费。',
          'Buy fees enter cost and sell fees reduce proceeds; realized gains do not deduct them again.',
        ],
        true,
      ),
      fixed(
        'investment-loss',
        ['投资亏损计普通消费', 'Investment losses count as ordinary spending'],
        [
          '亏损在投资损益附表展示。',
          'Losses are shown in the investment schedule.',
        ],
        false,
      ),
      unavailable(
        'depreciation',
        [
          '资产折旧与实物处置损益',
          'Depreciation and physical-asset disposal gains',
        ],
        [
          '当前实物资产使用手工估值，无完整折旧和处置成本引擎。',
          'Physical assets use manual valuation without a full depreciation or disposal-cost engine.',
        ],
      ),
      related(
        'valuation',
        ['资产估值及防重复聚合', 'Asset valuation and duplicate prevention'],
        [
          '投资账户须确认余额是现金还是总资产；缺少语义或汇率时标记未覆盖。',
          'Investment balances need a cash-only or total-assets policy. Missing semantics or rates leave coverage gaps.',
        ],
        '/assets/allocation',
      ),
    ],
  },
  {
    id: 'period',
    title: ['时间与账期', 'Periods and timing'],
    rules: [
      option(
        'monthStartDay',
        ['月度统计起始日', 'Monthly period starts on'],
        [
          '1—31日；短月按最后一天起算，下月重新按设定日计算，不累积漂移。',
          'Days 1–31. Short months clamp to the last day; the next boundary returns to the configured day.',
        ],
      ),
      option(
        'yearStartMonth',
        ['年度统计起始月', 'Fiscal year starts in'],
        [
          '仅作用于口径分析的年度账期；现有自然年报表保持原定义。',
          'Applies to annual policy analysis; existing calendar-year reports retain their definition.',
        ],
      ),
      option(
        'weekStartsOn',
        ['周统计起始日', 'Week starts on'],
        [
          '按所选星期确定分析周边界。',
          'Determines the analysis week boundary.',
        ],
      ),
      fixed(
        'occurrence',
        ['按发生时间统计', 'Report by occurrence time'],
        [
          '账本按 OccurredAt，工资和投资附表有明确独立时间依据。',
          'The ledger uses OccurredAt; payroll and investment schedules state their separate time basis.',
        ],
        true,
      ),
      unavailable(
        'posting-time',
        ['按入账时间统计', 'Report by posting time'],
        [
          'CreatedAt 是录入时间，不等同金融机构入账时间；缺少独立入账日期。',
          'CreatedAt is entry creation, not bank posting time. A separate posting date is unavailable.',
        ],
      ),
      fixed(
        'retro-refund',
        ['跨期退款追溯原消费期', 'Backdate cross-period refunds'],
        [
          '当前按到账日冲减，避免静默改写原期现金流。',
          'Refunds offset expenses on receipt date rather than silently changing earlier cash flows.',
        ],
        false,
      ),
      fixed(
        'future',
        ['未来记录计入已发生分析', 'Future records count as actual activity'],
        [
          '未结束账期截到生成时点，计划还款单列。',
          'Open periods end at generation time; repayment plans are separate.',
        ],
        false,
      ),
      fixed(
        'timezone',
        ['统计时区', 'Reporting time zone'],
        [
          '项目业务时区固定为 Asia/Shanghai；当前不支持切换后重算全账本。',
          'The project uses Asia/Shanghai; ledger-wide time-zone changes are not supported.',
        ],
      ),
    ],
  },
  {
    id: 'budget',
    title: ['预算与储蓄', 'Budgets and savings'],
    rules: [
      option(
        'refundDisplay',
        ['费用与退款展示方式', 'Expense and refund presentation'],
        [
          '净额或分列只改变展示；储蓄率始终按退款后的净费用。',
          'Net or separate presentation; savings always uses expense net of refunds.',
        ],
      ),
      option(
        'includeOneTimeIncomeInSavings',
        [
          '一次性收入参与分析储蓄率',
          'Include one-time income in analysis savings rate',
        ],
        [
          '依据已有收入分析属性，交易覆盖优先，再按分类层级继承；未标注收入保留。',
          'Uses existing income attributes, prioritizing transaction overrides then category ancestry. Unclassified income remains.',
        ],
      ),
      fixed(
        'budget-refund',
        ['退款恢复分类预算', 'Refunds restore category budgets'],
        [
          '按退款到账期及原分类抵减，不追溯恢复原月额度。',
          'Offsets the original category in the refund receipt period, not the original month.',
        ],
        true,
      ),
      fixed(
        'budget-transfer',
        ['转账占用消费预算', 'Transfers consume spending budgets'],
        [
          '转账本金不占预算；手续费按全账本规则及费用分类。',
          'Transfer principal does not consume budgets; fees follow ledger policy and category.',
        ],
        false,
      ),
      fixed(
        'budget-credit',
        ['信用消费占用当期预算', 'Credit spending uses current budgets'],
        [
          '实际消费计入当期，信用还款不再占用。',
          'Purchases count in their period; repayments do not count again.',
        ],
        true,
      ),
      fixed(
        'budget-plan',
        ['未来计划占用实际预算', 'Future plans consume actual budgets'],
        ['计划和实际执行分开。', 'Plans and actual execution are separate.'],
        false,
      ),
      unavailable(
        'accrual',
        [
          '已确认未支付费用占用实际预算',
          'Accrued unpaid expenses consume actual budgets',
        ],
        [
          '当前没有完整应计费用及支付状态模型，不能凭录入时间推定费用。',
          'A complete accrual and payment-state model is unavailable.',
        ],
      ),
      fixed(
        'savings-principal',
        [
          '债务本金或投资转入视为储蓄率费用',
          'Principal or investment transfers enter savings expenses',
        ],
        [
          '日常储蓄率不计本金迁移；现金流结余率独立展示。',
          'Daily savings excludes principal movements; cash surplus rate is separate.',
        ],
        false,
      ),
      related(
        'budget-scope',
        ['预算执行范围', 'Budget execution scope'],
        [
          '现有预算支持CNY自然月及年度预算，自定义分析账期不改写原预算。',
          'Existing budgets use CNY calendar months and years. Custom analysis periods do not rewrite them.',
        ],
        '/budgets',
      ),
    ],
  },
  {
    id: 'payroll',
    title: ['工资与社保', 'Payroll and benefits'],
    rules: [
      option(
        'payrollBasis',
        ['工资展示口径', 'Salary presentation basis'],
        [
          '可选应发或实发，扣缴及更正项始终单列，不修改银行现金收入。',
          'Choose gross or net; deductions and adjustments remain separate from bank income.',
        ],
      ),
      option(
        'payrollTimeBasis',
        ['工资统计时间', 'Payroll period basis'],
        [
          '发薪日期或工资归属月份；归属月份以每月1日作为分组日期。',
          'Pay date or earned month. Earned months use their first day as the grouping date.',
        ],
      ),
      fixed(
        'payroll-tax',
        [
          '税费与个人社保、公积金分别展示',
          'Separate tax, social insurance and housing fund',
        ],
        [
          '从有效工资单扣缴项目计算，保留应发、扣缴、实发、更正与实际到账。',
          'Uses valid payslip components, retaining gross, deductions, net, adjustments and linked receipts.',
        ],
        true,
      ),
      fixed(
        'employer-fund',
        [
          '单位缴存计可支配收入',
          'Employer contributions count as disposable income',
        ],
        [
          '单位缴存为独立权益，不再次加入工资现金收入。',
          'Employer contributions are separate benefits, not wage cash income.',
        ],
        false,
      ),
      fixed(
        'bonus',
        ['年终奖与日常工资分列', 'Separate annual bonuses from regular pay'],
        [
          '依据工资项目 AnnualBonus，不猜测交易备注。',
          'Uses the AnnualBonus payroll category rather than transaction notes.',
        ],
        true,
      ),
      fixed(
        'withholding',
        [
          '工资代扣重复计现金支出',
          'Withholding creates additional cash expenses',
        ],
        [
          '代扣留在薪酬附表；银行现金流只按真实账户分录。',
          'Withholding stays in payroll; bank cash flows use actual account entries.',
        ],
        false,
      ),
      related(
        'payroll-center',
        ['工资条与缴费核对', 'Payslips and contribution reconciliation'],
        [
          '草稿、待复核、作废工资条不纳入已确认薪酬。',
          'Draft, pending-review and voided slips are excluded from confirmed payroll.',
        ],
        '/payroll',
      ),
    ],
  },
  {
    id: 'currency',
    title: ['币种与汇率', 'Currencies and exchange rates'],
    rules: [
      option(
        'baseCurrency',
        ['统计默认币种', 'Default reporting currency'],
        [
          '决定本页分析的默认原币，不改变新账户默认币种或旧交易金额。',
          'Sets this analysis default currency without changing account defaults or original amounts.',
        ],
      ),
      fixed(
        'original',
        [
          '保留原币与交易汇率',
          'Retain original currency and transaction rates',
        ],
        [
          '跨币种转账保留原币、到账金额和汇率；原币收支不直接相加。',
          'Cross-currency transfers retain amounts and rates; income and expenses are not added across currencies.',
        ],
        true,
      ),
      related(
        'valuation-fx',
        ['资产采用估值日有效汇率', 'Value assets using dated rates'],
        [
          '综合资产估值使用指定日以前的直接汇率，来源与日期可追溯。',
          'Consolidated valuation uses dated direct rates with traceable sources.',
        ],
        '/assets/allocation',
      ),
      unavailable(
        'historical-conversion',
        [
          '全账本历史交易自动折算',
          'Automatically convert historical ledger reports',
        ],
        [
          '缺少所有历史交易的完整汇率证据，暂不输出看似完整的折算收支。',
          'Complete historical-rate evidence is unavailable for all transactions.',
        ],
      ),
      unavailable(
        'fx-gain',
        [
          '已实现与未实现汇兑损益分拆',
          'Split realized and unrealized FX gains',
        ],
        [
          '当前不具备独立外币持仓成本账，不能把估值变动全部归因为汇兑收益。',
          'A separate foreign-currency cost ledger is unavailable for reliable FX attribution.',
        ],
      ),
      fixed(
        'missing-rate',
        ['缺少汇率按1:1核算', 'Use 1:1 for missing rates'],
        [
          '缺失汇率标记未覆盖，综合资产汇总显示完整性缺口。',
          'Missing rates leave an explicit valuation coverage gap.',
        ],
        false,
      ),
      related(
        'fx-source',
        ['汇率来源与更新时间', 'Rate sources and dates'],
        [
          '使用已有货币与汇率管理核对。',
          'Review existing currency and exchange-rate records.',
        ],
        '/settings/currencies',
      ),
    ],
  },
  {
    id: 'quality',
    title: ['数据质量', 'Data quality'],
    rules: [
      option(
        'highlightLargeTransactions',
        ['突出大额消费', 'Highlight large expenses'],
        [
          '仅作金额提示，不判断风险；最多展示金额最高的20笔。',
          'Amount-only highlights, not risk judgments; shows the largest 20 records.',
        ],
      ),
      option(
        'largeTransactionThreshold',
        ['大额交易阈值', 'Large transaction threshold'],
        [
          '以当前分析原币计，必须大于0。',
          'Uses the selected original currency and must be positive.',
        ],
      ),
      fixed(
        'duplicates',
        ['已识别重复导入只入账一次', 'Post recognized import duplicates once'],
        [
          '沿用导入身份识别和人工复核；不能仅凭同日同额认定重复。',
          'Uses existing import identity and review rules; matching dates and amounts alone do not prove duplication.',
        ],
        true,
      ),
      fixed(
        'deleted',
        ['删除或撤销记录排除分析', 'Exclude deleted or reversed records'],
        [
          '仅统计有效已确认流水；投资和债务撤销按各模块有效性校验。',
          'Uses valid confirmed records, with investment and debt reversal checks.',
        ],
        true,
      ),
      fixed(
        'unclassified',
        ['未分类费用保留总额', 'Keep unclassified expenses in totals'],
        [
          '进入未分类分组并提示整理，不因缺分类而排除真实费用。',
          'Included in totals and an unclassified bucket, with a review prompt.',
        ],
        true,
      ),
      fixed(
        'invalid',
        ['无效金额纳入统计', 'Include invalid amounts'],
        [
          '创建交易使用现有金额约束，统计不以无效金额补零。',
          'Existing transaction validation rejects invalid amounts rather than inventing zero values.',
        ],
        false,
      ),
      related(
        'reconciliation',
        ['账户余额差异核对', 'Reconcile balance differences'],
        [
          '余额差异来自对账实际结果，不由收支差自动推定。',
          'Differences require actual reconciliation, not income-minus-expense assumptions.',
        ],
        '/reconciliation',
      ),
      fixed(
        'recalculate',
        ['分类变更后重新计算', 'Recalculate after classification changes'],
        [
          '查询读取当前分类与分析属性；审计保留配置变化，历史报表归档另有快照。',
          'Queries use current categories and attributes. Policy audits track changes; archived reports have separate snapshots.',
        ],
        true,
      ),
    ],
  },
];
export const managementDefaults: PolicyOptions = {
  mode: 'Everyday',
  baseCurrency: 'CNY',
  monthStartDay: 1,
  yearStartMonth: 1,
  weekStartsOn: 1,
  refundDisplay: 'Net',
  includeCashRewards: true,
  includeDepositInterest: true,
  includeInvestmentCashIncome: true,
  includeOneTimeIncomeInSavings: true,
  payrollBasis: 'Net',
  payrollTimeBasis: 'Paid',
  showAccountFlows: true,
  showDebtAnalysis: true,
  showInvestmentAnalysis: false,
  showWealthAnalysis: false,
  highlightLargeTransactions: true,
  largeTransactionThreshold: '1000.00',
};
