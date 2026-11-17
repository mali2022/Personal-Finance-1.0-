import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
export interface Modules {
  concerts: boolean;
  version: string;
}
export interface TourInput {
  name: string; artist: string; startsOn: string | null; endsOn: string | null;
  state: string; note: string;
}
export interface Tour { id: string; version: string; input: TourInput; sceneCount: number }
export interface TourReport {
  id: string; version: string; input: TourInput; scenes: Detail[]; rule: string;
  currencies: { currency: string; count: number; attended: number; insuranceRecovery?: string; finalPersonalCost?: string; pendingPayables?: string; transferRecovery?: string; personalAfterTransfers?: string; totalBudget: string; originalCosts: string; confirmedRefunds: string; actual: string; personalNetCost: string; planned: string; pendingAdvances: string; remaining: string }[];
}
export interface Budget {
  category: string;
  amount: string;
}
export interface Ticket {
  outcome?: { state: 'Open' | 'Unused'; note: string } | null;
  paidShare?: string | null;
  personalShare?: string | null;
  transfer?: TicketTransfer | null;
  gift?: TicketGift | null;
  id: string;
  tier: string;
  seat: string;
  attendee: string;
  format: 'Electronic' | 'Paper';
  state: 'Pending' | 'Received' | 'Used' | 'Cancelled';
}
export interface TicketGift { from: string; recipient: string; giftedOn: string; state: 'Given' | 'Revoked'; note: string; platformAllowed: boolean }
export interface TransferPayment { transactionId: string; amount: string }
export interface TicketTransfer { seller: string; buyer: string; transferredOn: string; agreedAmount: string; state: 'Recorded' | 'Revoked'; receipts: TransferPayment[]; returns: TransferPayment[]; note: string; platformAllowed: boolean }
export interface TransferSummary { received: string; returned: string; netRecovery: string; uncollected: string; pendingReturn: string; rows: { ticketId: string; advanceSettlement?: string; seller: string; buyer: string; state: string; received: string; returned: string; netRecovery: string; uncollected: string; pendingReturn: string; receipts: TransferPayment[]; returns: TransferPayment[] }[] }
export interface Order {
  origin?: { kind: 'Self' | 'Gift'; from: string; receivedOn: string | null; note: string; platformAllowed: boolean } | null;
  artistAllocation?: ArtistAllocation | null;
  tickets?: Ticket[] | null;
  paymentParts?: import('./PaymentParts').PaymentPart[] | null;
  id: string;
  platform: string;
  number: string;
  orderedOn: string | null;
  paidOn: string | null;
  facePrice: string;
  quantity: number;
  paidAmount: string;
  fee: string;
  tier: string;
  seat: string;
  holder: string;
  state: string;
  refundState: string;
  paymentTransactionId: string | null;
  attachmentIds: string[];
}
export interface Cost {
  artistAllocation?: ArtistAllocation | null;
  id: string;
  category: string;
  transactionId: string;
  entryId: string | null;
  amount: string;
  payer: string;
  bearer: string;
}
export interface Planned {
  id: string;
  category: string;
  title: string;
  amount: string;
  state: string;
  costId: string | null;
}
export interface Refund {
  ticketId?: string | null;
  id: string;
  costId: string;
  state: string;
  requestedAmount: string;
  nonRefundable: string;
  transactionId: string | null;
  receivedAmount: string;
  note: string;
}
export interface Companion {
  id: string;
  name: string;
  holder: string;
  payer: string;
  bearer: string;
  ratio: number;
  amount: string;
  advanceId: string | null;
  costId: string | null;
}
export interface Concert {
  eventType?: 'Concert' | 'JointConcert' | 'Festival' | null;
  insurance?: Insurance[] | null;
  closing?: { state: 'Open' | 'Closed'; closedOn: string | null; note: string } | null;
  artistAllocation?: ArtistAllocation | null;
  artistLink?: { artistId: string | null } | null;
  timeZone?: string | null;
  artist: string;
  tourName: string;
  tourId: string | null;
  title: string;
  startsAt: string;
  city: string;
  venue: string;
  sessionNumber: string;
  organizer: string;
  platform: string;
  currency: string;
  totalBudget: string;
  expectedPeople: number;
  actualPeople: number;
  note: string;
  state: string;
  attachmentIds: string[];
  budgets: Budget[];
  orders: Order[];
  costs: Cost[];
  plans: Planned[];
  refunds: Refund[];
  companions: Companion[];
}
export interface ArtistAllocation { mode: 'Primary' | 'Split'; shares: { artistId: string; ratio: number }[] }
export interface Insurance { id: string; ticketId: string; provider: string; policyNumber: string; requestedAmount: string; state: 'Open' | 'Settled' | 'Rejected' | 'Revoked'; receipts: TransferPayment[]; returns: TransferPayment[]; note: string }
export interface ArtistAttribution {
  artistId: string | null; name: string; sceneRatio: number | null;
  originalCosts: string; confirmedRefunds: string; actual: string;
  ownExpenseNet: string; confirmedLoss: string; personalNetCost: string;
}
export interface Scene {
  id: string;
  version: string;
  input: Concert;
}
export interface CategoryReport {
  category: string;
  original: string;
  refunds: string;
  actual: string;
  share: number;
}
export interface BudgetReport {
  category: string;
  budget: string;
  actual: string;
  planned: string;
  remaining: string;
  overspent: string;
}
export interface ConcertReport {
  pendingPayables?: string;
  payables?: { id: string; counterparty: string; principal: string; settled: string; outstanding: string; version: string }[];
  insuranceRecovery?: { received: string; returned: string; netRecovery: string; pendingReturn: string; rows: { id: string; ticketId: string; received: string; returned: string; netRecovery: string; pendingReturn: string }[] };
  finalPersonalCost?: string;
  closingReviewRequired?: boolean;
  unusedBurden?: string;
  ticketOutcomes?: { ticketId: string; verified: boolean; paid: string; refund: string; recovery: string; unusedBurden: string }[];
  ticketTransfers?: TransferSummary;
  personalAfterTransfers?: string;
  artistAttribution?: ArtistAttribution[] | null;
  currency: string;
  totalBudget: string;
  originalCosts: string;
  confirmedRefunds: string;
  actual: string;
  personalNetCost: string;
  planned: string;
  remaining: string;
  availableAfterPlans: string;
  overspent: string;
  budgetUsage: number | null;
  pendingAdvances: string;
  categories: CategoryReport[];
  budgets: BudgetReport[];
  companions: (Companion & {
    linked: boolean;
    settled: string;
    pending: string;
    merchantRefund: string;
    giftOrWriteOff: string;
  })[];
  costs: Cost[];
  warnings: string[];
}
export interface Detail extends Scene {
  report: ConcertReport;
}
export interface Annual {
  insuranceRecovery?: string;
  finalPersonalCost?: string;
  transferRecovery?: string;
  totalCostAfterTransfers?: string;
  year: number;
  currency: string;
  count: number;
  attended: number;
  totalCost: string;
  average: string;
  highest: { title: string } | null;
  artists: { key?: string; id?: string | null; name: string; count: number; cost: string }[];
  cities: { name: string; count: number; cost: string }[];
  months: { month: number; cost: string }[];
  categories: { category: string; cost: string; share: number }[];
  scenes: { id: string; title: string; report: ConcertReport }[];
  rule: string;
}
export interface TxChoice {
  id: string;
  type: string;
  amount: string;
  currency: string;
  occurredAt: string;
  merchant: string;
  note: string;
  originalTransactionId: string | null;
  businessId: string | null;
  entries: { id: string; amount: string; categoryId: string }[];
}
export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  orderId: string | null;
}
const data = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export const concertApi = {
  payables: (currency:string)=>apiClient.get<ApiResponse<{id:string;counterparty:string;principal:string;outstanding:string;version:string}[]>>('/concerts/payables',{params:{currency}}).then(data),
  createPayable: (input:{counterparty:string;currency:string;amount:string;categoryId:string;occurredAt:string;note:string;confirmed:boolean},key:string)=>apiClient.post<ApiResponse<{businessId:string;transactionId:string;version:string}>>('/concerts/payables',input,{headers:{'Idempotency-Key':key}}).then(data),
  refundPayable: (id:string,input:{amount:string;occurredAt:string;note:string;confirmed:boolean;accountId:string|null},version:string,key:string)=>apiClient.post(`/concerts/payables/${id}/refund`,input,{headers:{'If-Match':version,'Idempotency-Key':key}}),
  transferTransactions: (currency: string, kind: 'Income' | 'Expense', keyword: string) => apiClient.get<ApiResponse<{ id: string; type: string; amount: string; currency: string; note: string; merchant?: string | null }[]>>('/concerts/transfer-transactions', { params: { currency, kind, keyword } }).then(data),
  tourReport: (id: string) => apiClient.get<ApiResponse<TourReport>>(`/concerts/tours/${id}/report`).then(data),
  tours: () => apiClient.get<ApiResponse<Tour[]>>('/concerts/tours').then(data),
  saveTour: (input: TourInput, tour?: Tour) => apiClient.request({
    method: tour ? 'put' : 'post', url: `/concerts/tours${tour ? '/' + tour.id : ''}`, data: input,
    headers: { 'If-Match': tour?.version || '0', 'Idempotency-Key': crypto.randomUUID() },
  }),
  modules: () =>
    apiClient.get<ApiResponse<Modules>>('/settings/modules').then(data),
  setModules: (concerts: boolean, version: string) =>
    apiClient.put(
      '/settings/modules',
      { concerts },
      {
        headers: {
          'If-Match': version,
          'Idempotency-Key': crypto.randomUUID(),
        },
      },
    ),
  list: () => apiClient.get<ApiResponse<Scene[]>>('/concerts').then(data),
  detail: (id: string) =>
    apiClient.get<ApiResponse<Detail>>(`/concerts/${id}`).then(data),
  save: (input: Concert, scene?: Scene) =>
    apiClient.request({
      method: scene ? 'put' : 'post',
      url: `/concerts${scene ? '/' + scene.id : ''}`,
      data: input,
      headers: {
        'If-Match': scene?.version || '0',
        'Idempotency-Key': crypto.randomUUID(),
      },
    }),
  annual: (year: number, currency: string) =>
    apiClient
      .get<ApiResponse<Annual>>('/concerts/report', {
        params: { year, currency },
      })
      .then(data),
  transactions: (currency: string, keyword: string, refunds = false) =>
    apiClient
      .get<ApiResponse<TxChoice[]>>('/concerts/transactions', {
        params: { currency, keyword, refunds },
      })
      .then(data),
  advances: (currency: string, keyword: string) =>
    apiClient
      .get<
        ApiResponse<
          { id: string; name: string; currency: string; receivable: string }[]
        >
      >('/concerts/advances', { params: { currency, keyword } })
      .then(data),
  history: (id: string) =>
    apiClient
      .get<
        ApiResponse<
          { id: string; createdAt: string; action: string; changes: string }[]
        >
      >(`/concerts/${id}/history`)
      .then(data),
  attachments: (id: string) =>
    apiClient
      .get<ApiResponse<Attachment[]>>(`/concerts/${id}/attachments`)
      .then(data),
  upload: (id: string, version: string, file: File, orderId = '') => {
    const form = new FormData();
    form.append('file', file);
    form.append('orderId', orderId);
    return apiClient.post(`/concerts/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data', 'If-Match': version },
    });
  },
  download: (id: string, attachment: string) =>
    apiClient
      .get<Blob>(`/concerts/${id}/attachments/${attachment}`, {
        responseType: 'blob',
      })
      .then((r) => r.data),
};
