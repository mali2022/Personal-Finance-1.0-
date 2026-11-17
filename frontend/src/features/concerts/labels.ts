export const categories: Record<string, string> = {
  Ticket: '门票',
  Transport: '交通',
  Hotel: '住宿',
  Food: '餐饮',
  Merch: '周边商品',
  Support: '应援',
  Storage: '寄存',
  Insurance: '保险',
  Fee: '手续费',
  Other: '其他费用',
};
export const sceneStates: Record<string, string> = {
  Planning: '计划中',
  Queuing: '抢票中',
  Ticketed: '已购票',
  Upcoming: '待演出',
  Attended: '已参加',
  Cancelled: '已取消',
  Postponed: '已延期',
};
export const orderStates: Record<string, string> = {
  Planning: '购票计划',
  Queuing: '记录抢票',
  PendingPayment: '待支付',
  Paid: '已支付',
  Issued: '已出票',
  Used: '已验票 / 使用',
  Cancelled: '已取消',
  Postponed: '已延期',
};
export const refundStates: Record<string, string> = {
  None: '未申请',
  Requested: '已申请退款',
  Approved: '已批准退款',
  Partial: '部分到账',
  Full: '全额到账',
  Rejected: '已拒绝',
};
