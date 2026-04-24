import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getHealth,
  addNode,
  updateNode,
  deleteNode,
  wakeNode,
  listNodeModels,
  type NodeStatus,
} from '@/lib/api';

export default function NodesScreen() {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    host: '',
    tier: 'high-end' as 'high-end' | 'low-end',
    gpu: '',
    mac: '',
    model: '',
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await getHealth();
      setNodes(health.backends.nodes || []);
      setOllamaOnline(health.backends.ollama);
    } catch {
      setOllamaOnline(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!form.name || !form.host)
      return Alert.alert('Error', 'Name and host required');
    try {
      await addNode({
        name: form.name,
        host: form.host,
        tier: form.tier,
        gpu: form.gpu,
        mac: form.mac,
        model: form.model,
      });
      resetForm();
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleEdit = async () => {
    if (!editingId || !form.name || !form.host)
      return Alert.alert('Error', 'Name and host required');
    try {
      await updateNode(editingId, {
        name: form.name,
        host: form.host,
        tier: form.tier,
        gpu: form.gpu,
        mac: form.mac,
        model: form.model,
      });
      resetForm();
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const startEdit = (item: NodeStatus) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      host: item.host,
      tier: item.tier as 'high-end' | 'low-end',
      gpu: item.gpu || '',
      mac: item.mac || '',
      model: item.model || '',
    });
    setShowAdd(true);
    if (item.online) {
      listNodeModels(item.id)
        .then(setAvailableModels)
        .catch(() => setAvailableModels([]));
    } else {
      setAvailableModels([]);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      host: '',
      tier: 'high-end',
      gpu: '',
      mac: '',
      model: '',
    });
    setEditingId(null);
    setShowAdd(false);
    setAvailableModels([]);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteNode(id);
          refresh();
        },
      },
    ]);
  };

  const handleWake = async (id: string, name: string) => {
    try {
      await wakeNode(id);
      Alert.alert('Wake-on-LAN', `Magic packet sent to ${name}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={st.root}>
      <FlatList
        data={nodes}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={st.orchestrator}>
            <View style={st.row}>
              <View
                style={[
                  st.dot,
                  { backgroundColor: ollamaOnline ? '#4ade80' : '#555' },
                ]}
              />
              <Text style={st.orchestratorName}>Orchestrator</Text>
              <Text style={st.orchestratorSub}>Pi · gemma3:1b</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={st.card} onPress={() => startEdit(item)}>
            <View style={st.cardRow}>
              <View
                style={[
                  st.dot,
                  { backgroundColor: item.online ? '#4ade80' : '#555' },
                ]}
              />
              <Text style={st.cardName}>{item.name}</Text>
              <Text
                style={[
                  st.tier,
                  item.tier === 'high-end' ? st.tierHigh : st.tierLow,
                ]}>
                {item.tier === 'high-end' ? 'High' : 'Low'}
              </Text>
            </View>
            <Text style={st.cardHost}>{item.host}</Text>
            {item.gpu ? <Text style={st.cardGpu}>{item.gpu}</Text> : null}
            {item.model ? <Text style={st.cardModel}>{item.model}</Text> : null}
            <View style={st.cardActions}>
              {!item.online && item.mac && (
                <Pressable
                  onPress={() => handleWake(item.id, item.name)}
                  hitSlop={8}>
                  <Ionicons name="power" size={16} color="#4ade80" />
                </Pressable>
              )}
              <Pressable
                onPress={() => handleDelete(item.id, item.name)}
                hitSlop={8}>
                <Ionicons name="close" size={16} color="#555" />
              </Pressable>
            </View>
          </Pressable>
        )}
        contentContainerStyle={st.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={st.emptyText}>
              No compute nodes. Tap + to add one.
            </Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#555"
          />
        }
      />

      {showAdd ? (
        <View style={st.form}>
          <TextInput
            style={st.formInput}
            placeholder="Name"
            placeholderTextColor="#444"
            value={form.name}
            onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
          />
          <TextInput
            style={st.formInput}
            placeholder="Host (http://192.168.x.x:1234)"
            placeholderTextColor="#444"
            value={form.host}
            onChangeText={(t) => setForm((f) => ({ ...f, host: t }))}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={st.formInput}
            placeholder="GPU (optional)"
            placeholderTextColor="#444"
            value={form.gpu}
            onChangeText={(t) => setForm((f) => ({ ...f, gpu: t }))}
          />
          <TextInput
            style={st.formInput}
            placeholder="MAC address for WoL (optional, e.g. AA:BB:CC:DD:EE:FF)"
            placeholderTextColor="#444"
            value={form.mac}
            onChangeText={(t) => setForm((f) => ({ ...f, mac: t }))}
            autoCapitalize="none"
          />
          <TextInput
            style={st.formInput}
            placeholder="Model (optional, or pick below)"
            placeholderTextColor="#444"
            value={form.model}
            onChangeText={(t) => setForm((f) => ({ ...f, model: t }))}
            autoCapitalize="none"
          />
          {availableModels.length > 0 && (
            <View style={st.modelList}>
              <Text style={st.modelListLabel}>Available models:</Text>
              {availableModels.map((m) => (
                <Pressable
                  key={m}
                  style={[st.modelItem, form.model === m && st.modelItemActive]}
                  onPress={() => setForm((f) => ({ ...f, model: m }))}>
                  <Text
                    style={[
                      st.modelItemText,
                      form.model === m && { color: '#fff' },
                    ]}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={st.tierRow}>
            <Pressable
              style={[st.tierBtn, form.tier === 'high-end' && st.tierBtnActive]}
              onPress={() => setForm((f) => ({ ...f, tier: 'high-end' }))}>
              <Text
                style={[
                  st.tierBtnText,
                  form.tier === 'high-end' && { color: '#fff' },
                ]}>
                High-End
              </Text>
            </Pressable>
            <Pressable
              style={[st.tierBtn, form.tier === 'low-end' && st.tierBtnActive]}
              onPress={() => setForm((f) => ({ ...f, tier: 'low-end' }))}>
              <Text
                style={[
                  st.tierBtnText,
                  form.tier === 'low-end' && { color: '#fff' },
                ]}>
                Low-End
              </Text>
            </Pressable>
          </View>
          <View style={st.formActions}>
            <Pressable style={st.cancelBtn} onPress={resetForm}>
              <Text style={st.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={st.saveBtn}
              onPress={editingId ? handleEdit : handleAdd}>
              <Text style={st.saveText}>{editingId ? 'Save' : 'Add'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={st.fab} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={24} color="#000" />
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  list: { padding: 16 },

  orchestrator: {
    paddingVertical: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  orchestratorName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  orchestratorSub: { color: '#444', fontSize: 12 },

  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardName: { color: '#fff', fontSize: 15, fontWeight: '500', flex: 1 },
  tier: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tierHigh: { backgroundColor: '#a78bfa22', color: '#a78bfa' },
  tierLow: { backgroundColor: '#22d3ee22', color: '#22d3ee' },
  cardHost: { color: '#555', fontSize: 12, marginLeft: 16 },
  cardGpu: { color: '#444', fontSize: 12, marginLeft: 16, marginTop: 2 },
  cardModel: { color: '#a78bfa', fontSize: 12, marginLeft: 16, marginTop: 2 },
  cardActions: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  emptyText: {
    color: '#333',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },

  form: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1a1a1a',
  },
  formInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  tierRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tierBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  tierBtnActive: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  tierBtnText: { color: '#555', fontSize: 13, fontWeight: '500' },

  modelList: { marginBottom: 12 },
  modelListLabel: { color: '#555', fontSize: 12, marginBottom: 6 },
  modelItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  modelItemActive: { backgroundColor: '#1a1a1a', borderColor: '#a78bfa' },
  modelItemText: { color: '#555', fontSize: 13 },

  formActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  cancelText: { color: '#555', fontSize: 14 },
  saveBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  saveText: { color: '#000', fontSize: 14, fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
