/** A single slash-command definition shown in the chat composer menu. */
export interface SlashCmd {
  cmd: string;
  hint: string;
  example?: string;
}

export const SLASH_COMMANDS: SlashCmd[] = [
  { cmd: '/clear', hint: 'Clear all messages in this chat', example: '/clear' },
  { cmd: '/new', hint: 'Start a new chat session', example: '/new' },
  {
    cmd: '/system',
    hint: 'Set system prompt for this chat',
    example: '/system You are a Rust expert.',
  },
  {
    cmd: '/model',
    hint: 'Override routing for the next turn (auto|light|heavy|<node>)',
    example: '/model heavy',
  },
  {
    cmd: '/temp',
    hint: 'Set temperature for this chat (0–2)',
    example: '/temp 0.3',
  },
  {
    cmd: '/persona',
    hint: 'Switch persona by id',
    example: '/persona engineer',
  },
  {
    cmd: '/title',
    hint: 'Rename this chat',
    example: '/title Rust ownership notes',
  },
  {
    cmd: '/build',
    hint: 'Send the last assistant reply to the Apps wizard as an idea',
    example: '/build',
  },
  {
    cmd: '/save',
    hint: 'Save the last assistant reply as a snippet',
    example: '/save Useful regex',
  },
  {
    cmd: '/web',
    hint: 'Fetch a URL and use it as context for the next message',
    example: '/web https://example.com',
  },
  {
    cmd: '/rag',
    hint: 'Search indexed app source code and attach top results',
    example: '/rag docker healthcheck',
  },
  {
    cmd: '/tools',
    hint: 'Enable tool-calling for the next reply (assistant may call listApps, appLogs, ragSearch, ...)',
    example: '/tools on',
  },
  {
    cmd: '/compare',
    hint: 'Send the next message to two or more routes and show replies side-by-side',
    example: '/compare light,heavy',
  },
  {
    cmd: '/schedule',
    hint: 'Create a recurring prompt (cron or @every)',
    example: '/schedule @every 1h What is new?',
  },
  {
    cmd: '/export',
    hint: 'Download this chat as Markdown',
    example: '/export',
  },
  { cmd: '/help', hint: 'Show all slash commands', example: '/help' },
];
