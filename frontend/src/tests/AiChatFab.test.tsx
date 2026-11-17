import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/ai', () => ({
  aiApi: { settings: vi.fn(), chat: vi.fn() },
}));

import { aiApi, type AiAnswer, type AiSettings } from '../api/ai';
import { AiChatFab } from '../features/ai/AiChatFab';
import { useUI } from '../stores/ui';

const ready: AiSettings = {
  provider: 'DeepSeek',
  enabled: true,
  configured: true,
  model: 'deepseek-chat',
  reasoningModel: 'deepseek-reasoner',
  privacy: {
    enabled: true,
    allowSummary: true,
    allowDetails: false,
    allowPayroll: false,
    allowFamily: false,
    allowRecognitionText: false,
  },
  transmission: '只发送已授权范围',
  legacyModels: '',
  dailyCallLimit: 100,
  capabilities: {},
  documentation: 'https://api-docs.deepseek.com',
};

const answer = (conversationId: string, text: string): AiAnswer => ({
  conversationId,
  answer: text,
  sources: [],
  model: 'fixture',
  financialDataVerified: false,
});

function mount() {
  return render(
    <MemoryRouter>
      <AiChatFab />
    </MemoryRouter>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: '打开 AI 记账助理' }));
}

beforeEach(() => {
  useUI.getState().setLanguage('zh-CN');
});

afterEach(() => {
  vi.mocked(aiApi.settings).mockReset();
  vi.mocked(aiApi.chat).mockReset();
});

describe('AiChatFab', () => {
  it('未启用时显示引导卡片与 /settings/ai 入口，且不发送请求', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue({ ...ready, enabled: false });
    mount();
    openPanel();
    await screen.findByText('服务端 AI 未启用或未配置模型密钥');
    expect(
      screen.getByText('请在设置中启用 AI 并配置模型密钥后使用'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去 AI 设置' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.getByLabelText('AI 记账助理输入')).toBeDisabled();
    expect(aiApi.settings).toHaveBeenCalledTimes(1);
    expect(aiApi.chat).not.toHaveBeenCalled();
  });

  it('设置读取失败时显示错误并可重试', async () => {
    vi.mocked(aiApi.settings)
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce(ready);
    mount();
    openPanel();
    await screen.findByText('网络异常');
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    await waitFor(() => expect(aiApi.settings).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('AI 记账助理输入')).toBeEnabled();
    expect(aiApi.chat).not.toHaveBeenCalled();
  });

  it('已启用时回车发送并把流式增量逐段渲染到界面', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue(ready);
    let push: ((text: string) => void) | undefined;
    let finish: ((value: AiAnswer) => void) | undefined;
    vi.mocked(aiApi.chat).mockImplementation((_message, _id, _signal, onDelta) => {
      push = onDelta;
      return new Promise<AiAnswer>((resolve) => {
        finish = resolve;
      });
    });
    mount();
    openPanel();
    const input = await screen.findByLabelText('AI 记账助理输入');
    fireEvent.change(input, { target: { value: '本月支出' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('本月支出');
    expect(aiApi.chat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiApi.chat).mock.calls[0][0]).toBe('本月支出');
    act(() => push?.('本月'));
    expect(screen.getByText('本月')).toBeInTheDocument();
    act(() => push?.('支出 3000 元'));
    expect(screen.getByText('本月支出 3000 元')).toBeInTheDocument();
    await act(async () => {
      finish?.(answer('conv-1', '本月支出 3000 元'));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /发\s*送/ })).toBeInTheDocument(),
    );
  });

  it('发送中点击停止会 abort 请求且界面回到可发送状态', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue(ready);
    let signal: AbortSignal | undefined;
    vi.mocked(aiApi.chat).mockImplementation((_message, _id, chatSignal) => {
      signal = chatSignal;
      return new Promise<AiAnswer>((_resolve, reject) => {
        chatSignal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    });
    mount();
    openPanel();
    const input = await screen.findByLabelText('AI 记账助理输入');
    fireEvent.change(input, { target: { value: '查一下本月支出' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const stop = await screen.findByRole('button', { name: /停\s*止/ });
    await act(async () => {
      fireEvent.click(stop);
    });
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: /发\s*送/ })).toBeInTheDocument();
    expect(screen.getByText('已停止')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('第二轮请求带上第一轮返回的 conversationId', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue(ready);
    vi.mocked(aiApi.chat)
      .mockResolvedValueOnce(answer('conv-1', '第一轮回答'))
      .mockResolvedValueOnce(answer('conv-2', '第二轮回答'));
    mount();
    openPanel();
    const input = await screen.findByLabelText('AI 记账助理输入');
    fireEvent.change(input, { target: { value: '第一问' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('第一轮回答');
    fireEvent.change(input, { target: { value: '第二问' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('第二轮回答');
    const calls = vi.mocked(aiApi.chat).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toBeUndefined();
    expect(calls[1][1]).toBe('conv-1');
  });

  it('按 Esc 关闭面板、中止进行中的请求，并在重新打开时保留消息', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue(ready);
    let signal: AbortSignal | undefined;
    vi.mocked(aiApi.chat).mockImplementation((_message, _id, chatSignal) => {
      signal = chatSignal;
      return new Promise<AiAnswer>(() => {});
    });
    mount();
    openPanel();
    const input = await screen.findByLabelText('AI 记账助理输入');
    fireEvent.change(input, { target: { value: '解释一下这笔支出' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('button', { name: /停\s*止/ });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(signal?.aborted).toBe(true);
    openPanel();
    expect(await screen.findByText('解释一下这笔支出')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
