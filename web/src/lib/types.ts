export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  request_id?: string;
  route?: string;
  model?: string;
  node?: string;
  tier?: string;
  latency?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
