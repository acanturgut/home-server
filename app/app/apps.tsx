import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  listApps,
  buildApp,
  rebuildApp,
  deleteApp,
  stopApp,
  type AppInfo,
  type BuildEvent,
} from '@/lib/api';

// ── Step indicator ────────────────────────────────────────

const STEPS = [
  { key: 'planning', label: 'Plan', icon: 'bulb-outline' },
  { key: 'generating', label: 'Generate', icon: 'code-slash-outline' },
  { key: 'worker_a', label: 'Worker A', icon: 'hardware-chip-outline' },
  { key: 'worker_b', label: 'Worker B', icon: 'hardware-chip-outline' },
  { key: 'merging', label: 'Merge', icon: 'git-merge-outline' },
  { key: 'validating', label: 'Validate', icon: 'checkmark-circle-outline' },
  { key: 'deploying', label: 'Deploy', icon: 'rocket-outline' },
  { key: 'done', label: 'Done', icon: 'checkmark-done-outline' },
] as const;

type StepStatus = 'pending' | 'active' | 'done' | 'error';

function StepTimeline({
  currentStep,
  events,
}: {
  currentStep: string;
  events: BuildEvent[];
}) {
  const stepStatuses: Record<string, StepStatus> = {};
  const stepMessages: Record<string, string> = {};
  const stepLatencies: Record<string, string> = {};

  // Determine status for each step
  const completedSteps = new Set<string>();
  for (const ev of events) {
    completedSteps.add(ev.step);
    stepMessages[ev.step] = ev.message;
    if (ev.latency) stepLatencies[ev.step] = ev.latency;
  }

  for (const step of STEPS) {
    if (step.key === 'done' && completedSteps.has('done')) {
      stepStatuses[step.key] = 'done';
    } else if (completedSteps.has('error') && step.key === currentStep) {
      stepStatuses[step.key] = 'error';
    } else if (step.key === currentStep) {
      stepStatuses[step.key] = 'active';
    } else if (completedSteps.has(step.key)) {
      stepStatuses[step.key] = 'done';
    } else {
      stepStatuses[step.key] = 'pending';
    }
  }

  return (
    <View style={s.timeline}>
      {STEPS.map((step, i) => {
        const status = stepStatuses[step.key] || 'pending';
        const msg = stepMessages[step.key];
        const latency = stepLatencies[step.key];
        const isLast = i === STEPS.length - 1;

        return (
          <View key={step.key} style={s.timelineRow}>
            {/* Connector line */}
            <View style={s.timelineLeft}>
              <View
                style={[
                  s.timelineDot,
                  status === 'active' && s.timelineDotActive,
                  status === 'done' && s.timelineDotDone,
                  status === 'error' && s.timelineDotError,
                ]}>
                {status === 'active' ? (
                  <ActivityIndicator size={12} color="#000" />
                ) : status === 'done' ? (
                  <Ionicons name="checkmark" size={12} color="#000" />
                ) : status === 'error' ? (
                  <Ionicons name="close" size={12} color="#fff" />
                ) : (
                  <View style={s.timelineDotInner} />
                )}
              </View>
              {!isLast && (
                <View
                  style={[
                    s.timelineLine,
                    (status === 'done' || status === 'active') &&
                      s.timelineLineFilled,
                  ]}
                />
              )}
            </View>

            {/* Content */}
            <View style={s.timelineContent}>
              <View style={s.timelineHeader}>
                <Ionicons
                  name={step.icon as any}
                  size={14}
                  color={
                    status === 'active'
                      ? '#a78bfa'
                      : status === 'done'
                        ? '#4ade80'
                        : status === 'error'
                          ? '#f87171'
                          : '#444'
                  }
                />
                <Text
                  style={[
                    s.timelineLabel,
                    status === 'active' && { color: '#a78bfa' },
                    status === 'done' && { color: '#4ade80' },
                    status === 'error' && { color: '#f87171' },
                  ]}>
                  {step.label}
                </Text>
                {latency && <Text style={s.timelineLatency}>{latency}</Text>}
              </View>
              {msg && (
                <Text style={s.timelineMsg} numberOfLines={2}>
                  {msg}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    running: { bg: '#065f4620', text: '#4ade80' },
    building: { bg: '#854d0e20', text: '#facc15' },
    stopped: { bg: '#1e1e1e', text: '#666' },
    failed: { bg: '#7f1d1d20', text: '#f87171' },
  };
  const c = colors[status] || colors.stopped;

  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <View
        style={[
          s.badgeDot,
          { backgroundColor: c.text },
          status === 'building' && s.badgeDotPulse,
        ]}
      />
      <Text style={[s.badgeText, { color: c.text }]}>{status}</Text>
    </View>
  );
}

// ── App Card ──────────────────────────────────────────────

function AppCard({
  app,
  onStop,
  onDelete,
  onRebuild,
}: {
  app: AppInfo;
  onStop: () => void;
  onDelete: () => void;
  onRebuild: (changes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [changeText, setChangeText] = useState('');
  const [showChange, setShowChange] = useState(false);

  return (
    <Pressable style={s.appCard} onPress={() => setExpanded(!expanded)}>
      <View style={s.appCardHeader}>
        <View style={{ flex: 1 }}>
          <View style={s.appCardTitleRow}>
            <Text style={s.appCardName}>{app.name}</Text>
            <StatusBadge status={app.status} />
          </View>
          <Text style={s.appCardMeta}>
            Port {app.port} · {app.type}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#444"
        />
      </View>

      {expanded && (
        <View style={s.appCardBody}>
          <Text style={s.appCardPrompt}>
            <Text style={{ color: '#666' }}>Prompt: </Text>
            {app.prompt}
          </Text>
          {app.error ? <Text style={s.appCardError}>{app.error}</Text> : null}

          <View style={s.appCardActions}>
            {app.status === 'running' && (
              <Pressable
                style={[s.actionBtn, s.actionBtnYellow]}
                onPress={onStop}>
                <Ionicons
                  name="stop-circle-outline"
                  size={16}
                  color="#facc15"
                />
                <Text style={[s.actionBtnText, { color: '#facc15' }]}>
                  Stop
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[s.actionBtn, s.actionBtnPurple]}
              onPress={() => setShowChange(!showChange)}>
              <Ionicons name="create-outline" size={16} color="#a78bfa" />
              <Text style={[s.actionBtnText, { color: '#a78bfa' }]}>
                Request Changes
              </Text>
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionBtnRed]}
              onPress={() =>
                Alert.alert(
                  'Delete App',
                  `Delete ${app.name} and all its files?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: onDelete },
                  ],
                )
              }>
              <Ionicons name="trash-outline" size={16} color="#f87171" />
              <Text style={[s.actionBtnText, { color: '#f87171' }]}>
                Delete
              </Text>
            </Pressable>
          </View>

          {showChange && (
            <View style={s.changeSection}>
              <TextInput
                style={s.changeInput}
                placeholder="Describe the changes..."
                placeholderTextColor="#444"
                value={changeText}
                onChangeText={setChangeText}
                multiline
              />
              <Pressable
                style={[s.buildBtn, !changeText.trim() && s.buildBtnDisabled]}
                disabled={!changeText.trim()}
                onPress={() => {
                  onRebuild(changeText.trim());
                  setChangeText('');
                  setShowChange(false);
                }}>
                <Text style={s.buildBtnText}>Apply Changes</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────

export default function AppsScreen() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [events, setEvents] = useState<BuildEvent[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<'list' | 'build'>('list');
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listApps();
      setApps(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleBuild = async () => {
    if (!prompt.trim() || building) return;
    setBuilding(true);
    setEvents([]);
    setCurrentStep('planning');
    setMode('build');

    try {
      await buildApp(prompt.trim(), (ev) => {
        setEvents((prev) => [...prev, ev]);
        setCurrentStep(ev.step);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          50,
        );
      });
    } catch (e) {
      setEvents((prev) => [
        ...prev,
        {
          step: 'error',
          message: e instanceof Error ? e.message : 'Build failed',
        },
      ]);
      setCurrentStep('error');
    }
    setBuilding(false);
    setPrompt('');
    refresh();
  };

  const handleRebuild = async (name: string, changes: string) => {
    setBuilding(true);
    setEvents([]);
    setCurrentStep('planning');
    setMode('build');

    try {
      await rebuildApp(name, changes, (ev) => {
        setEvents((prev) => [...prev, ev]);
        setCurrentStep(ev.step);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          50,
        );
      });
    } catch (e) {
      setEvents((prev) => [
        ...prev,
        {
          step: 'error',
          message: e instanceof Error ? e.message : 'Rebuild failed',
        },
      ]);
      setCurrentStep('error');
    }
    setBuilding(false);
    refresh();
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteApp(name);
      refresh();
    } catch {}
  };

  const handleStop = async (name: string) => {
    try {
      await stopApp(name);
      refresh();
    } catch {}
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>App Builder</Text>
        <Text style={s.headerSub}>Claude + Distributed LLM Pipeline</Text>
      </View>

      {/* Toggle */}
      <View style={s.toggleRow}>
        <Pressable
          style={[s.toggleBtn, mode === 'list' && s.toggleBtnActive]}
          onPress={() => setMode('list')}>
          <Ionicons
            name="apps-outline"
            size={16}
            color={mode === 'list' ? '#fff' : '#666'}
          />
          <Text style={[s.toggleText, mode === 'list' && s.toggleTextActive]}>
            Apps ({apps.length})
          </Text>
        </Pressable>
        <Pressable
          style={[s.toggleBtn, mode === 'build' && s.toggleBtnActive]}
          onPress={() => setMode('build')}>
          <Ionicons
            name="hammer-outline"
            size={16}
            color={mode === 'build' ? '#fff' : '#666'}
          />
          <Text style={[s.toggleText, mode === 'build' && s.toggleTextActive]}>
            Builder
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor="#666"
          />
        }>
        {mode === 'build' ? (
          <>
            {/* Build prompt */}
            <View style={s.buildSection}>
              <Text style={s.sectionTitle}>
                <Ionicons name="rocket-outline" size={16} color="#a78bfa" /> New
                Build
              </Text>
              <TextInput
                style={s.promptInput}
                placeholder="Describe your app... e.g. 'Build me a todo list with categories'"
                placeholderTextColor="#444"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                editable={!building}
              />
              <Pressable
                style={[
                  s.buildBtn,
                  (building || !prompt.trim()) && s.buildBtnDisabled,
                ]}
                disabled={building || !prompt.trim()}
                onPress={handleBuild}>
                {building ? (
                  <ActivityIndicator size={16} color="#000" />
                ) : (
                  <Ionicons name="flash-outline" size={16} color="#000" />
                )}
                <Text style={s.buildBtnText}>
                  {building ? 'Building...' : 'Build & Deploy'}
                </Text>
              </Pressable>
            </View>

            {/* Pipeline progress */}
            {events.length > 0 && (
              <View style={s.progressSection}>
                <Text style={s.sectionTitle}>
                  <Ionicons
                    name="git-branch-outline"
                    size={16}
                    color="#22d3ee"
                  />{' '}
                  Pipeline
                </Text>
                <StepTimeline currentStep={currentStep} events={events} />

                {/* Detail log */}
                <View style={s.logBox}>
                  {events.map((ev, i) => (
                    <View key={i} style={s.logRow}>
                      <Text
                        style={[
                          s.logStep,
                          ev.step === 'error' && { color: '#f87171' },
                          ev.step === 'done' && { color: '#4ade80' },
                        ]}>
                        [{ev.step}]
                      </Text>
                      <Text style={s.logMsg} numberOfLines={2}>
                        {ev.message}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* App list */}
            {apps.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="cube-outline" size={48} color="#222" />
                <Text style={s.emptyText}>No apps deployed yet</Text>
                <Pressable style={s.emptyBtn} onPress={() => setMode('build')}>
                  <Text style={s.emptyBtnText}>Build Your First App</Text>
                </Pressable>
              </View>
            ) : (
              apps.map((app) => (
                <AppCard
                  key={app.name}
                  app={app}
                  onStop={() => handleStop(app.name)}
                  onDelete={() => handleDelete(app.name)}
                  onRebuild={(changes) => handleRebuild(app.name, changes)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#555', marginTop: 2 },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleBtnActive: { backgroundColor: '#1a1a2e' },
  toggleText: { fontSize: 13, color: '#666', fontWeight: '600' },
  toggleTextActive: { color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Build section
  buildSection: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  promptInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    marginBottom: 12,
  },
  buildBtn: {
    backgroundColor: '#a78bfa',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buildBtnDisabled: { opacity: 0.4 },
  buildBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  // Progress
  progressSection: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },

  // Timeline
  timeline: { marginBottom: 16 },
  timelineRow: { flexDirection: 'row', minHeight: 44 },
  timelineLeft: { width: 28, alignItems: 'center' },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#333',
  },
  timelineDotActive: {
    backgroundColor: '#a78bfa',
    borderColor: '#a78bfa',
  },
  timelineDotDone: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  timelineDotError: {
    backgroundColor: '#f87171',
    borderColor: '#f87171',
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 2,
  },
  timelineLineFilled: { backgroundColor: '#4ade8040' },
  timelineContent: {
    flex: 1,
    marginLeft: 10,
    paddingBottom: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  timelineLatency: {
    fontSize: 11,
    color: '#444',
    marginLeft: 'auto',
    fontFamily: 'Courier',
  },
  timelineMsg: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
    lineHeight: 16,
  },

  // Log box
  logBox: {
    backgroundColor: '#080808',
    borderRadius: 8,
    padding: 10,
    maxHeight: 200,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 6,
  },
  logStep: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#22d3ee',
    width: 80,
  },
  logMsg: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#888',
    flex: 1,
  },

  // Status badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeDotPulse: { opacity: 0.7 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },

  // App card
  appCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    marginBottom: 10,
    overflow: 'hidden',
  },
  appCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  appCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  appCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  appCardMeta: { fontSize: 12, color: '#555' },
  appCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 12,
  },
  appCardPrompt: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
    marginBottom: 12,
  },
  appCardError: {
    fontSize: 12,
    color: '#f87171',
    fontFamily: 'Courier',
    backgroundColor: '#7f1d1d15',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  appCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnYellow: {
    borderColor: '#facc1530',
    backgroundColor: '#facc1508',
  },
  actionBtnPurple: {
    borderColor: '#a78bfa30',
    backgroundColor: '#a78bfa08',
  },
  actionBtnRed: {
    borderColor: '#f8717130',
    backgroundColor: '#f8717108',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },

  // Change section
  changeSection: { marginTop: 12 },
  changeInput: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    marginBottom: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#444',
    marginTop: 12,
    marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: '#a78bfa',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
});
