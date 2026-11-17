import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiPage from '../pages/AiPage';
import { aiApi, type AiSettings } from '../api/ai';
import { accountApi, categoryApi } from '../api/finance';
import { useUI } from '../stores/ui';

const settings: AiSettings = { provider: 'DeepSeek', enabled: true, configured: true, model: 'deepseek-chat', reasoningModel: 'deepseek-reasoner',
  privacy: { enabled: true, allowSummary: true, allowDetails: false, allowPayroll: false, allowFamily: false, allowRecognitionText: false },
  transmission: '只发送已授权范围', legacyModels: '待联调', dailyCallLimit: 100, capabilities: {}, documentation: 'https://api-docs.deepseek.com' };
function setup(s = settings, context?: import('../features/ai/copilotContext').CopilotPageContext) {
  vi.spyOn(aiApi, 'settings').mockResolvedValue(s); vi.spyOn(accountApi, 'list').mockResolvedValue([]); vi.spyOn(categoryApi, 'list').mockResolvedValue([]);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<App><QueryClientProvider client={cache}><MemoryRouter><AiPage pageContext={context}/></MemoryRouter></QueryClientProvider></App>);
}
afterEach(() => { useUI.getState().closeEntry(); useUI.getState().setLanguage('zh-CN'); useUI.setState({ hidden: false }); vi.restoreAllMocks(); });
describe('AI assistant boundaries', () => {
  it('单笔与批量草稿的隐私切换遮蔽金额、账户、商户和备注，表单仍保留原始值', async () => {
    const draft: import('../api/ai').AiDraft = {
      parsed: { intent: 'Expense', amount: '12345.67', currency: 'CNY', date: '2026-10-11', accountHint: '私人账户提示', categoryHint: '私人分类提示', merchant: '私人商户', note: '私人备注', amountAmbiguous: false, unconfirmedFields: [], confidence: .8 },
      accountId: null, categoryId: null, requiresSpecialWorkflow: false, warnings: ['账户待选择'], canOpenEntry: true, source: 'typed', recognitionConfidence: null,
    };
    vi.spyOn(aiApi, 'draft').mockResolvedValue(draft);
    vi.spyOn(aiApi, 'drafts').mockResolvedValue({ items: [{ ...draft, draftId: 'batch-id', parsed: { ...draft.parsed, amount: '98765.43' } }], total: 1 });
    setup({ ...settings, foundationVersion: 1 });
    await screen.findByText('AI 财务助手');
    fireEvent.click(screen.getByText('自然语言记账草稿'));
    await screen.findByText('¥98,765.43');
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '生成一笔草稿' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '生成草稿' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '生成草稿' }));
    await screen.findByText('¥12,345.67');
    expect(screen.getByText('私人备注')).toBeInTheDocument();
    act(() => useUI.getState().toggleHidden());
    for (const privateText of ['12,345.67', '98,765.43', '私人账户提示', '私人分类提示', '私人商户', '私人备注'])
      expect(document.body.textContent).not.toContain(privateText);
    fireEvent.click(screen.getByRole('button', { name: '核对并打开现有记账表单' }));
    expect(useUI.getState().aiDraft?.amount).toBe('12345.67');
    act(() => useUI.getState().toggleHidden());
    expect(screen.getByText('¥98,765.43')).toBeInTheDocument();
    expect(screen.getByText('¥12,345.67')).toBeInTheDocument();
    expect(screen.getByText('私人备注')).toBeInTheDocument();
  });
  it('sends the page context with the existing enforced account scope',async()=>{
    const id='12345678-1234-1234-1234-123456789abc';
    const chat=vi.spyOn(aiApi,'chat').mockResolvedValue({conversationId:'new',answer:'已返回',sources:[],model:'fixture',financialDataVerified:false});
    setup(settings,{page:'全部交易',path:'/transactions',fields:{accountIds:[id],currency:'USD',start:'2026-10-01',end:'2026-10-31'}});
    await screen.findByText('当前页面上下文');fireEvent.change(screen.getByLabelText('AI 问题或记账描述'),{target:{value:'解释这些交易'}});
    await waitFor(()=>expect(screen.getByRole('button',{name:'发送问题'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'发送问题'}));
    await waitFor(()=>expect(chat).toHaveBeenCalled());expect(chat.mock.calls[0][0]).toContain('2026-10-01');expect(chat.mock.calls[0][0]).toContain('USD');expect(chat.mock.calls[0][4]).toEqual([id]);
  });
  it('shows safe tool progress and stops an unfinished stream without keeping an answer', async () => {
    vi.spyOn(aiApi,'chat').mockImplementation(async (_q,_id,signal,onDelta,_accounts,onProgress)=>{
      onProgress?.({stage:'Running',tool:'GetIncomeExpenseSummary',callId:'query'});onDelta('partial answer');
      return await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    });
    setup(); await screen.findByText('AI 财务助手');
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'),{target:{value:'本月支出'}});
    await waitFor(()=>expect(screen.getByRole('button',{name:'发送问题'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'发送问题'}));
    await screen.findByText(/正在执行查询/);fireEvent.click(screen.getByRole('button',{name:/停\s*止/}));
    await screen.findByText('已停止。未完成的回复不作为财务结论。');
    expect(screen.queryByText('partial answer')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/重\s*试/})).toBeEnabled();
  });
  it('requires an explicit selection before a scoped query and keeps the scope visible', async () => {
    const chat = vi.spyOn(aiApi, 'chat'); setup(); await screen.findByText('AI 财务助手');
    fireEvent.click(screen.getByText('仅选定账户'));
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '支出' } });
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled(); expect(chat).not.toHaveBeenCalled();
  });
  it('renders AI controls in English using the existing locale preference', async () => {
    useUI.getState().setLanguage('en'); setup();
    expect(await screen.findByText('AI finance assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeInTheDocument();
    expect(screen.getByLabelText('AI question or entry description')).toBeInTheDocument();
  });
  it('loads saved history with its account scope and refuses posting in an archived conversation', async () => {
    const id = 'history-1'; const chat = vi.spyOn(aiApi, 'chat');
    vi.spyOn(aiApi, 'conversations').mockResolvedValue({ items: [{ id, title: '历史问题', archived: true, version: '1' }], total: 1 });
    vi.spyOn(aiApi, 'conversation').mockResolvedValue({ conversation: { id, title: '历史问题', archived: true, version: '1', accountIds: ['a'] },
      items: [{ id: 'msg', question: '旧提问', feedback: 0, result: { conversationId: id, answer: '旧答案', sources: [], financialDataVerified: false, model: 'mock' } }], total: 1, page: 1, pageSize: 20 });
    setup({ ...settings, privacy: { ...settings.privacy, saveHistory: true } });
    fireEvent.click(await screen.findByRole('button', { name: '历史问题' }, { timeout: 10000 }));
    expect(await screen.findByText('旧答案')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '继续' } });
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled(); expect(chat).not.toHaveBeenCalled();
  });
  it('shows unavailable state and disables model requests without a key', async () => {
    const chat = vi.spyOn(aiApi, 'chat'); setup({ ...settings, configured: false });
    expect(await screen.findByText('尚未配置 DeepSeek 密钥，真实模型功能不可用')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '本月支出' } });
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled(); expect(chat).not.toHaveBeenCalled();
  });
  it('displays authoritative sources and does not render model HTML', async () => {
    vi.spyOn(aiApi, 'chat').mockResolvedValue({ conversationId: 'c1', answer: '<script>danger()</script>支出38元', model: 'mock', financialDataVerified: true,
      sources: [{ tool: 'GetIncomeExpenseSummary', start: '2026-09-01', end: '2026-09-30', currency: 'CNY', scope: '原币统计', source: 'FinanceService', detailLink: '/reports', queriedAt: '2026-10-12T00:00:00Z', data: { expense: '38.00' }, truncated: false }] });
    const view = setup(); await screen.findByText('AI 财务助手');
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '本月支出' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '发送问题' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));
    await screen.findByText('分析依据');
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.textContent).not.toContain('danger()');
    fireEvent.click(screen.getByText('分析依据'));
    expect(await screen.findByText(/GetIncomeExpenseSummary/)).toBeInTheDocument();
  });
  it('keeps model analysis visible without rejection notices when sources exist', async () => {
    vi.spyOn(aiApi, 'chat').mockResolvedValue({ conversationId: 'c1', answer: '建议每周检查1次非必要消费，先试行2周。', model: 'mock', financialDataVerified: false,
      sources: [{ tool: 'GetIncomeExpenseSummary', start: '2026-10-01', end: '2026-10-31', currency: 'CNY', scope: '原币统计', source: 'FinanceService', detailLink: '/reports', queriedAt: '2026-10-16T00:00:00Z', data: { income: '0.00', expense: '38.00' }, truncated: false }] });
    setup(); await screen.findByText('AI 财务助手');
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '本月收支情况' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '发送问题' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));
    expect(await screen.findByText('建议每周检查1次非必要消费，先试行2周。')).toBeInTheDocument();
    expect(screen.queryByText('模型解释未通过核对，请查看查询结果')).not.toBeInTheDocument();
    expect(screen.queryByText('没有本次账本查询依据')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('分析依据'));
    expect(await screen.findByText(/GetIncomeExpenseSummary/)).toBeInTheDocument();
  });
  it('opens the original drawer with a draft and does not submit a transaction', async () => {
    vi.spyOn(aiApi, 'draft').mockResolvedValue({ parsed: { intent: 'Expense', amount: '38', currency: 'CNY', date: '2026-10-11', accountHint: null, categoryHint: null, merchant: null, amountAmbiguous: false, unconfirmedFields: [], confidence: .8 },
      accountId: null, categoryId: null, requiresSpecialWorkflow: false, warnings: ['账户待选择'], canOpenEntry: true, source: 'typed', recognitionConfidence: null });
    setup(); await screen.findByText('AI 财务助手'); fireEvent.click(screen.getByText('自然语言记账草稿'));
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '昨天晚餐38元' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '生成草稿' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: '生成草稿' }));
    fireEvent.click(await screen.findByRole('button', { name: '核对并打开现有记账表单' }));
    expect(useUI.getState().entryType).toBe('Expense'); expect(useUI.getState().aiDraft?.amount).toBe('38');
    expect(useUI.getState().aiDraft?.accountId).toBeUndefined(); expect(localStorage.getItem('finance-ui')).not.toContain('occurredAt');
  });
  it('blocks recognition text without distinct consent and proofreading', async () => {
    const draft = vi.spyOn(aiApi, 'draft'); setup(); await screen.findByText('AI 财务助手');
    fireEvent.click(screen.getByText('自然语言记账草稿')); fireEvent.click(screen.getByText('已识别票据文字'));
    fireEvent.change(screen.getByLabelText('AI 问题或记账描述'), { target: { value: '识别金额38' } });
    expect(screen.getByRole('button', { name: '生成草稿' })).toBeDisabled(); expect(draft).not.toHaveBeenCalled();
  });
});
