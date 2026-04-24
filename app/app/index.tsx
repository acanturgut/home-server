import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { sendChatStream, type Message, type StreamEvent } from '@/lib/api';
import {
  type ChatMessage,
  type Session,
  loadSessions,
  saveSessions,
  getActiveSessionId,
  setActiveSessionId,
  createSession,
  sessionTitle,
} from '@/lib/sessions';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveBubbles, setLiveBubbles] = useState<ChatMessage[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-260)).current;
  const flatListRef = useRef<FlatList>(null);

  const active = sessions.find((s) => s.id === activeId);
  const messages = active?.messages ?? [];
  const displayMessages = [...messages, ...liveBubbles];

  useEffect(() => {
    (async () => {
      const loaded = await loadSessions();
      const savedId = await getActiveSessionId();
      if (loaded.length === 0) {
        const first = createSession();
        setSessions([first]);
        setActiveId(first.id);
        await saveSessions([first]);
        await setActiveSessionId(first.id);
      } else {
        setSessions(loaded);
        setActiveId(
          savedId && loaded.find((s) => s.id === savedId)
            ? savedId
            : loaded[0].id,
        );
      }
    })();
  }, []);

  const persist = useCallback(async (updated: Session[]) => {
    setSessions(updated);
    await saveSessions(updated);
  }, []);

  const toggleDrawer = useCallback(() => {
    const toValue = drawerOpen ? -260 : 0;
    setDrawerOpen(!drawerOpen);
    Animated.timing(drawerAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, drawerAnim]);

  const switchSession = useCallback(
    (id: string) => {
      setActiveId(id);
      setActiveSessionId(id);
      toggleDrawer();
    },
    [toggleDrawer],
  );

  const newSession = useCallback(async () => {
    const s = createSession();
    const updated = [s, ...sessions];
    await persist(updated);
    setActiveId(s.id);
    await setActiveSessionId(s.id);
    if (drawerOpen) toggleDrawer();
  }, [sessions, persist, drawerOpen, toggleDrawer]);

  const clearChat = useCallback(async () => {
    if (!active) return;
    const updated = sessions.map((s) =>
      s.id === active.id
        ? { ...s, messages: [], updatedAt: Date.now(), title: 'New Chat' }
        : s,
    );
    await persist(updated);
  }, [active, sessions, persist]);

  const deleteSession = useCallback(
    async (id: string) => {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length === 0) remaining.push(createSession());
      await persist(remaining);
      if (activeId === id) {
        setActiveId(remaining[0].id);
        await setActiveSessionId(remaining[0].id);
      }
    },
    [sessions, activeId, persist],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !active) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    const newMessages = [...messages, userMsg];

    const updated = sessions.map((s) =>
      s.id === active.id
        ? {
            ...s,
            messages: newMessages,
            updatedAt: Date.now(),
            title: sessionTitle({ ...s, messages: newMessages }),
          }
        : s,
    );
    await persist(updated);
    setInput('');
    setLoading(true);
    setLiveBubbles([]);

    try {
      const apiMessages: Message[] = newMessages.map(({ role, content }) => ({
        role,
        content,
      }));
      let finalMsg: ChatMessage | null = null;

      await sendChatStream(apiMessages, (event: StreamEvent) => {
        const ts = Date.now();

        if (event.step === 'classifying') {
          setLiveBubbles((prev) => [
            ...prev.filter((b) => b.stepType !== 'classifying'),
            {
              id: `step-classifying-${ts}`,
              role: 'system',
              kind: 'step',
              stepType: 'classifying',
              content: 'Classifying your request…',
            },
          ]);
        } else if (event.step === 'classified') {
          setLiveBubbles((prev) => [
            ...prev.filter((b) => b.stepType !== 'classifying'),
            {
              id: `step-classified-${ts}`,
              role: 'system',
              kind: 'step',
              stepType: 'classified',
              content: `Routed → ${event.node}`,
              node: event.node,
              tier: event.tier,
              reason: event.reason,
              classifierOutput: event.classifier_output,
              classifierLatency: event.classifier_latency,
            },
          ]);
        } else if (event.step === 'generating') {
          setLiveBubbles((prev) => [
            ...prev,
            {
              id: `step-generating-${ts}`,
              role: 'system',
              kind: 'step',
              stepType: 'generating',
              content: `Generating on ${event.node}…`,
              node: event.node,
              tier: event.tier,
            },
          ]);
        } else if (event.step === 'searching') {
          setLiveBubbles((prev) => [
            ...prev,
            {
              id: `step-searching-${ts}`,
              role: 'system',
              kind: 'step',
              stepType: 'searching',
              content: 'Searching the web…',
            },
          ]);
        } else if (event.step === 'search_done') {
          setLiveBubbles((prev) => [
            ...prev.filter((b) => b.stepType !== 'searching'),
            {
              id: `step-search-done-${ts}`,
              role: 'system',
              kind: 'step',
              stepType: 'search_done',
              content: event.content
                ? `🔍 ${event.message} — ${event.content}`
                : `🔍 ${event.message || 'Search complete'}`,
            },
          ]);
        } else if (event.step === 'done') {
          finalMsg = {
            id: (ts + 1).toString(),
            role: 'assistant',
            content: event.content || '',
            route: event.route,
            node: event.node,
            tier: event.tier,
            model: event.model,
            reason: event.reason,
            classifierOutput: event.classifier_output,
            classifierLatency: event.classifier_latency,
            latency: event.latency,
          };
        } else if (event.step === 'error') {
          finalMsg = {
            id: (ts + 1).toString(),
            role: 'assistant',
            kind: 'step',
            stepType: 'error',
            content: event.message || 'Request failed',
          };
        }
      });

      setLiveBubbles([]);

      const allMessages = finalMsg ? [...newMessages, finalMsg] : newMessages;
      const latest = await loadSessions();
      const merged = latest.map((s) =>
        s.id === active.id
          ? {
              ...s,
              messages: allMessages,
              updatedAt: Date.now(),
              title: sessionTitle({ ...s, messages: allMessages }),
            }
          : s,
      );
      await persist(merged);
    } catch (e: any) {
      setLiveBubbles([]);
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${e.message}`,
      };
      const latest = await loadSessions();
      const merged = latest.map((s) =>
        s.id === active.id
          ? { ...s, messages: [...newMessages, errMsg], updatedAt: Date.now() }
          : s,
      );
      await persist(merged);
    } finally {
      setLoading(false);
    }
  }, [input, loading, active, messages, sessions, persist]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    // Step bubbles — minimal inline status
    if (item.kind === 'step') {
      return (
        <View style={st.stepBubble}>
          {item.stepType === 'classifying' && (
            <View style={st.stepRow}>
              <ActivityIndicator size="small" color="#555" />
              <Text style={st.stepText}>{item.content}</Text>
            </View>
          )}
          {item.stepType === 'classified' && (
            <View style={st.stepRow}>
              <View
                style={[
                  st.dot,
                  {
                    backgroundColor:
                      item.tier === 'high-end' ? '#a78bfa' : '#22d3ee',
                  },
                ]}
              />
              <Text style={st.stepText}>
                {item.content}
                <Text style={st.stepDim}>
                  {' '}
                  · {item.tier} · {item.classifierLatency}
                </Text>
              </Text>
            </View>
          )}
          {item.stepType === 'generating' && (
            <View style={st.stepRow}>
              <ActivityIndicator size="small" color="#555" />
              <Text style={st.stepText}>{item.content}</Text>
            </View>
          )}
          {item.stepType === 'searching' && (
            <View style={st.stepRow}>
              <ActivityIndicator size="small" color="#60a5fa" />
              <Text style={[st.stepText, { color: '#60a5fa' }]}>
                {item.content}
              </Text>
            </View>
          )}
          {item.stepType === 'search_done' && (
            <View style={st.stepRow}>
              <View style={[st.dot, { backgroundColor: '#60a5fa' }]} />
              <Text style={st.stepText}>{item.content}</Text>
            </View>
          )}
          {item.stepType === 'error' && (
            <View style={st.stepRow}>
              <View style={[st.dot, { backgroundColor: '#ef4444' }]} />
              <Text style={[st.stepText, { color: '#ef4444' }]}>
                {item.content}
              </Text>
            </View>
          )}
        </View>
      );
    }

    // User bubble
    if (isUser) {
      return (
        <View style={st.userBubble}>
          <Text style={st.userText}>{item.content}</Text>
        </View>
      );
    }

    // AI bubble
    const tierColor =
      item.tier === 'high-end'
        ? '#a78bfa'
        : item.tier === 'low-end'
          ? '#22d3ee'
          : '#555';

    return (
      <View style={st.aiBubble}>
        <Markdown style={mdStyles}>{item.content}</Markdown>
        {item.tier && item.tier !== 'none' && (
          <View style={st.aiMeta}>
            <View style={[st.dot, { backgroundColor: tierColor }]} />
            <Text style={st.metaText}>
              {item.node} · {item.model} · {item.latency}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={st.root}>
      {drawerOpen && <Pressable style={st.overlay} onPress={toggleDrawer} />}

      <Animated.View
        style={[st.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={[st.drawerHead, { paddingTop: insets.top + 16 }]}>
          <Text style={st.drawerTitle}>Sessions</Text>
          <Pressable onPress={newSession} hitSlop={8}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>
        <FlatList
          data={sessions.sort((a, b) => b.updatedAt - a.updatedAt)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={[st.sessionRow, item.id === activeId && st.sessionActive]}
              onPress={() => switchSession(item.id)}
              onLongPress={() =>
                Alert.alert('Delete', `Delete "${item.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteSession(item.id),
                  },
                ])
              }>
              <Text
                style={[
                  st.sessionText,
                  item.id === activeId && { color: '#fff' },
                ]}
                numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={st.sessionSub}>{item.messages.length} msgs</Text>
            </Pressable>
          )}
          contentContainerStyle={{ padding: 8 }}
        />
      </Animated.View>

      <KeyboardAvoidingView
        style={st.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <View style={[st.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={toggleDrawer} hitSlop={8}>
            <Ionicons name="menu" size={22} color="#fff" />
          </Pressable>
          <Text style={st.headerTitle} numberOfLines={1}>
            {active?.title ?? 'Chat'}
          </Text>
          <View style={st.headerActions}>
            {messages.length > 0 && (
              <Pressable
                onPress={() =>
                  Alert.alert('Clear', 'Clear all messages?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: clearChat },
                  ])
                }
                hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#555" />
              </Pressable>
            )}
            <Pressable onPress={newSession} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={st.list}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={st.emptyText}>Send a message to start</Text>
            </View>
          }
        />

        <View style={st.inputRow}>
          <TextInput
            style={st.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor="#444"
            multiline
            editable={!loading}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            disabled={loading || !input.trim()}
            style={[
              st.sendBtn,
              (!input.trim() || loading) && { opacity: 0.3 },
            ]}>
            {loading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#000" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 260,
    backgroundColor: '#0a0a0a',
    zIndex: 20,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#1a1a1a',
  },
  drawerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  drawerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sessionRow: { padding: 12, borderRadius: 8, marginBottom: 2 },
  sessionActive: { backgroundColor: '#1a1a1a' },
  sessionText: { color: '#777', fontSize: 14 },
  sessionSub: { color: '#333', fontSize: 11, marginTop: 2 },

  list: { padding: 16, paddingBottom: 8, flexGrow: 1 },

  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    maxWidth: '80%',
    marginBottom: 6,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },

  aiBubble: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    maxWidth: '90%',
    marginBottom: 6,
  },
  aiText: { color: '#ccc', fontSize: 15, lineHeight: 22 },
  aiMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaText: { color: '#444', fontSize: 11 },

  stepBubble: { alignSelf: 'flex-start', paddingVertical: 3, marginBottom: 3 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: { color: '#555', fontSize: 13 },
  stepDim: { color: '#333' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: { color: '#333', fontSize: 15 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1a1a1a',
  },
  input: {
    flex: 1,
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const mdStyles = StyleSheet.create({
  body: { color: '#ccc', fontSize: 15, lineHeight: 22 },
  heading1: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 8,
  },
  heading2: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
    marginVertical: 6,
  },
  heading3: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginVertical: 4,
  },
  strong: { color: '#fff', fontWeight: '600' },
  em: { color: '#ccc', fontStyle: 'italic' },
  link: { color: '#60a5fa' },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: '#333',
    paddingLeft: 12,
    marginVertical: 6,
  },
  code_inline: {
    backgroundColor: '#1a1a1a',
    color: '#e5e5e5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  fence: {
    backgroundColor: '#0a0a0a',
    color: '#e5e5e5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  paragraph: { marginVertical: 4 },
  hr: {
    backgroundColor: '#1a1a1a',
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  table: { borderColor: '#1a1a1a' },
  thead: { backgroundColor: '#0a0a0a' },
  th: { color: '#fff', fontWeight: '600', padding: 6 },
  td: { color: '#ccc', padding: 6, borderColor: '#1a1a1a' },
  tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#1a1a1a' },
});
