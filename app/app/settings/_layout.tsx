import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#000' },
      }}
    />
  );
}
