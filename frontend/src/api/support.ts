import { apiClient } from './client';
import type { ApiResponse } from '../types';
export interface Ticket {
  id: string;
  userId: string;
  subject: string;
  content: string;
  kind: string;
  status: string;
  reply: string;
  createdAt: string;
  updatedAt: string;
  version: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  activeSessions: number;
}
export interface AdminAudit {
  id: string;
  userId: string;
  action: string;
  resourceId: string;
  createdAt: string;
}
const get = <T>(url: string, params?: object) =>
  apiClient.get<ApiResponse<T>>(url, { params }).then((r) => r.data.data);
export const supportApi = {
  tickets: (page: number) =>
    get<Page<Ticket>>('/support/tickets', { page, pageSize: 10 }),
  submit: (body: { subject: string; content: string; kind: string }) =>
    apiClient.post('/support/tickets', body),
  overview: () =>
    get<{
      users: number;
      activeSessions: number;
      openTickets: number;
      resolvedTickets: number;
    }>('/admin/overview'),
  users: (page: number, keyword: string) =>
    get<Page<ManagedUser>>('/admin/users', { page, keyword, pageSize: 10 }),
  revoke: (id: string) =>
    apiClient.post(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`),
  adminTickets: (page: number, status: string, keyword: string) =>
    get<Page<Ticket>>('/admin/tickets', {
      page,
      status,
      keyword,
      pageSize: 10,
    }),
  reply: (ticket: Ticket, body: { status: string; reply: string }) =>
    apiClient.put(`/admin/tickets/${encodeURIComponent(ticket.id)}`, body, {
      headers: { 'If-Match': ticket.version },
    }),
  audit: (page: number) =>
    get<Page<AdminAudit>>('/admin/audit', { page, pageSize: 10 }),
};
