import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { runDistributed, type DistributedStep } from '@/lib/api';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const EXAMPLE =
  'Build a user registration system in TypeScript: create the input validation logic (email format, password strength, required fields) and the main registration handler with proper error handling, duplicate detection, and success response.';

type FolderKey = 'plan' | 'result' | string; // string for exec step indices

function DirRow({
  icon,
  iconColor,
  label,
  detail,
  open,
  onPress,
  indent,
  children,
}: {
  icon: string;
  iconColor: string;
  label: string;
  detail?: string;
  open: boolean;
  onPress: () => void;
  indent?: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ marginLeft: (indent ?? 0) * 20 }}>
      <Pressable style={s.dirRow} onPress={onPress}>
        <Ionicons
          name={open ? 'folder-open' : 'folder'}
          size={18}
          color={iconColor}
        />
        <Text style={s.dirLabel}>{label}</Text>
        {detail ? <Text style={s.dirDetail}>{detail}</Text> : null}
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color="#444"
          style={{ marginLeft: 'auto' }}
        />
      </Pressable>
      {open && <View style={s.dirContent}>{children}</View>}
    </View>
  );
}

function FileRow({
  icon,
  iconColor,
  label,
  detail,
  indent,
}: {
  icon: string;
  iconColor: string;
  label: string;
  detail?: string;
  indent?: number;
}) {
  return (
    <View style={[s.fileRow, { marginLeft: (indent ?? 0) * 20 }]}>
      <Ionicons name={icon as any} size={15} color={iconColor} />
      <Text style={s.fileLabel}>{label}</Text>
      {detail ? <Text style={s.fileDetail}>{detail}</Text> : null}
    </View>
  );
}

