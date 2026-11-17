export const anomalyLabels: Record<string, string> = {
  Extreme: '极端金额',
  Duplicate: '重复交易嫌疑',
  Balance: '分录不平衡',
  Category: '分类缺失',
  Merchant: '商户映射异常',
  Refund: '退款关联异常',
  Transfer: '转账配对异常',
  Date: '日期异常',
};
export const anomalyExplanations: Record<string, string> = {
  Extreme: '原币金额达到100000；不代表错误，请结合币种与业务复核。',
  Duplicate: '账户、时间、类型、币种、金额和商户完全相同，需人工确认是否重复。',
  Balance: '缺少资金分录或账本分录的本位金额合计不为零，需核对原始分录。',
  Category: '收支分录缺少分类或引用的分类不存在；合法停用分类不判异常。',
  Merchant: '存在多个同名启用商户映射，需到商户管理核实。',
  Refund: '原支出不存在、已删除、币种不符或退款早于消费。',
  Transfer: '转入账户无效或缺少相应借贷资金分录。',
  Date: '交易早于1900年或超过当前时间24小时。',
};
