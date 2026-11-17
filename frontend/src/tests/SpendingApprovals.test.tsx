import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpendingApprovalsPage from '../pages/SpendingApprovalsPage';
import { apiClient } from '../api/client';
vi.mock('../api/client', () => ({ apiClient: { get: vi.fn(async (path: string) => ({ data: { data: path === '/categories' || path === '/accounts' ? [] : path.includes('evaluations') ? [] : path.includes('/settings') ? { version: '0', settings: { style: 'Balanced', currency: 'CNY', emergencyReserve: null, preferences: '' } } : path.includes('transaction-candidates') ? { items: [] } : path === '/spending-approvals' ? { total: 1, items: [{ id: 'approval-1', version: '1', content: { application: { name: '真实申请', amount: 5000, currency: 'CNY', reason: '旧手机仍可用' }, state: 'SUBMITTED', history: [] } }] } : { purchaseVerified: false, linkedTransactionMissing: false } } })), post: vi.fn(), put: vi.fn() } }));

it('shows persisted applications and independent purchase decision', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SpendingApprovalsPage /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('真实申请'));
  expect(await screen.findByText('旧手机仍可用')).toBeInTheDocument();
  expect(screen.getByText('决定购买')).toBeInTheDocument();
  expect(screen.queryByText('保存复盘')).not.toBeInTheDocument();
});

it('opens settings without inventing an emergency reserve', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SpendingApprovalsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByText('审批官设置'));
  expect(await screen.findByText('需要保留的应急现金（未知请留空）')).toBeInTheDocument();
  expect(screen.getByText('保存审批设置')).toBeInTheDocument();
});

it('opens extraction confirmation and displays provider errors inline', async () => {
  vi.mocked(apiClient.post).mockRejectedValueOnce({ message: '请先开启 AI 授权' });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SpendingApprovalsPage /></QueryClientProvider>);
  fireEvent.change(screen.getByPlaceholderText('我想买一个5000元的手机，旧手机还能用……'), { target: { value: '我想买5000元的手机' } });
  fireEvent.click(screen.getByRole('button', { name: 'AI 提取申请' }));
  expect(await screen.findByRole('dialog', { name: '将这段需求发送给当前 AI 模型？' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(await screen.findByText('请先开启 AI 授权')).toBeInTheDocument();
  expect(apiClient.post).toHaveBeenCalledWith('/spending-approvals/parse', expect.objectContaining({ confirmTransmission: true }), expect.anything());
});
