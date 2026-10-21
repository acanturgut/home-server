import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible } from '@/components/ui/collapsible';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Endpoint } from '@/features/settings/endpoints';
import { useAction } from '@/hooks/useAction';
import { apiFetch } from '@/lib/api';

const METHOD_TONE = {
  GET: 'success',
  POST: 'info',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'destructive',
} as const satisfies Record<Endpoint['method'], string>;

const STREAMING = '/api/chat/stream';

/**
 * One route in the API explorer: a disclosure row that fills path / query
 * params and the JSON body, sends the request and shows the response
 * (streamed for /api/chat/stream).
 */
export function EndpointCard({ ep }: { ep: Endpoint }) {
  const [body, setBody] = useState(ep.body ?? '');
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...ep.pathParams.map((k) => [k, '']),
      ...(ep.queryParams ?? []).map((q) => [q.name, q.default ?? '']),
    ]),
  );
  const [result, setResult] = useState<{ status: number; text: string }>();

  let path = ep.path;
  for (const k of ep.pathParams) {
    path = path.replace(`{${k}}`, encodeURIComponent(params[k] ?? ''));
  }
  const qs = new URLSearchParams(
    (ep.queryParams ?? [])
      .filter((q) => params[q.name])
      .map((q) => [q.name, params[q.name]]),
  ).toString();
  if (qs) path += `?${qs}`;

  const send = useAction(async () => {
    setResult(undefined);
    const hasBody = ep.method !== 'GET' && ep.method !== 'DELETE';
    const res = await apiFetch(path, {
      method: ep.method,
      body: hasBody && body ? body : undefined,
    });
    if (ep.path === STREAMING && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setResult({ status: res.status, text });
      }
      return;
    }
    const text = await res.text();
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* not JSON */
    }
    setResult({ status: res.status, text: pretty });
  });

  const setParam = (k: string, v: string) =>
    setParams((p) => ({ ...p, [k]: v }));

  return (
    <Collapsible
      className="px-3 py-1"
      trigger={
        <span className="flex min-w-0 items-center gap-3">
          <Badge
            mono
            tone={METHOD_TONE[ep.method]}
            className="w-14 justify-center"
          >
            {ep.method}
          </Badge>
          <code className="min-w-0 flex-1 truncate font-mono">{ep.path}</code>
          <span className="hidden max-w-64 truncate text-xs text-muted-foreground sm:block">
            {ep.summary}
          </span>
        </span>
      }
    >
      <div className="space-y-3 pb-3">
        <p className="text-muted-foreground sm:hidden">{ep.summary}</p>
        {(ep.pathParams.length > 0 || !!ep.queryParams?.length) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ep.pathParams.map((k) => (
              <Field key={k} label={`{${k}}`}>
                <Input
                  value={params[k]}
                  onChange={(e) => setParam(k, e.target.value)}
                  placeholder={k}
                  className="font-mono"
                />
              </Field>
            ))}
            {ep.queryParams?.map((q) => (
              <Field key={q.name} label={`?${q.name}`}>
                <Input
                  value={params[q.name]}
                  onChange={(e) => setParam(q.name, e.target.value)}
                  placeholder={q.default ?? q.name}
                  className="font-mono"
                />
              </Field>
            ))}
          </div>
        )}
        {ep.body !== undefined && (
          <Field label="Body">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              className="min-h-24 resize-y font-mono"
            />
          </Field>
        )}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            loading={send.busy}
            onClick={send.run}
          >
            Send
          </Button>
          <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {ep.method} {path}
          </code>
        </div>
        {send.error && <Alert>{send.error}</Alert>}
        {result && (
          <div className="space-y-1.5">
            <Badge
              mono
              tone={
                result.status >= 200 && result.status < 300
                  ? 'success'
                  : 'destructive'
              }
            >
              {result.status}
            </Badge>
            <CodeBlock text={result.text} className="max-h-80" />
          </div>
        )}
      </div>
    </Collapsible>
  );
}
