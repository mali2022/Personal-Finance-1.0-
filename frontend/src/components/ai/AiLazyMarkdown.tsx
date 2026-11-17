import { lazy, Suspense } from 'react';
import { Skeleton } from 'antd';
const Markdown = lazy(() => import('./AiMarkdown').then(module => ({ default: module.AiMarkdown })));
// Ordinary business pages do not download the Markdown/math stack until an AI
// explanation actually exists. The same renderer is used after the lazy load.
export function AiLazyMarkdown({ text }: { text: string }) {
  return <Suspense fallback={<Skeleton active paragraph={{ rows: 2 }} />}><Markdown text={text} /></Suspense>;
}
