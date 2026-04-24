import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { getConfig, updateConfig, getHealth, type NodeStatus } from '@/lib/api';

export default function ConfigScreen() {
  const [routerModel, setRouterModel] = useState('');
  const [ollamaHost, setOllamaHost] = useState('');
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, health] = await Promise.all([getConfig(), getHealth()]);
      setRouterModel(cfg.router_model);
      setOllamaHost(cfg.ollama_host);
      setOllamaOnline(health.backends.ollama);
      const nodes = health.backends.nodes || [];
      setNodeCount(nodes.length);
      setOnlineCount(nodes.filter((n: NodeStatus) => n.online).length);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateConfig({ router_model: routerModel });
      setRouterModel(res.router_model);
      Alert.alert('Saved', 'Configuration updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

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
      <Text style={st.sectionTitle}>System Status</Text>
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
          <Text style={st.statusLabel}>Ollama Host</Text>
          <Text style={st.statusValue}>{ollamaHost}</Text>
        </View>
      </View>

      <Text style={st.sectionTitle}>Classifier</Text>
      <View style={st.card}>
        <Text style={st.fieldLabel}>Router Model</Text>
        <TextInput
          style={st.input}
          value={routerModel}
          onChangeText={setRouterModel}
          placeholder="e.g. gemma3:1b"
          placeholderTextColor="#444"
          autoCapitalize="none"
        />
        <Text style={st.fieldHint}>
          The Ollama model used on the Pi to classify requests.
        </Text>
      </View>

      <Pressable
        style={[st.saveBtn, saving && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={saving}>
        <Text style={st.saveText}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },

  sectionTitle: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },

  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
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

  fieldLabel: { color: '#999', fontSize: 13, marginBottom: 6 },
  fieldHint: { color: '#444', fontSize: 12, marginTop: 6 },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },

  saveBtn: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#000', fontSize: 15, fontWeight: '600' },
});
