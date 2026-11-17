export type Id = string;
/** API 金额使用十进制字符串，禁止用浮点数存储财务事实。 */
export type Decimal = string;
export type ISODateTime = string;
export type Currency = string;
export type AccountType =
  | 'ElectronicWallet'
  | 'ConsumerCredit'
  | 'ConsumerLoan'
  | 'SecuredLoan'
  | 'Cash'
  | 'Bank'
  | 'CreditCard'
  | 'Alipay'
  | 'WeChat'
  | 'StoredValue'
  | 'Investment'
  | 'Receivable'
  | 'Payable'
  | 'Other';
export type TransactionType =
  | 'Expense'
  | 'Income'
  | 'RewardReversal'
  | 'Transfer'
  | 'Refund'
  | 'CreditCardPayment'
  | 'ReimbursementAdvance'
  | 'ReimbursementReceived'
  | 'LoanGiven'
  | 'LoanReceived'
  | 'LoanRepaymentPaid'
  | 'LoanRepaymentReceived'
  | 'Adjustment'
  | 'AssetLoss'
  | 'InvestmentPrincipal';
export type RecordStatus =
  'Active' | 'Paused' | 'Disabled' | 'Archived' | 'Closed';
export interface User {
  language?: 'zh-CN' | 'en';
  avatarUpdatedAt?: string | null;
  id: Id;
  displayName: string;
  email: string;
  permissions: string[];
}
export interface Account {
  availableBalance?: Decimal;
  bankBranch?: string;
  alias?: string;
  lastTransactionAt?: string;
  accountCode?: string;
  groupId?: string;
  sortOrder?: number;
  isPinned?: boolean;
  isDefaultIncome?: boolean;
  isDefaultExpense?: boolean;
  openedAt?: string;
  closedAt?: string;
  archivedAt?: string;
  createdAt?: string;
  description?: string;
  billingMode?: 'Monthly' | 'PerPurchase';
  contractNumber?: string;
  loanPurpose?: string;
  cardNumber?: string | null;
  lastFourDigits?: string | null;
  cardNumberMasked?: string;
  cardHolderName?: string;
  cardBrand?: string;
  cardAlias?: string;
  debt?: Decimal;
  availableCredit?: Decimal;
  version?: string;
  id: Id;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: Decimal;
  institution?: string;
  status: RecordStatus;
  creditLimit?: Decimal;
  statementDay?: number;
  paymentDay?: number;
}
export interface Category {
  version: string;
  id: Id;
  name: string;
  parentId?: Id;
  kind: 'Expense' | 'Income';
  status: RecordStatus;
  sortOrder: number;
}
export interface Merchant {
  id: Id;
  name: string;
  defaultCategoryId?: Id;
  transactionCount: number;
  totalExpense: Decimal;
  lastTransactionAt?: ISODateTime;
}
export interface Counterparty {
  id: Id;
  name: string;
}
export interface Tag {
  id: Id;
  name: string;
  transactionCount: number;
  totalAmount: Decimal;
}
export interface Project {
  id: Id;
  name: string;
  budget: Decimal;
  spent: Decimal;
  startDate: string;
  endDate?: string;
  status: 'Planned' | 'Active' | 'Completed';
}
export interface Attachment {
  version?: string;
  id: Id;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: ISODateTime;
  downloadUrl: string;
}
export interface TransactionEntry {
  id: Id;
  kind: 'Account' | 'Expense' | 'Income' | 'Equity';
  accountId?: Id;
  categoryId?: Id;
  amount: Decimal;
  currency: Currency;
  exchangeRate: Decimal;
  baseAmount: Decimal;
  originalEntryId?: Id;
}
export interface SplitItem {
  categoryId: Id;
  amount: Decimal;
}
export interface PaymentSplit {
  accountId: Id;
  amount: Decimal;
}
export interface Transaction {
  payments?: PaymentSplit[];
  accountBalances?: {
    accountId: Id;
    name: string;
    currency: Currency;
    balance: Decimal;
  }[];
  productName?: string | null;
  transferKind?: 'TopUp' | 'Withdrawal' | null;
  promotion?: PromotionInput;
  adjustmentDirection?: 'Increase' | 'Decrease';
  importSource?: ImportSource;
  importJobId?: Id;
  externalId?: string;
  businessId?: Id;
  projectName?: string;
  tagNames?: string[];
  receivedAmount?: Decimal;
  exchangeRate?: Decimal;
  feeCategoryId?: Id;
  id: Id;
  type: TransactionType;
  amount: Decimal;
  currency: Currency;
  accountId: Id;
  toAccountId?: Id;
  categoryId?: Id;
  merchant?: string;
  occurredAt: ISODateTime;
  note: string;
  tagIds: Id[];
  projectId?: Id;
  status: 'Confirmed' | 'Deleted' | 'NeedsReview';
  originalTransactionId?: Id;
  refundedAmount: Decimal;
  fee: Decimal;
  splits: SplitItem[];
  version: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export type TransactionListDto = Transaction;
export interface TransactionDetailDto extends Transaction {
  entries: TransactionEntry[];
  attachments: Attachment[];
  relatedTransactions: TransactionListDto[];
}
export interface CreateExpenseRequest {
  payments?: PaymentSplit[];
  productName?: string;
  transferKind?: 'TopUp' | 'Withdrawal' | '';
  amount: Decimal;
  accountId: Id;
  categoryId?: Id;
  merchant?: string;
  occurredAt: ISODateTime;
  note: string;
  tagIds: Id[];
  projectId?: Id;
  splits: SplitItem[];
}
export type CreateIncomeRequest = CreateExpenseRequest;
export interface CreateTransferRequest extends Omit<
  CreateExpenseRequest,
  'categoryId' | 'splits'
> {
  toAccountId: Id;
  fee: Decimal;
  feeCategoryId?: Id;
  exchangeRate?: Decimal;
  receivedAmount?: Decimal;
}
export interface CreateRefundRequest extends Omit<
  CreateExpenseRequest,
  'categoryId' | 'splits'
> {
  originalTransactionId: Id;
}
export interface SaveTransactionRequest extends CreateExpenseRequest {
  collaboration?: import("../features/collaboration/api").CollaborationInput;
  currency?: Currency;
  origin?: 'AiConfirmed';
  aiDraftId?: string;
  aiDraftVersion?: string;
  aiDuplicateAcknowledged?: boolean;
  promotion?: PromotionInput;
  feeCategoryId?: Id;
  type: TransactionType;
  toAccountId?: Id;
  originalTransactionId?: Id;
  fee: Decimal;
  receivedAmount?: Decimal;
  exchangeRate?: Decimal;
  version?: string;
}
export interface PromotionInput {
  originalAmount: string;
  currency: Currency;
  shippingAmount?: string;
  lines: {
    type: string;
    amount: string;
    order: number;
    source?: string;
    activity?: string;
    note?: string;
    benefitId?: string;
    benefitVersion?: string;
  }[];
}
export interface BudgetItem {
  id: Id;
  categoryId: Id;
  limit: Decimal;
  used: Decimal;
  baseLimit?: Decimal;
  carryover?: Decimal;
}
export interface Budget {
  version: string;
  id: Id;
  month: string;
  total: Decimal;
  baseTotal?: Decimal;
  carryover?: Decimal;
  used: Decimal;
  items: BudgetItem[];
}
export interface Loan {
  id: Id;
  direction: 'Lent' | 'Borrowed';
  counterpartyId: Id;
  principal: Decimal;
  repaid: Decimal;
  outstanding: Decimal;
  occurredAt: ISODateTime;
  repayments: TransactionListDto[];
}
export interface Reimbursement {
  id: Id;
  originalTransactionId: Id;
  counterpartyId: Id;
  advanced: Decimal;
  received: Decimal;
  outstanding: Decimal;
  status: 'Draft' | 'Submitted' | 'Partial' | 'Settled' | 'Abandoned';
  receipts: TransactionListDto[];
}
export interface TrendPoint {
  month: string;
  income: Decimal;
  expense: Decimal;
  netWorth: Decimal;
}
export interface CategoryStat {
  categoryId: Id;
  name: string;
  amount: Decimal;
  share: number;
}
export interface DashboardSummary {
  currency?: Currency;
  month: string;
  income: Decimal;
  expense: Decimal;
  surplus: Decimal;
  assets: Decimal;
  liabilities: Decimal;
  netWorth: Decimal;
  previousIncome: Decimal;
  previousExpense: Decimal;
  accounts: Account[];
  budget: Budget;
  categories: CategoryStat[];
  trend: TrendPoint[];
  recentTransactions: TransactionListDto[];
}
export type DashboardDto = DashboardSummary;
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ApiResponse<T> {
  data: T;
  traceId?: string;
}
export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, string[]>;
  traceId?: string;
}
export interface TransactionFilters {
  accountIds?: string;
  categoryIds?: string;
  merchants?: string;
  projectIds?: string;
  tagIds?: string;
  source?: string;
  anomaly?: string;
  reconciliation?: string;
  reviewState?: string;
  merchant?: string;
  importJobId?: Id;
  currency?: Currency;
  refundable?: boolean;
  page: number;
  pageSize: number;
  sort: string;
  keyword?: string;
  type?: TransactionType;
  transferKind?: 'TopUp' | 'Withdrawal';
  accountId?: Id;
  categoryId?: Id;
  start?: string;
  end?: string;
  min?: Decimal;
  max?: Decimal;
  status?: Transaction['status'];
  /** Strict stored-status flag; unlike status=NeedsReview it never widens into the review queue. */
  statusFlag?: 'NeedsReview';
  projectId?: Id;
  tagId?: Id;
}
export interface RefundSourceDto extends TransactionListDto {
  refundableAmount: Decimal;
  refundableSplits: SplitItem[];
}
export type RefundSourceChoice = Pick<RefundSourceDto,
  'id' | 'amount' | 'currency' | 'accountId' | 'merchant' | 'note' | 'occurredAt' | 'refundedAmount' | 'refundableAmount'>;
