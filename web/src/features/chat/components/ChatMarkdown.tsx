import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders assistant chat content as markdown (GFM: tables, task lists,
 * fenced code, autolinks). Tailwind classes give it the same compact look
 * as the surrounding bubble. Keeps `<pre>`/`<code>` legible in dark mode
 * and clamps wide blocks so they don't blow out the bubble width.
 */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-md text-sm leading-relaxed wrap-break-word">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          h1: ({ children }) => (
            <h1 className="mt-3 mb-1.5 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 text-sm font-semibold">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-border/50 pl-3 text-foreground/80">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className || '');
            if (isBlock) {
              return (
                <code
                  className={`${className || ''} font-mono text-[12px]`}
                  {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted/60 px-1 py-[1px] font-mono text-[12px]"
                {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-auto rounded-md border border-border/30 bg-muted/40 p-2.5 text-[12px] leading-snug">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/30 bg-muted/40 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border/30 px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-2 border-border/30" />,
        }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
