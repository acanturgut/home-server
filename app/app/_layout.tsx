import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadSettings } from '@/lib/storage';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0a0a0f' },
              headerTitleStyle: { color: '#fff' },
              headerTintColor: '#fff',
              contentStyle: { backgroundColor: '#0a0a0f' },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Home Voice' }} />
            <Stack.Screen
              name="login"
              options={{ title: 'Sign in', headerShown: false }}
            />
            <Stack.Screen
              name="settings"
              options={{ title: 'Settings', presentation: 'modal' }}
            />
          </Stack>
        </AuthGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// AuthGate keeps the user on /login whenever no session is present, and
// bounces them off /login the moment one appears. We re-check on every
// route change so logging out from Settings immediately kicks back to login.
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSettings();
      if (!alive) return;
      setHasSession(!!s.session);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // re-run whenever the route changes — picks up sign-in / sign-out.
  }, [segments.join('/')]);

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === 'login';
    if (!hasSession && !onLogin) {
      router.replace('/login');
    } else if (hasSession && onLogin) {
      router.replace('/');
    }
  }, [ready, hasSession, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center' }}>
        <ActivityIndicator color="#7aa6ff" />
      </View>
    );
  }
  return <>{children}</>;
}
