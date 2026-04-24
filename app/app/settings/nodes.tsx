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
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  getHealth,
  addNode,
  updateNode,
  deleteNode,
  wakeNode,
  listNodeModels,
  type NodeStatus,
} from '@/lib/api';

type NodeForm = {
  name: string;
  host: string;
  tier: 'high-end' | 'low-end';
  gpu: string;
  mac: string;
  model: string;
};

const EMPTY: NodeForm = {
  name: '',
  host: '',
  tier: 'high-end',
  gpu: '',
  mac: '',
  model: '',
};

export default function NodeSettingsScreen() {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<NodeForm>(EMPTY);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<NodeForm>(EMPTY);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await getHealth();
      setNodes(health.backends.nodes || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const toggleNode = async (node: NodeStatus) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === node.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(node.id);
    setForm({
      name: node.name,
      host: node.host,
      tier: node.tier as 'high-end' | 'low-end',
      gpu: node.gpu || '',
      mac: node.mac || '',
      model: node.model || '',
    });
    setModels([]);
    if (node.online) {
      setLoadingModels(true);
      try {
        setModels(await listNodeModels(node.id));
      } catch {}
      setLoadingModels(false);
    }
  };

  const saveNode = async () => {
    if (!expandedId || !form.name || !form.host)
      return Alert.alert('Error', 'Name and host are required');
    try {
      await updateNode(expandedId, form);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(null);
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const removeNode = (id: string, name: string) => {
    Alert.alert('Remove Node', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteNode(id);
          setExpandedId(null);
          refresh();
        },
      },
    ]);
  };

  const wake = async (id: string, name: string) => {
    try {
      await wakeNode(id);
      Alert.alert('Wake-on-LAN', `Magic packet sent to ${name}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.host)
      return Alert.alert('Error', 'Name and host are required');
    try {
      await addNode(addForm);
      setAddForm(EMPTY);
      setShowAdd(false);
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
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
      {/* Add button */}
      <View style={st.sectionRow}>
        <Text style={st.section}>
          {nodes.length} node{nodes.length !== 1 && 's'}
        </Text>
        <Pressable
          hitSlop={12}
          onPress={() => {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            setShowAdd(!showAdd);
            setAddForm(EMPTY);
          }}>
          <Ionicons
            name={showAdd ? 'close-circle' : 'add-circle-outline'}
            size={20}
            color="#555"
          />
        </Pressable>
      </View>

      {showAdd && (
        <View style={st.card}>
          <Text style={st.cardTitle}>Add Node</Text>
          <FormFields
            form={addForm}
            setForm={setAddForm}
            models={[]}
            loadingModels={false}
          />
          <View style={st.actionRow}>
            <Pressable
              style={st.secondaryBtn}
              onPress={() => {
                setShowAdd(false);
                setAddForm(EMPTY);
              }}>
              <Text style={st.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={st.primaryBtn} onPress={handleAdd}>
              <Text style={st.primaryBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      {nodes.length === 0 && !loading && (
        <Text style={st.emptyText}>No compute nodes. Tap + to add one.</Text>
      )}

      {nodes.map((node) => {
        const open = expandedId === node.id;
        return (
          <Pressable
            key={node.id}
            style={st.card}
            onPress={() => toggleNode(node)}>
            <View style={st.nodeHeader}>
              <View
                style={[
                  st.dot,
                  { backgroundColor: node.online ? '#4ade80' : '#555' },
                ]}
              />
              <Text style={st.nodeName}>{node.name}</Text>
              <View
                style={[
                  st.badge,
                  node.tier === 'high-end' ? st.badgeHigh : st.badgeLow,
                ]}>
                <Text
                  style={[
                    st.badgeText,
                    node.tier === 'high-end'
                      ? st.badgeHighText
                      : st.badgeLowText,
                  ]}>
                  {node.tier === 'high-end' ? 'HIGH' : 'LOW'}
                </Text>
              </View>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#555"
              />
            </View>
            <Text style={st.nodeHost}>{node.host}</Text>
            {node.gpu ? <Text style={st.nodeSub}>{node.gpu}</Text> : null}
            {node.model ? <Text style={st.nodeModel}>{node.model}</Text> : null}

            {open && (
              <View style={st.nodeDetail}>
                <View style={st.divider} />
                <FormFields
                  form={form}
                  setForm={setForm}
                  models={models}
                  loadingModels={loadingModels}
                />
                <View style={st.actionRow}>
                  {!node.online && node.mac && (
                    <Pressable
                      style={st.wakeBtn}
                      onPress={() => wake(node.id, node.name)}>
                      <Ionicons name="power" size={14} color="#4ade80" />
                      <Text style={st.wakeBtnText}>Wake</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={st.dangerBtn}
                    onPress={() => removeNode(node.id, node.name)}>
                    <Text style={st.dangerBtnText}>Delete</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable style={st.primaryBtn} onPress={saveNode}>
                    <Text style={st.primaryBtnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ── Reusable form fields ── */
function FormFields({
  form,
  setForm,
  models,
  loadingModels,
}: {
  form: NodeForm;
  setForm: React.Dispatch<React.SetStateAction<NodeForm>>;
  models: string[];
  loadingModels: boolean;
}) {
  return (
    <>
      <Text style={st.fieldLabel}>Name</Text>
      <TextInput
        style={st.input}
        value={form.name}
        onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
        placeholder="Node name"
        placeholderTextColor="#444"
      />
      <Text style={st.fieldLabel}>Host</Text>
      <TextInput
        style={st.input}
        value={form.host}
        onChangeText={(t) => setForm((f) => ({ ...f, host: t }))}
        placeholder="http://192.168.x.x:1234"
        placeholderTextColor="#444"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Text style={st.fieldLabel}>GPU</Text>
      <TextInput
        style={st.input}
        value={form.gpu}
        onChangeText={(t) => setForm((f) => ({ ...f, gpu: t }))}
        placeholder="Optional"
        placeholderTextColor="#444"
      />
      <Text style={st.fieldLabel}>MAC Address</Text>
      <TextInput
        style={st.input}
        value={form.mac}
        onChangeText={(t) => setForm((f) => ({ ...f, mac: t }))}
        placeholder="AA:BB:CC:DD:EE:FF (for Wake-on-LAN)"
        placeholderTextColor="#444"
        autoCapitalize="none"
      />
      <Text style={st.fieldLabel}>Tier</Text>
      <View style={st.tierRow}>
        <Pressable
          style={[st.tierBtn, form.tier === 'high-end' && st.tierActive]}
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
          style={[st.tierBtn, form.tier === 'low-end' && st.tierActive]}
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
      <Text style={st.fieldLabel}>Model</Text>
      <TextInput
        style={st.input}
        value={form.model}
        onChangeText={(t) => setForm((f) => ({ ...f, model: t }))}
        placeholder="Model identifier (or pick below)"
        placeholderTextColor="#444"
        autoCapitalize="none"
      />
      {loadingModels && (
        <View style={st.modelLoading}>
          <ActivityIndicator size="small" color="#555" />
          <Text style={st.hint}>Fetching available models…</Text>
        </View>
      )}
      {models.length > 0 && (
        <View style={st.modelChips}>
          <Text style={st.hint}>Available on this node:</Text>
          <View style={st.chipRow}>
            {models.map((m) => (
              <Pressable
                key={m}
                style={[st.chip, form.model === m && st.chipActive]}
                onPress={() => setForm((f) => ({ ...f, model: m }))}>
                <Text
                  style={[st.chipText, form.model === m && { color: '#fff' }]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </>
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
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nodeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nodeName: { color: '#fff', fontSize: 15, fontWeight: '500', flex: 1 },
  nodeHost: { color: '#555', fontSize: 12, marginLeft: 16, marginTop: 2 },
  nodeSub: { color: '#444', fontSize: 12, marginLeft: 16, marginTop: 2 },
  nodeModel: { color: '#a78bfa', fontSize: 12, marginLeft: 16, marginTop: 2 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeHigh: { backgroundColor: '#a78bfa22' },
  badgeLow: { backgroundColor: '#22d3ee22' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  badgeHighText: { color: '#a78bfa' },
  badgeLowText: { color: '#22d3ee' },
  nodeDetail: { marginTop: 8 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#1a1a1a',
    marginBottom: 4,
  },
  fieldLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    marginBottom: 4,
  },
  hint: { color: '#444', fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  tierRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  tierBtn: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  tierActive: { backgroundColor: '#1a1a1a', borderColor: '#333' },
  tierBtnText: { color: '#555', fontSize: 13, fontWeight: '500' },
  modelLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modelChips: { marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  chipActive: { backgroundColor: '#a78bfa22', borderColor: '#a78bfa' },
  chipText: { color: '#555', fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  secondaryBtnText: { color: '#555', fontSize: 14 },
  dangerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f8717133',
  },
  dangerBtnText: { color: '#f87171', fontSize: 13 },
  wakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#4ade8033',
  },
  wakeBtnText: { color: '#4ade80', fontSize: 13 },
  emptyText: {
    color: '#333',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});
