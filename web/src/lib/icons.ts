/** Default emoji icons keyed by name fragments commonly found in app names. */
export const DEFAULT_APP_ICONS: Record<string, string> = {
  chat: '💬',
  todo: '✅',
  notes: '📝',
  calculator: '🧮',
  timer: '⏱️',
  weather: '🌤️',
  music: '🎵',
  photo: '📷',
  game: '🎮',
  news: '📰',
  calendar: '📅',
  map: '🗺️',
  mail: '📧',
  video: '🎬',
  book: '📚',
  shop: '🛒',
  finance: '💰',
  health: '❤️',
  food: '🍕',
  travel: '✈️',
};

/** Picks a default emoji icon for an app name when none was set explicitly. */
export function guessIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(DEFAULT_APP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '📦';
}