export interface SaveBudgetRequest {
  total: Decimal;
  items: { categoryId: Id; limit: Decimal }[];
  version?: string;
}
export type ReportGranularity = 'day' | 'week' | 'month' | 'year';
export interface ReportFilters {
  start: string;
  end: string;
  granularity: ReportGranularity;
  currency: Currency;
  parentId?: Id;
  projectId?: Id;
}
export interface ReportPoint {
  period: string;
  income: Decimal;
  expense: Decimal;
  assets: Decimal;
  liabilities: Decimal;
  netWorth: Decimal;
}
export interface ReportDto {
  income: Decimal;
  expense: Decimal;
  assets: Decimal;
  liabilities: Decimal;
  netWorth: Decimal;
  currency: Currency;
  categories: CategoryStat[];
  points: ReportPoint[];
  excludedCurrencies: Currency[];
}
export interface CreditCardStatementDto {
  postStatementCredits?: Decimal;
  accountId: Id;
  currency: Currency;
  cycleStart: string;
  statementDate: string;
  dueDate: string;
  purchases: Decimal;
  refunds: Decimal;
  statementAmount: Decimal;
  repaid: Decimal;
  remaining: Decimal;
  unbilled: Decimal;
}
export interface BusinessRecord {
  id: Id;
  kind: 'Lent' | 'Borrowed' | 'Reimbursement';
  counterparty: string;
  currency: Currency;
  principal: Decimal;
  settled: Decimal;
  outstanding: Decimal;
  accountId: Id;
  contractAccountId: Id;
  occurredAt: ISODateTime;
  note: string;
  status: 'Draft' | 'Submitted' | 'Partial' | 'Settled' | 'Abandoned';
  version: string;
  history: Transaction[];
}
export interface CreateBusinessRequest {
  kind: BusinessRecord['kind'];
  counterparty: string;
  accountId: Id;
  amount: Decimal;
  occurredAt: ISODateTime;
  note: string;
}
export interface SettleBusinessRequest {
  accountId: Id;
  amount: Decimal;
  occurredAt: ISODateTime;
  note: string;
  version: string;
}
export interface DirectoryRecord {
  defaultCode?: string | null;
  defaultGroup?: string | null;
  lastTransactionAt?: ISODateTime;
  id: Id;
  kind: 'projects' | 'merchants' | 'tags' | 'templates';
  name: string;
  currency: Currency;
  budget: Decimal;
  spent: Decimal;
  transactionCount: number;
  categoryId?: Id;
  accountId?: Id;
  amount?: Decimal;
  startDate?: string;
  endDate?: string;
  status: 'Active' | 'Disabled' | 'Completed';
  version: string;
}
export interface ImportMapping {
  statementDirection?: string;
  postedAt?: string;
  counterpartyAccount?: string;
  paymentSource?: string;
  productName?: string;
  category2?: string;
  category3?: string;
  discountAmount?: string;
  occurredAt: string;
  amount: string;
  type: string;
  merchant?: string;
  note?: string;
  category?: string;
  externalId?: string;
  status?: string;
  account?: string;
  toAccount?: string;
  fee?: string;
  feeCategory?: string;
  receivedAmount?: string;
  exchangeRate?: string;
  currency?: string;
}
export type ImportSource = 'CSV' | 'Excel' | 'Alipay' | 'WeChat' | 'Bank';
export interface ImportSummary {
  total: number;
  ready: number;
  duplicate: number;
  suspected: number;
  skipped: number;
  invalid: number;
  needsReview: number;
}
export interface ImportJob {
  purpose?: 'Bookkeeping'|'Reconciliation';
  sourceFrozen?: boolean;
  reconciliationOnly?: boolean;
  sourceHash?: string;
  sourceEncoding?: string;
  headerRow?: number;
  id: Id;
  fileName: string;
  source: ImportSource;
  headers: string[];
  sampleRows: string[][];
  total: number;
  version: string;
  state: 'Uploaded' | 'Preview' | 'Completed';
  mapping?: ImportMapping;
  accountId?: Id;
  summary?: ImportSummary;
  imported?: number;
  requiresIdentityRecheck?: boolean;
}
export interface ImportRow {
  statementAmount?: Decimal;
  productName?: string;
  discountAmount?: Decimal;
  originalAmount?: Decimal;
  categoryMappingIssue?: string;
  rawMerchant?: string;
  merchantId?: string;
  merchantMatch?: 'ExactOrAlias' | 'Empty' | 'Unmatched';
  sourceLine?: number;
  sourceStatus?: string;
  sourceExcluded?: boolean;
  id: Id;
  index: number;
  occurredAt: ISODateTime;
  amount: Decimal;
  type: 'Expense' | 'Income' | 'Transfer' | 'Refund' | 'CreditCardPayment' | 'Unknown';
  transferKind?: 'TopUp' | 'Withdrawal' | null;
  fee?: Decimal;
  feeCategoryId?: Id;
  receivedAmount?: Decimal;
  exchangeRate?: Decimal;
  accountId: Id;
  toAccountId?: Id;
  currency: Currency;
  merchant: string;
  note: string;
  categoryId?: Id;
  externalId?: string;
  status:
    'Ready' | 'Duplicate' | 'Invalid' | 'Imported' | 'Suspected' | 'Skipped';
  duplicateKind?: 'None' | 'Deterministic' | 'Suspected' | 'Conflict';
  duplicateCandidates?: {
    kind: 'Transaction' | 'Row';
    id: Id;
    index?: number;
  }[];
  candidateCount?: number;
  reviewDecision?: 'Keep' | 'Skip' | null;
  reviewedAt?: ISODateTime;
  issues: string[];
  recommendation?: string;
  needsReview: boolean;
}
export interface ImportRowPatch {
  productName?: string;
  discountAmount?: Decimal;
  merchant?: string;
  merchantId?: string;
  note?: string;
  occurredAt?: string;
  accountId?: Id;
  transferKind?: 'TopUp' | 'Withdrawal' | '';
  fee?: Decimal;
  feeCategoryId?: Id;
  receivedAmount?: Decimal;
  exchangeRate?: Decimal;
  type?: ImportRow['type'];
  categoryId?: Id;
  amount?: Decimal;
  toAccountId?: Id;
}
export interface ImportAttempt {
  id: Id;
  state: 'Completed' | 'Failed';
  code: string;
  message: string;
  total: number;
  imported: number;
  skipped: number;
  createdAt: ISODateTime;
  traceId: string;
}
export interface ImportOutcome {
  id: Id;
  index: number;
  status: ImportRow['status'];
  issues: string[];
}
export interface ReconciliationSnapshot {
  accountId: Id;
  currency: Currency;
  systemBalance: Decimal;
  actualBalance: Decimal;
  difference: Decimal;
  version: string;
  capturedAt: ISODateTime;
}
export interface ReconciliationRecord extends ReconciliationSnapshot {
  id: Id;
  transactionId?: Id;
  reason: string;
  createdAt: ISODateTime;
}
export interface AccountAnalysisDto {
  currency: Currency;
  inflow: Decimal;
  outflow: Decimal;
  points: {
    period: string;
    balance: Decimal;
    inflow: Decimal;
    outflow: Decimal;
  }[];
}
export interface AdvancedReportDto {
  currency: Currency;
  merchants: { name: string; count: number; expense: Decimal }[];
  frequentMerchants: { name: string; count: number; expense: Decimal }[];
  accounts: {
    id: Id;
    name: string;
    inflow: Decimal;
    outflow: Decimal;
    balance: Decimal;
  }[];
  projects: { id: Id; name: string; budget: Decimal; expense: Decimal }[];
}
export interface StatisticsRules {
  includeFees: boolean;
  includeAssetLoss: boolean;
  includeDecreasingAdjustments: boolean;
  version: string;
}
export interface ExportJob {
  id: Id;
  state: 'Ready';
  fileName: string;
  count: number;
  format: 'CSV' | 'Excel';
}
