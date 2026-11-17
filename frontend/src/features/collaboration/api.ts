import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
export interface CollaborationInput {
  bookId?: string | null;
  consumerId?: string;
  payerId?: string;
  rule: 'Equal' | 'Percent' | 'Amount';
  shares: { memberId: string; value: string }[];
}
export interface FinanceSpace {
  id: string;
  name: string;
  kind: 'Book' | 'Family';
  description: string;
  familyId?: string;
  sortOrder: number;
  archived: boolean;
  version: string;
  role: string;
}
export interface SpaceMember {
  id: string;
  name: string;
  role: string;
  profile: string;
  active: boolean;
  linkedUserId?: string;
  version: string;
}
export interface SharedTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: string;
  merchant?: string;
  note: string;
  bookId: string;
  consumerId?: string;
  payerId?: string;
  rule: string;
  shares: { memberId: string; amount: number }[];
  own: boolean;
}
export interface SpaceReport {
  space: FinanceSpace;
  members: SpaceMember[];
  ownMembers: SpaceMember[];
  transactions: SharedTransaction[];
  totals: { currency: string; income: string; expense: string }[];
  balances: {
    memberId: string;
    currency: string;
    paid: number;
    share: number;
    net: number;
  }[];
  budgets: {
    currency: string;
    month: string;
    amount: string;
    actual: string;
    version: string;
  }[];
  settlements: {
    id: string;
    fromMemberId: string;
    toMemberId: string;
    currency: string;
    amount: number;
    note: string;
    createdAt: string;
    revoked: boolean;
    version: string;
  }[];
  invitations?: {
    id: string;
    email: string;
    role: string;
    state: string;
    expiresAt: string;
    version: string;
  }[];
}
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export const collaborationApi = {
  list: () =>
    apiClient.get<ApiResponse<FinanceSpace[]>>('/spaces').then(unwrap),
  report: (id: string, month: string) =>
    apiClient
      .get<ApiResponse<SpaceReport>>(`/spaces/${id}`, { params: { month } })
      .then(unwrap),
  invitations: () =>
    apiClient
      .get<
        ApiResponse<
          { id: string; name: string; role: string; expiresAt: string }[]
        >
      >('/space-invitations')
      .then(unwrap),
  assignment: (id: string) =>
    apiClient
      .get<ApiResponse<CollaborationInput | null>>(
        `/transactions/${id}/collaboration`,
      )
      .then(unwrap),
  write: (
    path: string,
    body: unknown,
    method: 'post' | 'put' = 'post',
    version?: string,
  ) =>
    apiClient.request({
      url: path,
      data: body,
      method,
      headers: {
        ...(version ? { 'If-Match': version } : {}),
        ...(!path.includes('/analysis')
          ? { 'Idempotency-Key': crypto.randomUUID() }
          : {}),
      },
    }),
};
