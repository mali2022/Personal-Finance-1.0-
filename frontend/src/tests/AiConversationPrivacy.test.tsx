import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiPage from '../pages/AiPage';
import { AiDraftPanel } from '../components/AiDraftPanel';
import { aiApi, type AiDraft, type AiSettings } from '../api/ai';
import { accountApi, categoryApi } from '../api/finance';
import { useUI } from '../stores/ui';

afterEach(() => {
  useUI.setState({ hidden: false });
  vi.restoreAllMocks();
});
function providers(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <App>
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}

describe('AI 历史及批量警告展示隐私', () => {
  it('隐藏历史问题卡片和会话名称，保留明确编辑中的输入值', async () => {
    const title = '私人银行与商户 98765.43';
    const question = '私人问题：商户支出 45678.91';
    const settings: AiSettings = {
      provider: 'DeepSeek',
      enabled: true,
      configured: true,
      model: 'fixture',
      reasoningModel: 'fixture',
      privacy: {
        enabled: true,
        allowSummary: true,
        allowDetails: false,
        allowPayroll: false,
        allowFamily: false,
        allowRecognitionText: false,
        saveHistory: true,
      },
      transmission: '',
      legacyModels: '',
      dailyCallLimit: 100,
      capabilities: {},
      documentation: '',
    };
    vi.spyOn(aiApi, 'settings').mockResolvedValue(settings);
    vi.spyOn(accountApi, 'list').mockResolvedValue([]);
    vi.spyOn(categoryApi, 'list').mockResolvedValue([]);
    vi.spyOn(aiApi, 'conversations').mockResolvedValue({
      items: [{ id: 'private-history', title, archived: false, version: '1' }],
      total: 1,
    });
    vi.spyOn(aiApi, 'conversation').mockResolvedValue({
      conversation: {
        id: 'private-history',
        title,
        archived: false,
        version: '1',
        accountIds: null,
      },
      items: [
        {
          id: 'private-message',
          question,
          feedback: 0,
          result: {
            conversationId: 'private-history',
            answer: '历史回答',
            model: 'fixture',
            financialDataVerified: false,
            sources: [],
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    providers(<AiPage />);
    fireEvent.click(await screen.findByRole('button', { name: title }));
    expect(await screen.findByText(question)).toBeInTheDocument();
    expect(screen.getByLabelText('会话名称')).toHaveValue(title);
    act(() => useUI.getState().toggleHidden());
    expect(screen.queryByText(question)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: title }),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(title);
    expect(document.body.textContent).not.toContain('历史回答');
    expect(screen.getByLabelText('会话名称')).toHaveValue(title);
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), {
      target: { value: '正在编辑账户 12345.00' },
    });
    expect(screen.getByLabelText('AI 问题或记账描述')).toHaveValue(
      '正在编辑账户 12345.00',
    );
    act(() => useUI.getState().toggleHidden());
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: title })).toBeInTheDocument();
  }, 15000);

  it('隐藏每条草稿警告与批量生成错误中的敏感文本，保留编辑描述', async () => {
    const draftWarning = '草稿警告：私人账户支付 98765.43';
    const batchWarning = '批量警告：私人商户 65432.10';
    const draft: AiDraft = {
      parsed: {
        intent: 'Expense',
        amount: '8.00',
        currency: 'CNY',
        date: '2026-10-15',
        accountHint: null,
        categoryHint: null,
        merchant: null,
        amountAmbiguous: false,
        unconfirmedFields: [],
        confidence: 0.8,
      },
      accountId: null,
      categoryId: null,
      requiresSpecialWorkflow: false,
      warnings: [draftWarning],
      canOpenEntry: false,
      source: 'typed',
      recognitionConfidence: null,
      draftId: 'private-draft',
    };
    vi.spyOn(aiApi, 'drafts').mockResolvedValue({ items: [draft], total: 1 });
    vi.spyOn(aiApi, 'draftBatch').mockResolvedValue({
      items: [{ index: 0, error: batchWarning, draft: null }],
      unprocessed: 0,
    });
    providers(
      <AiDraftPanel
        enabled
        modelReady
        disabled={false}
        accountNames={{}}
        categoryNames={{}}
      />,
    );
    expect(await screen.findByText(draftWarning)).toBeInTheDocument();
    const editor = screen.getByLabelText('批量记账描述');
    fireEvent.change(editor, { target: { value: '正在编辑银行 12345.00' } });
    fireEvent.click(screen.getByRole('button', { name: '生成批量草稿' }));
    expect(await screen.findByText(`1: ${batchWarning}`)).toBeInTheDocument();
    act(() => useUI.getState().toggleHidden());
    expect(document.body.textContent).not.toContain(draftWarning);
    expect(document.body.textContent).not.toContain(batchWarning);
    expect(editor).toHaveValue('正在编辑银行 12345.00');
    act(() => useUI.getState().toggleHidden());
    expect(screen.getByText(draftWarning)).toBeInTheDocument();
    expect(screen.getByText(`1: ${batchWarning}`)).toBeInTheDocument();
  });
});
