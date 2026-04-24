import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { getHealth, getConfig } from '@/lib/api';

type NavItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  color: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    title: 'Node Settings',
    subtitle: 'Manage compute nodes, models & Wake-on-LAN',
    icon: 'server-outline',
    href: '/settings/nodes',
    color: '#a78bfa',
  },
  {
    title: 'Classifier',
    subtitle: 'Router model & classification config',
    icon: 'git-branch-outline',
    href: '/settings/classifier',
    color: '#facc15',
  },
  {
    title: 'Logs',
    subtitle: 'Server logs & request history',
    icon: 'list-outline',
    href: '/settings/logs',
    color: '#4ade80',
  },
];

export default function SettingsHub() {
  const router = useRouter();
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [ollamaHost, setOllamaHost] = useState('');
  const [routerModel, setRouterModel] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [health, cfg] = await Promise.all([getHealth(), getConfig()]);
      setOllamaOnline(health.backends.ollama);
      const nodes = health.backends.nodes || [];
      setNodeCount(nodes.length);
      setOnlineCount(nodes.filter((n) => n.online).length);
      setOllamaHost(cfg.ollama_host);
      setRouterModel(cfg.router_model);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <ScrollView
      style={st.root}
      contentContainerStyle={st.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor="#555"
        />
      }>
      {/* ═══ SYSTEM STATUS ═══ */}
      <Text style={st.section}>System</Text>
      <View style={st.card}>
        <View style={st.statusRow}>
          <View
            style={[
              st.dot,
              { backgroundColor: ollamaOnline ? '#4ade80' : '#555' },
            ]}
          />
          <Text style={st.statusLabel}>Ollama</Text>
          <Text style={st.statusValue}>
            {ollamaOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        <View style={st.statusRow}>
          <View
            style={[
              st.dot,
              { backgroundColor: onlineCount > 0 ? '#4ade80' : '#555' },
            ]}
          />
          <Text style={st.statusLabel}>Compute Nodes</Text>
          <Text style={st.statusValue}>
            {onlineCount}/{nodeCount} online
          </Text>
        </View>
        <View style={st.statusRow}>
          <Text style={st.statusLabel}>Host</Text>
          <Text style={st.statusValue}>{ollamaHost}</Text>
        </View>
        <View style={st.statusRow}>
          <Text style={st.statusLabel}>Classifier</Text>
          <Text style={st.statusValue}>{routerModel}</Text>
        </View>

        <Pressable style={st.checkBtn} onPress={refresh}>
          <Ionicons name="refresh-outline" size={14} color="#fff" />
          <Text style={st.checkBtnText}>Check Nodes</Text>
        </Pressable>
      </View>

      {/* ═══ NAVIGATION ═══ */}
      <Text style={st.section}>Configuration</Text>
      {NAV_ITEMS.map((item) => (
        <Pressable
          key={item.href}
          style={st.navCard}
          onPress={() => router.push(item.href as any)}>
          <View style={[st.navIcon, { backgroundColor: item.color + '18' }]}>
            <Ionicons name={item.icon} size={20} color={item.color} />
          </View>
          <View style={st.navContent}>
            <Text style={st.navTitle}>{item.title}</Text>
            <Text style={st.navSubtitle}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" />
        </Pressable>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },

  section: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
  },

  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
    marginBottom: 8,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: '#999', fontSize: 14, flex: 1 },
  statusValue: { color: '#fff', fontSize: 14 },

  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  checkBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  navCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navContent: { flex: 1 },
  navTitle: { color: '#fff', fontSize: 15, fontWeight: '500' },
  navSubtitle: { color: '#555', fontSize: 12, marginTop: 2 },
});
