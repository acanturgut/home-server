import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getLogs, type LogEntry } from '@/lib/api';

const levelColor: Record<string, string> = {
  INFO: '#4ade80',
  WARN: '#facc15',
  ERROR: '#f87171',
};

export default function LogsScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await getLogs(100);
      setLogs((entries || []).reverse());
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={st.root}>
      <FlatList
        data={logs}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => {
          const color = levelColor[item.level] || '#555';
          return (
            <View style={st.row}>
              <View style={st.header}>
                <View style={[st.dot, { backgroundColor: color }]} />
                <Text style={[st.level, { color }]}>{item.level}</Text>
                {item.tier && <Text style={st.dim}>{item.tier}</Text>}
                {item.node && <Text style={st.node}>→ {item.node}</Text>}
                {item.latency && <Text style={st.latency}>{item.latency}</Text>}
              </View>
              <Text style={st.msg} numberOfLines={2}>
                {item.message}
              </Text>
              <Text style={st.time}>
                {item.timestamp
                  ? new Date(item.timestamp).toLocaleTimeString()
                  : ''}
                {item.model ? ` · ${item.model}` : ''}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={st.list}
        ListEmptyComponent={
          !loading ? <Text style={st.empty}>No logs</Text> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#555"
          />
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  list: { padding: 12 },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  level: { fontSize: 11, fontWeight: '600' },
  dim: { fontSize: 11, color: '#555' },
  node: { fontSize: 11, color: '#888' },
  latency: { fontSize: 11, color: '#444', marginLeft: 'auto' },
  msg: { color: '#999', fontSize: 13, lineHeight: 18 },
  time: { color: '#333', fontSize: 10, marginTop: 3 },
  empty: { color: '#333', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
