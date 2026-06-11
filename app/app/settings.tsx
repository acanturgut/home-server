import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ask, login, SessionExpiredError } from '@/lib/api';
import { loadSettings, saveSettings, Settings } from '@/lib/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <View style={[styles.root, { justifyContent: 'center' }]}>
        <ActivityIndicator color="#7aa6ff" />
      </View>
    );
  }

  const update = (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setResult(null);
  };

  const onSignIn = async () => {
    if (!settings) return;
    const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '');
    const username = settings.username.trim();
    if (!baseUrl) return Alert.alert('Server URL required');
    if (!username) return Alert.alert('Username required');
    if (!password) return Alert.alert('Password required');
    setSigningIn(true);
    setResult(null);
    try {
      const res = await login({ baseUrl, username, password });
      const next: Settings = {
        ...settings,
        baseUrl,
        username,
        session: res.token,
      };
      await saveSettings(next);
      setSettings(next);
      setPassword('');
      setResult({ ok: true, msg: `Signed in as ${res.user.username}` });
    } catch (err: any) {
      setResult({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setSigningIn(false);
    }
  };

  const onSignOut = async () => {
    if (!settings) return;
    const next: Settings = { ...settings, session: '' };
    await saveSettings(next);
    setSettings(next);
    setResult(null);
    router.replace('/login');
  };

  const onTest = async () => {
    if (!settings?.session) {
      Alert.alert('Sign in first');
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await ask({
        baseUrl: settings.baseUrl.trim(),
        session: settings.session,
        prompt: 'Hello, can you hear me?',
      });
      setResult({ ok: true, msg: res.reply });
    } catch (err: any) {
      if (err instanceof SessionExpiredError) {
        const next: Settings = { ...settings, session: '' };
        await saveSettings(next);
        setSettings(next);
      }
      setResult({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setTesting(false);
    }
  };

  const onSaveAndClose = async () => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''),
    });
    router.back();
  };

  const signedIn = !!settings.session;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://home.lan"
          placeholderTextColor="#4b5563"
          value={settings.baseUrl}
          onChangeText={(v) => update({ baseUrl: v })}
          editable={!signedIn}
        />
        <Text style={styles.hint}>
          Use https://home.lan if your iPhone's DNS resolves it, otherwise the
          LAN IP. Self-signed cert? Trust the Caddy root in Settings → General →
          VPN & Device Management.
        </Text>

        {signedIn ? (
          <View style={styles.signedInBox}>
            <Text style={styles.signedInLabel}>Signed in as</Text>
            <Text style={styles.signedInUser}>{settings.username}</Text>
            <Pressable style={styles.signOutButton} onPress={onSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.label, { marginTop: 24 }]}>Username</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="admin"
              placeholderTextColor="#4b5563"
              value={settings.username}
              onChangeText={(v) => update({ username: v })}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <View style={styles.tokenRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor="#4b5563"
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
              >
                <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.primaryButton, signingIn && { opacity: 0.6 }]}
              onPress={onSignIn}
              disabled={signingIn}
            >
              {signingIn ? (
                <ActivityIndicator color="#0a0a0f" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </Pressable>
          </>
        )}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Auto-speak replies</Text>
            <Text style={styles.hint}>Use the system TTS voice to read answers aloud.</Text>
          </View>
          <Switch
            value={settings.autoSpeak}
            onValueChange={(v) => update({ autoSpeak: v })}
            trackColor={{ false: '#374151', true: '#7aa6ff' }}
          />
        </View>

        {signedIn && (
          <Pressable style={styles.testButton} onPress={onTest} disabled={testing}>
            {testing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.testButtonText}>Test connection</Text>
            )}
          </Pressable>
        )}

        {result && (
          <View
            style={[
              styles.testBox,
              result.ok ? styles.testOk : styles.testErr,
            ]}
          >
            <Text style={result.ok ? styles.testOkText : styles.testErrText}>
              {result.msg}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={onSaveAndClose}>
          <Text style={styles.saveText}>Done</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 32 },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  hint: { color: '#9ca3af', fontSize: 12, marginTop: 4, lineHeight: 16 },
  input: {
    backgroundColor: '#16161f',
    borderColor: '#26262f',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
  },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#16161f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#26262f',
  },
  eyeText: { color: '#7aa6ff', fontSize: 13, fontWeight: '500' },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#7aa6ff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#0a0a0f', fontSize: 15, fontWeight: '600' },
  signedInBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0f2a1a',
    borderWidth: 1,
    borderColor: '#1f4a30',
  },
  signedInLabel: {
    color: '#86efac',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  signedInUser: { color: '#fff', fontSize: 18, fontWeight: '600' },
  signOutButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#16161f',
  },
  signOutText: { color: '#fca5a5', fontSize: 13, fontWeight: '500' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  testButton: {
    marginTop: 16,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testButtonText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  testBox: { marginTop: 12, borderRadius: 10, padding: 12 },
  testOk: { backgroundColor: '#0f2a1a' },
  testErr: { backgroundColor: '#3a1414' },
  testOkText: { color: '#86efac', fontSize: 14, lineHeight: 20 },
  testErrText: { color: '#fca5a5', fontSize: 14, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#26262f',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#16161f',
    alignItems: 'center',
  },
  cancelText: { color: '#9ca3af', fontSize: 15, fontWeight: '500' },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#7aa6ff',
    alignItems: 'center',
  },
  saveText: { color: '#0a0a0f', fontSize: 15, fontWeight: '600' },
});
