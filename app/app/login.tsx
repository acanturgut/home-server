import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '@/lib/api';
import { loadSettings, saveSettings, Settings } from '@/lib/storage';

export default function LoginScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showServerEdit, setShowServerEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      // If we already have a session, the gate in _layout will route us
      // straight to the main screen — nothing else to do here.
    });
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
    setError(null);
  };

  const onSignIn = async () => {
    if (!settings) return;
    const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '');
    const username = settings.username.trim();
    if (!baseUrl) return Alert.alert('Server URL required');
    if (!username) return Alert.alert('Username required');
    if (!password) return Alert.alert('Password required');
    setBusy(true);
    setError(null);
    try {
      const res = await login({ baseUrl, username, password });
      const next: Settings = {
        ...settings,
        baseUrl,
        username,
        session: res.token,
      };
      await saveSettings(next);
      setPassword('');
      router.replace('/');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Home Voice</Text>
          <Text style={styles.subtitle}>Sign in to your home server</Text>
        </View>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          placeholder="admin"
          placeholderTextColor="#4b5563"
          value={settings.username}
          onChangeText={(v) => update({ username: v })}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            placeholderTextColor="#4b5563"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSignIn}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeButton}
          >
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.primaryButton, busy && { opacity: 0.6 }]}
          onPress={onSignIn}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#0a0a0f" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign in</Text>
          )}
        </Pressable>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={() => setShowServerEdit((v) => !v)}
          style={styles.serverToggle}
        >
          <Text style={styles.serverToggleText}>
            {showServerEdit ? 'Hide server URL' : `Server: ${settings.baseUrl}`}
          </Text>
        </Pressable>

        {showServerEdit && (
          <View style={styles.serverBox}>
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
            />
            <Text style={styles.hint}>
              Defaults to https://home.lan. If your iPhone can't resolve that
              hostname, use the LAN IP (e.g. http://192.168.50.199:8080 to skip
              the self-signed TLS dance).
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: '#9ca3af', fontSize: 15, marginTop: 8 },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  hint: { color: '#9ca3af', fontSize: 12, marginTop: 6, lineHeight: 16 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    marginTop: 24,
    backgroundColor: '#7aa6ff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#0a0a0f', fontSize: 16, fontWeight: '600' },
  errorBox: {
    marginTop: 16,
    backgroundColor: '#3a1414',
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 13, lineHeight: 18 },
  serverToggle: { marginTop: 32, alignItems: 'center' },
  serverToggleText: { color: '#6b7280', fontSize: 13 },
  serverBox: { marginTop: 12 },
});
