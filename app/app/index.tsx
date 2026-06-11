import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Mic, Settings as SettingsIcon } from 'lucide-react-native';
import { ask, AskResponse, SessionExpiredError } from '@/lib/api';
import { clearSession, loadSettings, Settings } from '@/lib/storage';
import { speak, stopSpeaking, useVoice } from '@/lib/speech';

type Turn = {
  id: string;
  prompt: string;
  reply?: string;
  handler?: 'home' | 'llm';
  error?: string;
  pending?: boolean;
};

export default function MainScreen() {
  const voice = useVoice();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submittedRef = useRef(false);

  // Reload settings every time we focus this screen (after editing in modal).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadSettings().then((s) => {
        if (alive) setSettings(s);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  // Pulse animation while listening.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (voice.state === 'listening') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(0);
    }
  }, [voice.state, pulse]);

  // When a final transcript lands, fire the request automatically.
  useEffect(() => {
    if (!voice.finalTranscript || submittedRef.current) return;
    submittedRef.current = true;
    void submitPrompt(voice.finalTranscript);
  }, [voice.finalTranscript]);

  const submitPrompt = async (prompt: string) => {
    if (!settings || !settings.session) return;
    const id = `${Date.now()}`;
    setTurns((t) => [{ id, prompt, pending: true }, ...t].slice(0, 12));
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res: AskResponse = await ask({
        baseUrl: settings.baseUrl,
        session: settings.session,
        prompt,
        signal: ctrl.signal,
      });
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? {
                ...x,
                pending: false,
                reply: res.reply,
                handler: res.handler,
              }
            : x,
        ),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (settings.autoSpeak) {
        await speak(res.reply);
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Cancelled' : err?.message ?? String(err);
      setTurns((t) =>
        t.map((x) => (x.id === id ? { ...x, pending: false, error: msg } : x)),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof SessionExpiredError) {
        await clearSession();
        setSettings((s) => (s ? { ...s, session: '' } : s));
        router.replace('/login');
      }
    } finally {
      setBusy(false);
      voice.reset();
      submittedRef.current = false;
    }
  };

  const onPressIn = async () => {
    if (busy) return;
    stopSpeaking();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await voice.start();
  };

  const onPressOut = () => {
    if (voice.state === 'listening' || voice.state === 'requesting') {
      voice.stop();
    }
  };

  const status = (() => {
    if (busy) return 'Thinking…';
    if (voice.state === 'requesting') return 'Getting ready…';
    if (voice.state === 'listening') return 'Listening — release to send';
    if (voice.state === 'error') return voice.errorMessage ?? 'Error';
    return 'Press and hold to talk';
  })();

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.history}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {turns.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Tap and hold the mic</Text>
            <Text style={styles.emptyHint}>
              Try: "Turn off the lights", "What's the bedroom temperature?",
              "What's the latest news about iOS 26?"
            </Text>
            <Link href="/settings" style={styles.settingsLink}>
              Edit connection
            </Link>
          </View>
        )}
        {turns.map((t) => (
          <View key={t.id} style={styles.turn}>
            <Text style={styles.youLabel}>You</Text>
            <Text style={styles.youText}>{t.prompt}</Text>
            {t.pending && (
              <View style={styles.replyRow}>
                <ActivityIndicator size="small" color="#7aa6ff" />
                <Text style={styles.replyPending}>Thinking…</Text>
              </View>
            )}
            {t.reply && (
              <View style={styles.replyBox}>
                <Text style={styles.replyText}>{t.reply}</Text>
                {t.handler && (
                  <Text style={styles.replyHandler}>
                    {t.handler === 'home' ? 'Home control' : 'AI'}
                  </Text>
                )}
              </View>
            )}
            {t.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{t.error}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Live transcript shown above mic while listening */}
      <View style={styles.transcriptContainer}>
        {voice.transcript ? (
          <Text style={styles.transcript} numberOfLines={3}>
            {voice.transcript}
          </Text>
        ) : (
          <Text style={styles.statusLine}>{status}</Text>
        )}
      </View>

      <View style={styles.micWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              opacity: voice.state === 'listening' ? glow : 0,
              transform: [{ scale }],
            },
          ]}
        />
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={({ pressed }) => [
            styles.mic,
            pressed && styles.micPressed,
            voice.state === 'listening' && styles.micActive,
            busy && styles.micDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Press and hold to talk"
        >
          <Mic
            size={48}
            color={voice.state === 'listening' ? '#7aa6ff' : '#e5e7eb'}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>

      <Link href="/settings" asChild>
        <Pressable style={styles.gearLink} accessibilityRole="button">
          <SettingsIcon size={16} color="#6b7280" />
          <Text style={styles.gearLinkText}>Settings</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f', paddingHorizontal: 16 },
  history: { flex: 1, marginTop: 8 },
  emptyState: { paddingTop: 40, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  emptyHint: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  settingsLink: {
    color: '#7aa6ff',
    marginTop: 24,
    fontSize: 15,
    fontWeight: '500',
  },
  turn: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  youLabel: {
    color: '#9ca3af',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  youText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  replyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  replyPending: { color: '#9ca3af', fontSize: 13 },
  replyBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#26262f',
  },
  replyText: { color: '#e5e7eb', fontSize: 16, lineHeight: 22 },
  replyHandler: {
    color: '#7aa6ff',
    fontSize: 11,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  errorBox: {
    marginTop: 10,
    backgroundColor: '#3a1414',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },
  transcriptContainer: {
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  transcript: { color: '#fff', fontSize: 18, textAlign: 'center', lineHeight: 24 },
  statusLine: { color: '#6b7280', fontSize: 14 },
  micWrap: {
    width: 160,
    height: 160,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#7aa6ff',
  },
  mic: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  micPressed: { backgroundColor: '#374151' },
  micActive: { borderColor: '#7aa6ff', backgroundColor: '#1e293b' },
  micDisabled: { opacity: 0.4 },
  gearLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  gearLinkText: {
    color: '#6b7280',
    fontSize: 13,
  },
});
