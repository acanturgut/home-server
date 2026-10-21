/** One NDJSON event from POST /api/chat/stream (server `ai.StreamEvent`). */
export interface StreamEvent {
  step: string;
  message?: string;
  content?: string;
  model?: string;
  node?: string;
  latency?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Yields each JSON line of a streamed body; blank and malformed lines are skipped. */
export async function* readNdjson<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: T;
      try {
        parsed = JSON.parse(line) as T;
      } catch {
        continue;
      }
      yield parsed;
    }
    if (done) return;
  }
}

const STEP_LABELS: Record<string, (ev: StreamEvent) => string> = {
  classifying: () => 'Routing…',
  classified: (ev) => `Using ${ev.node || 'model'}…`,
  generating: (ev) => `Generating on ${ev.node || 'model'}…`,
  searching: (ev) => ev.message || 'Searching…',
};

/** "Thinking…" line for an intermediate step, or undefined for done / error. */
export const stepLabel = (ev: StreamEvent): string | undefined =>
  STEP_LABELS[ev.step]?.(ev);
