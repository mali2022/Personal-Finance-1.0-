import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './ai-analysis.css';

export function AiMarkdown({ text }: { text: string }) {
  return <div className="ai-markdown"><Markdown
    skipHtml
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: 'error', maxExpand: 200, maxSize: 20, throwOnError: false }]]}
    urlTransform={(url) => {
      const safe = defaultUrlTransform(url);
      return /^(https?:\/\/|\/(?!\/)|#)/i.test(safe) ? safe : '';
    }}
    components={{
      a: ({ href, children }) => href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span>{alt}</span>,
      table: ({ children }) => <div className="ai-table-scroll" tabIndex={0}><table>{children}</table></div>,
    }}
  >{text.slice(0, 200000)}</Markdown></div>;
}
