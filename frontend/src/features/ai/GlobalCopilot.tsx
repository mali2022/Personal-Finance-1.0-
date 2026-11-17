import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Drawer, Skeleton } from 'antd';
import { useLocation } from 'react-router-dom';
import { t, useLocale } from '../../i18n';
import {
  CopilotContext,
  defaultCopilotQuestion,
  routeCopilotContext,
  sanitizeCopilotFields,
  type CopilotFields,
  type CopilotPageContext,
} from './copilotContext';
import './copilot.css';
const Copilot = lazy(() => import('../../pages/AiPage'));
export function GlobalCopilot({ children }: { children: ReactNode }) {
  useLocale();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const sequence = useRef(0);
  const [registered, setRegistered] = useState<{
    owner: symbol;
    path: string;
    fields: CopilotFields;
  }>();
  const [draft, setDraft] = useState<{
    id: number;
    routeKey: string;
    question: string;
    context: CopilotPageContext;
    conversationId?: string;
  }>();
  const register = useCallback((owner: symbol, fields: CopilotFields) => {
    setRegistered({
      owner,
      path: locationRef.current.pathname,
      fields: sanitizeCopilotFields(fields),
    });
    return () =>
      setRegistered((current) =>
        current?.owner === owner ? undefined : current,
      );
  }, []);
  const open = useCallback(
    (question?: string, conversationId?: string) => {
      const current = routeCopilotContext(location.pathname, location.search);
      if (registered?.path === location.pathname)
        current.fields = {
          ...registered.fields,
          transactionId:
            registered.fields.transactionId ?? current.fields.transactionId,
        };
      setDraft({
        id: ++sequence.current,
        routeKey: location.key,
        question: question ?? defaultCopilotQuestion(current.path),
        context: current,
        conversationId,
      });
    },
    [location, registered],
  );
  useEffect(() => setDraft(undefined), [location.key]);
  useEffect(() => {
    const close = () => setDraft(undefined);
    window.addEventListener('finance:unauthorized', close);
    return () => window.removeEventListener('finance:unauthorized', close);
  }, []);
  const value = useMemo(() => ({ open, register }), [open, register]);
  const active = draft?.routeKey === location.key;
  return (
    <CopilotContext.Provider value={value}>
      {children}
      <Drawer
        rootClassName="global-copilot-drawer"
        title={t('AI 财务 Copilot')}
        placement="right"
        width="min(960px, 100vw)"
        open={!!draft && active}
        onClose={() => setDraft(undefined)}
        destroyOnHidden
      >
        {draft && active && (
          <Suspense fallback={<Skeleton active />}>
            <Copilot
              key={draft.id}
              initialQuestion={draft.question}
              initialConversationId={draft.conversationId}
              pageContext={draft.context}
              compact
            />
          </Suspense>
        )}
      </Drawer>
    </CopilotContext.Provider>
  );
}