export default function DistributedScreen() {
  const [task, setTask] = useState('');
  const [steps, setSteps] = useState<DistributedStep[]>([]);
  const [finalResult, setFinalResult] = useState('');
  const [totalLatency, setTotalLatency] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((p) => ({ ...p, [key]: !p[key] }));
  };

  const run = async () => {
    const text = task.trim();
    if (!text || loading) return;
    setLoading(true);
    setSteps([]);
    setFinalResult('');
    setTotalLatency('');
    setError('');
    setOpen({});
    try {
      const res = await runDistributed(text);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSteps(res.steps);
      setFinalResult(res.final_result);
      setTotalLatency(res.total_latency);
      // auto-open result
      setOpen({ result: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const planStep = steps.find((s) => s.step === 'planning');
  const execSteps = steps.filter(
    (s) => s.step !== 'planning' && s.step !== 'combine',
  );
  const combineStep = steps.find((s) => s.step === 'combine');

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled">
        {/* Input */}
        <View style={s.inputBox}>
          <TextInput
            style={s.input}
            value={task}
            onChangeText={setTask}
            placeholder="Describe a complex task…"
            placeholderTextColor="#444"
            multiline
            editable={!loading}
          />
          <View style={s.btnRow}>
            <Pressable
              style={[s.runBtn, (loading || !task.trim()) && { opacity: 0.3 }]}
              onPress={run}
              disabled={loading || !task.trim()}>
              {loading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={15} color="#000" />
                  <Text style={s.runText}>Distribute</Text>
                </>
              )}
            </Pressable>
            {!task && (
              <Pressable style={s.exBtn} onPress={() => setTask(EXAMPLE)}>
                <Text style={s.exText}>Example</Text>
              </Pressable>
            )}
          </View>
        </View>

        {error ? (
          <View style={s.errRow}>
            <Ionicons name="alert-circle" size={15} color="#f87171" />
            <Text style={s.errText}>{error}</Text>
          </View>
        ) : null}

        {/* Loading */}
        {loading && steps.length === 0 && (
          <View style={s.loadBox}>
            <ActivityIndicator color="#a78bfa" size="small" />
            <Text style={s.loadText}>Distributing across nodes…</Text>
          </View>
        )}

        {/* Directory tree */}
        {steps.length > 0 && (
          <View style={s.tree}>
            {/* Summary bar */}
            <View style={s.summaryBar}>
              <Ionicons name="timer-outline" size={13} color="#4ade80" />
              <Text style={s.summaryText}>{totalLatency}</Text>
              <View style={s.summaryDot} />
              <Text style={s.summaryText}>{execSteps.length} nodes</Text>
              <View style={s.summaryDot} />
              <Text style={s.summaryText}>{steps.length} steps</Text>
            </View>

            {/* Plan folder */}
            {planStep && (
              <DirRow
                icon="folder"
                iconColor="#facc15"
                label="Plan"
                detail={planStep.latency}
                open={!!open.plan}
                onPress={() => toggle('plan')}>
                {planStep.content ? (
                  <Text style={s.bodyText}>{planStep.content}</Text>
                ) : null}
                {planStep.task
                  ?.split('\n')
                  .filter(Boolean)
                  .map((line, i) => {
                    const isMaster = line.startsWith('Master');
                    return (
                      <FileRow
                        key={i}
                        icon="document-text-outline"
                        iconColor={isMaster ? '#a78bfa' : '#22d3ee'}
                        label={line.replace(/^(Master|Worker):\s*/, '')}
                        detail={isMaster ? 'master' : 'worker'}
                        indent={1}
                      />
                    );
                  })}
              </DirRow>
            )}

            {/* Execution folders */}
            {execSteps.map((step, i) => {
              const key = `exec-${i}`;
              const isMaster = step.step === 'master';
              return (
                <DirRow
                  key={key}
                  icon="folder"
                  iconColor={isMaster ? '#a78bfa' : '#22d3ee'}
                  label={isMaster ? 'Master' : 'Worker'}
                  detail={step.latency}
                  open={!!open[key]}
                  onPress={() => toggle(key)}>
                  <FileRow
                    icon="server-outline"
                    iconColor="#555"
                    label={step.node}
                    detail={step.tier === 'high-end' ? 'high-end' : 'low-end'}
                    indent={1}
                  />
                  {step.task && (
                    <FileRow
                      icon="clipboard-outline"
                      iconColor="#666"
                      label={step.task}
                      indent={1}
                    />
                  )}
                  <View style={[s.mdBox, { marginLeft: 20 }]}>
                    <Markdown style={md}>{step.content}</Markdown>
                  </View>
                </DirRow>
              );
            })}

            {/* Result folder */}
            {(combineStep || finalResult) && (
              <DirRow
                icon="folder"
                iconColor="#4ade80"
                label="Result"
                detail={combineStep?.latency}
                open={!!open.result}
                onPress={() => toggle('result')}>
                {combineStep && (
                  <FileRow
                    icon="git-merge-outline"
                    iconColor="#4ade80"
                    label={combineStep.node}
                    detail="combined"
                    indent={1}
                  />
                )}
                <View style={[s.mdBox, { marginLeft: 20 }]}>
                  <Markdown style={md}>
                    {finalResult || combineStep?.content || ''}
                  </Markdown>
                </View>
              </DirRow>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 16, paddingBottom: 60 },

  // Input
  inputBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
    marginBottom: 16,
  },
  input: {
    color: '#fff',
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  runText: { color: '#000', fontSize: 14, fontWeight: '600' },
  exBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1a1a1a',
  },
  exText: { color: '#555', fontSize: 13 },

  // Error
  errRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  errText: { color: '#f87171', fontSize: 13 },

  // Loading
  loadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadText: { color: '#a78bfa', fontSize: 14 },

  // Tree
  tree: {},

  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  summaryText: { color: '#555', fontSize: 12 },
  summaryDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#333',
  },

  // Directory row
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dirLabel: { color: '#fff', fontSize: 14, fontWeight: '500' },
  dirDetail: { color: '#444', fontSize: 12 },
  dirContent: {
    borderLeftWidth: 1,
    borderLeftColor: '#1a1a1a',
    marginLeft: 12,
    paddingLeft: 4,
  },

  // File row
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  fileLabel: { color: '#999', fontSize: 13, flex: 1 },
  fileDetail: { color: '#444', fontSize: 11 },

  // Body text
  bodyText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  mdBox: { paddingVertical: 4 },
});

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const md = StyleSheet.create({
  body: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  heading1: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 6,
  },
  heading2: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginVertical: 4,
  },
  heading3: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginVertical: 3,
  },
  strong: { color: '#fff', fontWeight: '600' },
  em: { color: '#ccc', fontStyle: 'italic' },
  link: { color: '#60a5fa' },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: '#333',
    paddingLeft: 12,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#1a1a1a',
    color: '#e5e5e5',
    fontFamily: mono,
    fontSize: 12,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: '#111',
    color: '#e5e5e5',
    fontFamily: mono,
    fontSize: 12,
    padding: 10,
    borderRadius: 6,
    marginVertical: 4,
  },
  fence: {
    backgroundColor: '#111',
    color: '#e5e5e5',
    fontFamily: mono,
    fontSize: 12,
    padding: 10,
    borderRadius: 6,
    marginVertical: 4,
  },
  paragraph: { marginVertical: 3 },
  bullet_list: { marginVertical: 2 },
  ordered_list: { marginVertical: 2 },
  list_item: { marginVertical: 1 },
  hr: {
    backgroundColor: '#1a1a1a',
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
});
