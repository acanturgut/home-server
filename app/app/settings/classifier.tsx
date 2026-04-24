import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getConfig, updateConfig } from '@/lib/api';

export default function ClassifierScreen() {
  const [routerModel, setRouterModel] = useState('');
  const [ollamaHost, setOllamaHost] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getConfig();
      setRouterModel(cfg.router_model);
      setOllamaHost(cfg.ollama_host);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      <Text style={st.section}>Ollama</Text>
      <View style={st.card}>
        <View style={st.statusRow}>
          <Text style={st.statusLabel}>Host</Text>
          <Text style={st.statusValue}>{ollamaHost}</Text>
        </View>
      </View>

      <Text style={st.section}>Router Model</Text>
      <View style={st.card}>
        <Text style={st.hint}>
          The Ollama model running on the Pi that classifies every incoming
          request and routes it to the right compute node.
        </Text>
        <TextInput
          style={[st.input, { marginTop: 10 }]}
          value={routerModel}
          onChangeText={setRouterModel}
          placeholder="e.g. gemma3:1b"
          placeholderTextColor="#444"
          autoCapitalize="none"
        />
        <Pressable
          style={[st.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}>
          <Text style={st.saveBtnText}>
            {saving ? 'Saving…' : 'Save Configuration'}
          </Text>
        </Pressable>
      </View>

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
  statusLabel: { color: '#999', fontSize: 14, flex: 1 },
  statusValue: { color: '#fff', fontSize: 14 },
  hint: { color: '#555', fontSize: 13, lineHeight: 18 },
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
    marginTop: 16,
  },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '600' },
});
