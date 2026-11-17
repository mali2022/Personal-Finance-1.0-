import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Button } from 'antd';
import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { aiApi, type AiSettings } from '../../api/ai';
import { t as tr, useLocale } from '../../i18n';
import '../../design/ai-chat-fab.css';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  stopped?: boolean;
  failed?: boolean;
}

export function AiChatFab() {
  useLocale();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings>();
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sequence = useRef(0);

  // Gate on both switches: a disabled service or a missing model key blocks chat.
  const ready = settings?.enabled === true && settings.configured === true;
  const gated = !!settings && !ready;

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      setSettings(await aiApi.settings());
    } catch (e) {
      setSettings(undefined);
      setSettingsError((e as Error).message || tr('AI 设置读取失败'));
    } finally {
      setSettingsLoading(false);
    }
  }

  function openPanel() {
    setOpen(true);
    void loadSettings();
  }

  function abortActive() {
    const active = controller.current;
    if (!active) return false;
    controller.current = undefined;
    active.abort();
    setBusy(false);
    return true;
  }

  function closePanel() {
    abortActive();
    setOpen(false);
  }

  function stopAnswer() {
    if (abortActive())
      setMessages((current) =>
        current.map((item) =>
          item.streaming ? { ...item, streaming: false, stopped: true } : item,
        ),
      );
  }

  function newConversation() {
    abortActive();
    setMessages([]);
    setConversationId(undefined);
    setError('');
  }

  async function send() {
    const question = draft.trim();
    if (!question || busy || !ready) return;
    const userId = sequence.current + 1;
    const assistantId = sequence.current + 2;
    sequence.current = assistantId;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text: question },
      { id: assistantId, role: 'assistant', text: '', streaming: true },
    ]);
    setDraft('');
    setError('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await aiApi.chat(
        question,
        conversationId,
        abort.signal,
        (delta) => {
          if (abort.signal.aborted) return;
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? { ...item, text: item.text + delta }
                : item,
            ),
          );
        },
      );
      if (abort.signal.aborted) return;
      setConversationId(result.conversationId);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, text: result.answer || item.text, streaming: false }
            : item,
        ),
      );
    } catch (e) {
      if (abort.signal.aborted) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, streaming: false, stopped: true }
              : item,
          ),
        );
      } else {
        const message = (e as Error).message || tr('AI 回答失败');
        setError(message);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, text: item.text || message, streaming: false, failed: true }
              : item,
          ),
        );
      }
    } finally {
      if (controller.current === abort) {
        controller.current = undefined;
        setBusy(false);
      }
    }
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open && ready) inputRef.current?.focus();
  }, [open, ready]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  return (
    <>
      <button
        type="button"
        className={`ai-chat-fab${open ? ' is-open' : ''}`}
        aria-label={tr('打开 AI 记账助理')}
        aria-expanded={open}
        aria-controls="ai-chat-fab-panel"
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <img src="/ai-mascot.png" alt="" className="ai-chat-fab-avatar" />
      </button>
      {open && (
        <section
          id="ai-chat-fab-panel"
          className="ai-chat-fab-panel"
          role="dialog"
          aria-modal="true"
          aria-label={tr('AI 记账助理')}
        >
          <header className="ai-chat-fab-head">
            <img src="/ai-mascot.png" alt="" className="ai-chat-fab-head-avatar" />
            <div className="ai-chat-fab-heading">
              <strong>{tr('AI 记账助理')}</strong>
              <span className="ai-chat-fab-status">
                <span
                  className={`ai-chat-fab-dot${ready ? ' is-ready' : ''}`}
                  aria-hidden="true"
                />
                {ready ? tr('AI 服务可用') : tr('AI 服务未就绪')}
              </span>
            </div>
            <Button
              type="text"
              size="small"
              aria-label={tr('新对话')}
              disabled={busy}
              onClick={newConversation}
            >
              {tr('新对话')}
            </Button>
            <Button
              type="text"
              size="small"
              aria-label={tr('关闭 AI 记账助理')}
              icon={<CloseOutlined />}
              onClick={closePanel}
            />
          </header>
          <div
            className="ai-chat-fab-messages"
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label={tr('消息记录')}
          >
            {settingsLoading && (
              <p className="ai-chat-fab-hint">{tr('正在读取 AI 设置')}</p>
            )}
            {settingsError && (
              <div className="ai-chat-fab-gate" role="alert">
                <p className="ai-chat-fab-gate-title">{settingsError}</p>
                <div className="ai-chat-fab-gate-actions">
                  <Button type="primary" onClick={() => void loadSettings()}>
                    {tr('重试')}
                  </Button>
                </div>
              </div>
            )}
            {gated && (
              <div className="ai-chat-fab-gate">
                <p className="ai-chat-fab-gate-title">
                  {tr('服务端 AI 未启用或未配置模型密钥')}
                </p>
                <p className="ai-chat-fab-gate-body">
                  {tr('请在设置中启用 AI 并配置模型密钥后使用')}
                </p>
                <div className="ai-chat-fab-gate-actions">
                  <Link
                    className="ai-chat-fab-gate-link"
                    to="/settings/ai"
                    onClick={closePanel}
                  >
                    {tr('去 AI 设置')}
                  </Link>
                  <Button onClick={() => void loadSettings()}>
                    {tr('重试')}
                  </Button>
                </div>
              </div>
            )}
            {ready && messages.length === 0 && (
              <div className="ai-chat-fab-empty">
                <strong>{tr('想问点什么？')}</strong>
                <p>{tr('例如：这个月餐饮花了多少、哪类支出比上月多、帮我看看最近的异常消费。')}</p>
                <p>{tr('回答只用于解释账本数据，不会自动修改任何记录。')}</p>
              </div>
            )}
            {messages.map((item) => (
              <div
                key={item.id}
                className={`ai-chat-fab-message is-${item.role}${item.failed ? ' is-failed' : ''}`}
              >
                <p>{item.text}</p>
                {item.streaming && (
                  <span className="ai-chat-fab-typing" aria-hidden="true">
                    ●
                  </span>
                )}
                {item.stopped && (
                  <small className="ai-chat-fab-note">{tr('已停止')}</small>
                )}
              </div>
            ))}
          </div>
          {error && (
            <p className="ai-chat-fab-error" role="alert">
              {error}
            </p>
          )}
          <footer className="ai-chat-fab-composer">
            <textarea
              ref={inputRef}
              className="ai-chat-fab-input"
              rows={2}
              value={draft}
              aria-label={tr('AI 记账助理输入')}
              placeholder={tr('输入记账问题，Enter 发送，Shift+Enter 换行')}
              disabled={!ready}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onInputKeyDown}
            />
            {busy ? (
              <Button danger onClick={stopAnswer}>
                {tr('停止')}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={!ready || !draft.trim()}
                onClick={() => void send()}
              >
                {tr('发送')}
              </Button>
            )}
          </footer>
        </section>
      )}
    </>
  );
}
