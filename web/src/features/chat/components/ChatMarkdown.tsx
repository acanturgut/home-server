import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Assistant reply as GFM markdown (tables, task lists, fenced code,
 * autolinks), sized to sit inside a chat bubble. Wide blocks scroll
 * instead of stretching the bubble.
 */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="leading-relaxed wrap-break-word">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
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
            <h1 className="mt-3 mb-1.5 text-base font-medium">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1.5 font-medium">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 font-medium">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...rest }) => (
            <code
              className={
                /language-/.test(className || '')
                  ? `${className} font-mono text-xs`
                  : 'rounded-sm bg-muted px-1 py-px font-mono text-xs'
              }
              {...rest}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-auto rounded-md border bg-muted/40 p-2.5 text-xs leading-snug">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-auto">
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border bg-muted/40 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-2" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
