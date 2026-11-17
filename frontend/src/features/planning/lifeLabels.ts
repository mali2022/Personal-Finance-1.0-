const labels: Record<string, [string, string]> = {
  TARGET_REDUCES_INITIAL_INVESTMENTS_THEN_CASH_ABOVE_RESERVE_FLOOR: ['目标求解先扣减起始投资，再扣减高于储备底线的现金','The target solver reduces initial investments, then cash above the reserve floor'],
  CONFIRM_FUTURE_NET_INCOME_AND_EXPENSE: [
    '确认未来税后收入与费用',
    'Confirm future net income and expenses',
  ],
  CLASSIFY_INVESTABLE_VS_RESTRICTED_ASSETS: [
    '审核可投资与受限资产分类',
    'Review investable and restricted asset classification',
  ],
  LOAN_TERMS_NOT_IMPORTED: [
    '贷款条款尚未导入',
    'Loan terms have not been imported',
  ],
  FUTURE_PLANS_NOT_AUTOMATICALLY_IMPORTED: [
    '未来计划需明确选择录入',
    'Select future plans explicitly',
  ],
  REVIEW_ALLOCATION_MISSING_VALUATIONS_AND_FX: [
    '检查缺失估值与汇率',
    'Review missing valuations and FX',
  ],
  SAME_CURRENCY_LIQUID_CASH_ONLY: [
    '可用现金只含同币种流动资金',
    'Liquid cash includes the same currency only',
  ],
  HOUSEHOLD_SHARED_SPACES_NOT_INCLUDED: [
    '不包含家庭共享空间',
    'Shared household spaces are excluded',
  ],
  ASSUMPTIONS_NOT_GUARANTEES: [
    '预测依赖假设，并非保证',
    'Projections depend on assumptions, not guarantees',
  ],
  MONTH_START_HOUSEHOLD_FLOWS: [
    '家庭月收支按期初发生',
    'Monthly household flows occur at period start',
  ],
  MIDMONTH_CHANGES_NEXT_PERIOD: [
    '期中月收支变更从下期生效',
    'Mid-period income/spending changes apply next period',
  ],
  NO_AUTOMATIC_ASSET_LIQUIDATION: [
    '不自动出售资产',
    'Assets are not sold automatically',
  ],
  NO_AUTOMATIC_PROPERTY_OR_RESTRICTED_ASSET_LIQUIDATION: [
    '不自动变现房产或受限资产',
    'Property and restricted assets are not liquidated automatically',
  ],
  RESERVE_FLOOR_BREACHED: [
    '现金低于储备底线',
    'Cash falls below the reserve floor',
  ],
  UNSCHEDULED_DEBT_NO_PAYMENTS_MODELED: [
    '未排期负债尚未计算还款',
    'Payments for unscheduled debt are not modeled',
  ],
  USER_ENABLED_IMMEDIATE_INVESTMENT_LIQUIDATION_WITH_ASSUMED_FEE: [
    '已允许按假设成本即时投资提款',
    'Immediate investment drawdown is enabled at the assumed fee',
  ],
  PENSION_IS_USER_ASSUMPTION_NOT_LAW: [
    '养老金来自用户假设，不代表制度承诺',
    'Pension is a user assumption, not a policy guarantee',
  ],
  AGE_YEAR_OFFSETS_FROM_BASELINE_DATE: [
    '年龄以基准日期为完整年偏移',
    'Ages use complete-year offsets from the baseline',
  ],
  NO_PROPERTY_OR_RESTRICTED_ASSET_WITHDRAWALS: [
    '不提取住房权益及受限资产',
    'No home-equity or restricted-asset withdrawals',
  ],
  ADDITIONAL_SAVING_REQUIRES_REAL_INCOME_OR_SPENDING_ADJUSTMENT: [
    '新增储蓄需要真实增加收入或降低支出',
    'Additional saving requires real income or spending changes',
  ],
  TARGET_IS_SUFFICIENT_FOR_THIS_DETERMINISTIC_PATH_NOT_A_SAFE_WITHDRAWAL_GUARANTEE:
    [
      '资金目标仅对当前确定性路径有效',
      'Funding target applies to this deterministic path only',
    ],
  FIX_PRE_RETIREMENT_LIQUIDITY_BEFORE_SOLVING_TARGET: [
    '请先解决退休前现金缺口',
    'Resolve pre-retirement liquidity gaps before solving the target',
  ],
  UNSCHEDULED_DEBT_PREVENTS_A_RELIABLE_FUNDING_TARGET: [
    '缺少负债还款计划，暂不计算可靠资金目标',
    'Missing debt schedules prevent a reliable funding target',
  ],
  NO_FEASIBLE_TARGET_WITHIN_RESOURCE_AND_AMOUNT_LIMITS: [
    '当前金额与资源限制内未找到可行目标',
    'No feasible target within amount and resource limits',
  ],
  ASSUMPTIONS_NOT_REAL_WORLD_PROBABILITIES: [
    '模拟比例不是现实发生概率',
    'Simulation ratios are not real-world probabilities',
  ],
  HISTORICAL_RETURNS_NOT_GUARANTEES: [
    '历史收益不代表未来收益',
    'Historical returns do not guarantee future returns',
  ],
  INDEPENDENT_MONTHS_WITH_CONSTANT_CORRELATION: [
    '采用独立月份及固定相关性假设',
    'Assumes independent months and constant correlation',
  ],
  GOALS_SHARE_UNALLOCATED_ASSETS: [
    '目标可能争用同一份未分配资金',
    'Goals may compete for the same unallocated assets',
  ],
  INFLATION_CHANGES_REAL_VALUES_NOT_NOMINAL_SPENDING: [
    '通胀折算购买力，名义费用另设增长',
    'Inflation deflates values; nominal spending has separate growth',
  ],
  HOUSEHOLD_CHANGE_EVENTS_OVERRIDE_LEVELS_FROM_NEXT_PERIOD: [
    '月收支变更从对应期次覆盖',
    'Household change events override levels from their effective period',
  ],
};
export function lifeMessage(code: string, en: boolean) {
  return labels[code]?.[en ? 1 : 0] || code;
}
