import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1a1a1a',
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#444',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="distributed"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="git-network-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: 'Apps',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="nodes" options={{ href: null }} />
      <Tabs.Screen name="logs" options={{ href: null }} />
      <Tabs.Screen name="config" options={{ href: null }} />
    </Tabs>
  );
}
