import * as SecureStore from 'expo-secure-store';

export type Settings = {
  baseUrl: string;
  username: string;
  // Session token returned by /api/auth/login, sent as
  // `Authorization: Bearer` on every API call. Empty when signed out.
  session: string;
  autoSpeak: boolean;
};

const KEY = 'home-voice.settings.v2';
const LEGACY_KEY = 'home-voice.settings.v1';

const DEFAULTS: Settings = {
  baseUrl: 'https://home.lan',
  username: '',
  session: '',
  autoSpeak: true,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
    // Migrate v1 (API-token era) — keep server URL + auto-speak preference.
    const legacy = await SecureStore.getItemAsync(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      return {
        ...DEFAULTS,
        baseUrl: old.baseUrl ?? DEFAULTS.baseUrl,
        autoSpeak: old.autoSpeak ?? DEFAULTS.autoSpeak,
      };
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  const s = await loadSettings();
  await saveSettings({ ...s, session: '' });
}
