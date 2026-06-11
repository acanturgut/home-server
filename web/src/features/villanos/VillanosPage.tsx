import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Heart, Play, Square, RotateCcw, ChevronDown, ChevronUp,
  MapPin, Mic, Users, Tv, Radio, Clock, Volume2, Loader2, Download,
} from 'lucide-react';
import {
  villanosApi,
  type VillaAgent,
  type VillaArc,
  type VillaDialogueTurn,
  type VillaEpisode,
  type VillaEpisodeTimeline,
  type VillaLiveEpisode,
  type VillaScene,
  type VillaState,
  type VillaTTSPreview,
  type VillaVoiceSettings,
} from './api';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

function Avatar({ agent, size = 28 }: { agent: VillaAgent; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-black shrink-0"
      style={{ backgroundColor: agent.avatar_color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(agent.name)}
    </div>
  );
}

function feelingColor(score: number) {
  if (score >= 70) return '#e879f9';
  if (score >= 40) return '#f472b6';
  if (score >= 10) return '#60a5fa';
  if (score >= -10) return '#64748b';
  if (score >= -40) return '#fb923c';
  return '#f43f5e';
}

function statusBadge(agent: VillaAgent) {
  switch (agent.status) {
    case 'coupled':   return { text: `❤ ${agent.coupled_with}`, cls: 'text-pink-400' };
    case 'recoupled': return { text: `↺ ${agent.coupled_with}`, cls: 'text-purple-400' };
    case 'dumped':    return { text: 'Dumped', cls: 'text-red-400' };
    default:          return { text: 'Single', cls: 'text-muted-foreground/60' };
  }
}

const emptyAttributes: VillaAgent['attributes'] = {
  jealousy: 0,
  confidence: 0,
  drama: 0,
  loyalty: 0,
  flirtiness: 0,
  honesty: 0,
  empathy: 0,
  impulsiveness: 0,
  insecurity: 0,
  humor: 0,
  patience: 0,
  commitment: 0,
  strategy: 0,
};

const defaultVoiceSettings: VillaVoiceSettings = {
  elevenlabs_model_id: 'eleven_v3',
  elevenlabs_default_voice_id: '',
  elevenlabs_narrator_voice_id: '',
  elevenlabs_stability: 0.45,
  elevenlabs_similarity: 0.75,
  voice_style_intensity: 0.35,
  conversation_overlap_ms: 420,
  pause_same_speaker_ms: 200,
  pause_different_speaker_ms: 320,
  pause_emotional_ms: 650,
  pause_narrator_ms: 850,
  narrator_auto_play: true,
  character_auto_play: false,
  sound_effects_enabled: false,
  sound_effects_prompt: '',
  sound_effects_duration_seconds: 12,
  sound_effects_volume: 0.18,
  sound_effects_prompt_influence: 0.35,
  sound_effects_model_id: 'eleven_text_to_sound_v2',
};

const analysisTagRe = /<analys?is[^>]*>[\s\S]*?<\/analys?is>/gi;
const openAnalysisTagRe = /<analys?is[^>]*>[\s\S]*?(?:---|$)/gi;

function cleanDisplayText(text?: string) {
  if (!text) return '';
  return text
    .replace(analysisTagRe, '')
    .replace(openAnalysisTagRe, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-—]+\s*/, '')
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEmotionLabel(emotion?: string) {
  const label = (emotion ?? '').replace(/[_-]/g, ' ').trim();
  return label && label !== 'calm' ? label : '';
}

function allTurns(scenes: VillaScene[]) {
  return scenes.flatMap((scene) => (scene.turns ?? []).map((turn) => ({ scene, turn })));
}

const voiceAudioCache = new Map<string, Blob>();
const ambienceAudioCache = new Map<string, Blob>();

function turnAudioKey(turn: VillaDialogueTurn) {
  return `${turn.agent_id}:${turn.time}:${turn.emotion ?? ''}:${turn.content}`;
}

async function fetchTurnAudio(turn: VillaDialogueTurn, content: string) {
  const key = turnAudioKey(turn);
  const cached = voiceAudioCache.get(key);
  if (cached) return cached;
  const blob = await fetchVoiceWithRetry(turn.agent_id, content, turn.emotion);
  voiceAudioCache.set(key, blob);
  return blob;
}

async function fetchNarratorAudio(entry: NarratorEntry, content: string) {
  const emotion = narratorEmotion(entry.label);
  const key = `narrator:${entry.label}:${emotion}:${content}`;
  const cached = voiceAudioCache.get(key);
  if (cached) return cached;
  const blob = await fetchVoiceWithRetry('narrator', content, emotion);
  voiceAudioCache.set(key, blob);
  return blob;
}

function narratorEmotion(label: string) {
  if (label.toLowerCase().includes('closing')) return 'excited';
  if (label.toLowerCase().includes('scene')) return 'curious';
  return 'mischievous';
}

function sceneAmbiencePrompt(scene: VillaScene, settings: VillaVoiceSettings) {
  const custom = settings.sound_effects_prompt.trim();
  const location = cleanDisplayText(scene.location) || 'the villa';
  const narration = cleanDisplayText(scene.narration);
  const context = narration ? ` Scene mood: ${narration.slice(0, 220)}.` : '';
  const customText = custom ? ` ${custom}` : '';
  return [
    `Seamless looping reality TV villa ambience at ${location}.`,
    'Subtle poolside air, soft room tone, distant villa movement, gentle warm background texture, no speech, no lyrics.',
    context,
    customText,
  ].join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchSceneAmbience(scene: VillaScene, settings: VillaVoiceSettings) {
  const prompt = sceneAmbiencePrompt(scene, settings);
  const duration = settings.sound_effects_duration_seconds;
  const influence = settings.sound_effects_prompt_influence;
  const model = settings.sound_effects_model_id;
  const key = `${model}:${duration}:${influence}:${prompt}`;
  const cached = ambienceAudioCache.get(key);
  if (cached) return cached;
  const blob = await villanosApi.soundEffect(prompt, duration, true, influence, model);
  ambienceAudioCache.set(key, blob);
  return blob;
}

async function fetchVoiceWithRetry(agentId: string, content: string, emotion?: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await villanosApi.tts(agentId, content, emotion);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const retryable =
        msg.includes('concurrent_limit_exceeded') ||
        msg.includes('rate') ||
        msg.includes('too many') ||
        msg.includes('429') ||
        msg.includes('busy');
      if (!retryable || attempt === 3) break;
      await wait(1800 + attempt * 1400);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playBlob(blob: Blob) {
  return new Promise<void>((resolve, reject) => {
    const item = createManagedAudio(blob, 1);
    item.ended.then(resolve).catch(reject);
    item.audio.play().catch((err) => {
      item.cleanup();
      reject(err);
    });
  });
}

type ManagedAudio = {
  audio: HTMLAudioElement;
  cleanup: () => void;
  ended: Promise<void>;
};

type SceneAudioItem = {
  key: string;
  kind: 'narrator' | 'dialogue';
  agentId: string;
  actorId?: string;
  emotion?: string;
  content: string;
  blob: Blob;
};

function createManagedAudio(blob: Blob, volume: number, loop = false): ManagedAudio {
  if (blob.size === 0) {
    throw new Error('empty audio blob');
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = clampVolume(volume);
  audio.loop = loop;
  audio.src = url;
  audio.load();

  const cleanup = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  };

  const ended = new Promise<void>((resolve, reject) => {
    let settled = false;
    audio.addEventListener('ended', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, { once: true });
    audio.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      const code = audio.error?.code;
      cleanup();
      reject(new Error(code ? `audio playback failed (${code})` : 'audio playback failed'));
    }, { once: true });
  });

  return { audio, cleanup, ended };
}

async function playSceneAudioQueue(
  items: SceneAudioItem[],
  settings: VillaVoiceSettings,
  onPlaying: (key: string | null) => void,
) {
  if (items.length === 0) return;

  const managed = await Promise.all(items.map(async (item) => {
    const audio = createManagedAudio(item.blob, 1);
    await waitForAudioReady(audio.audio);
    return { item, audio };
  }));

  if (managed.length === 1) {
    onPlaying(managed[0].item.key);
    await managed[0].audio.audio.play();
    await managed[0].audio.ended;
    onPlaying(null);
    return;
  }

  let current = managed[0];
  onPlaying(current.item.key);
  await current.audio.audio.play();

  for (let i = 1; i < managed.length; i += 1) {
    const next = managed[i];
    const transition = sceneAudioTransition(current.item, next.item, settings);

    if (transition.mode === 'pause') {
      await current.audio.ended.catch(() => undefined);
      onPlaying(null);
      if (transition.pauseMs > 0) await wait(transition.pauseMs);
      next.audio.audio.volume = 1;
      onPlaying(next.item.key);
      await next.audio.audio.play();
      current = next;
      continue;
    }

    await waitForCrossfadePoint(current.audio.audio, transition.overlapMs);
    next.audio.audio.volume = 0;
    onPlaying(next.item.key);
    await next.audio.audio.play();

    await Promise.all([
      fadeVolume(current.audio.audio, 0.78, transition.overlapMs),
      fadeVolume(next.audio.audio, 1, transition.overlapMs),
      current.audio.ended.catch(() => undefined),
    ]);

    current = next;
  }

  await current.audio.ended;
  onPlaying(null);
}

function sceneAudioTransition(current: SceneAudioItem, next: SceneAudioItem, settings: VillaVoiceSettings) {
  if (current.kind === 'narrator' || next.kind === 'narrator') {
    return { mode: 'pause' as const, pauseMs: settings.pause_narrator_ms };
  }
  if (current.actorId && next.actorId && current.actorId === next.actorId) {
    return { mode: 'pause' as const, pauseMs: settings.pause_same_speaker_ms };
  }
  if (isEmotionalAudio(current.emotion) || isEmotionalAudio(next.emotion)) {
    return { mode: 'pause' as const, pauseMs: settings.pause_emotional_ms };
  }
  return {
    mode: 'overlap' as const,
    overlapMs: Math.max(0, Math.min(settings.conversation_overlap_ms, settings.pause_different_speaker_ms || 450)),
  };
}

function isEmotionalAudio(emotion?: string) {
  const e = (emotion ?? '').toLowerCase();
  return ['sad', 'sighs', 'exhales', 'nervous', 'hesitates', 'angry', 'frustrated'].includes(e);
}

function waitForAudioReady(audio: HTMLAudioElement) {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('loadedmetadata', finish);
      audio.removeEventListener('canplaythrough', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 4000);
    audio.addEventListener('loadedmetadata', finish, { once: true });
    audio.addEventListener('canplaythrough', finish, { once: true });
  });
}

function waitForCrossfadePoint(audio: HTMLAudioElement, overlapMs: number) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('loadedmetadata', check);
      audio.removeEventListener('durationchange', check);
      audio.removeEventListener('timeupdate', check);
      window.clearInterval(timer);
      resolve();
    };
    const check = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const target = Math.max(0, audio.duration - overlapMs / 1000);
      if (audio.currentTime >= target) finish();
    };
    const timer = window.setInterval(check, 80);
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('loadedmetadata', check);
    audio.addEventListener('durationchange', check);
    audio.addEventListener('timeupdate', check);
    check();
  });
}

function fadeVolume(audio: HTMLAudioElement, target: number, durationMs: number) {
  const from = audio.volume;
  const to = clampVolume(target);
  if (durationMs <= 0) {
    audio.volume = to;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      audio.volume = clampVolume(from + (to - from) * progress);
      if (progress >= 1) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createMergedSceneMp3(items: SceneAudioItem[]) {
  return new Blob(items.map((item) => item.blob), { type: 'audio/mpeg' });
}

function safeFileSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'voice';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function formatDurationMs(ms?: number) {
  if (!ms || ms <= 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ─── Dialogue message ─────────────────────────────────────────────────────────

function DialogueBubble({
  turn,
  agent,
  playing,
}: {
  turn: VillaDialogueTurn;
  agent: VillaAgent | undefined;
  playing?: boolean;
}) {
  const color = agent?.avatar_color ?? '#888';
  const content = cleanDisplayText(turn.content);
  const emotion = cleanEmotionLabel(turn.emotion);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [preview, setPreview] = useState<VillaTTSPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  if (!content) return null;

  const playVoice = async () => {
    if (loadingVoice) return;
    setLoadingVoice(true);
    try {
      const audioBlob = await villanosApi.tts(turn.agent_id, content, turn.emotion);
      await playBlob(audioBlob);
    } catch (err) {
      console.warn('VillaOS voice failed', err);
    } finally {
      setLoadingVoice(false);
    }
  };

  const showEmotionPayload = async () => {
    if (loadingPreview) return;
    setLoadingPreview(true);
    try {
      setPreview(await villanosApi.ttsPreview(turn.agent_id, content, turn.emotion));
    } catch (err) {
      console.warn('VillaOS TTS preview failed', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className={`flex items-start gap-3 transition-opacity ${playing ? 'opacity-100' : 'opacity-90'}`}>
      {agent ? (
        <Avatar agent={agent} size={36} />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted/30 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color }}>{turn.agent_name}</span>
          {emotion && (
            <button
              type="button"
              onClick={showEmotionPayload}
              title="Show exact ElevenLabs payload"
              className="rounded-full border border-border/20 bg-muted/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-muted/35 transition-colors"
            >
              {emotion}
            </button>
          )}
          <button
            type="button"
            onClick={playVoice}
            disabled={loadingVoice}
            title="Play voice"
            className="h-5 w-5 rounded-full border border-border/20 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 disabled:opacity-50 inline-flex items-center justify-center transition-colors"
          >
            {loadingVoice ? <Loader2 size={10} className="animate-spin" /> : <Volume2 size={10} />}
          </button>
        </div>
        <div className={`mt-1 border rounded-2xl rounded-tl-sm px-4 py-3 transition-colors ${
          playing ? 'bg-pink-500/10 border-pink-400/35' : 'bg-card/50 border-border/20'
        }`}>
          <p className="text-sm leading-relaxed text-foreground/90">{content}</p>
        </div>
        {preview && (
          <div className="mt-2 rounded-lg border border-yellow-400/25 bg-yellow-400/10 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-yellow-300/80">
                ElevenLabs payload
              </span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-[10px] text-muted-foreground/70 hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-border/15 bg-black/25 p-2 text-[10px] leading-relaxed text-yellow-50/85">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Scene viewer ─────────────────────────────────────────────────────────────

function SceneViewer({
  scene,
  agentMap,
  isActive,
  voiceSettings,
  autoPlay,
}: {
  scene: VillaScene;
  agentMap: Record<string, VillaAgent>;
  isActive: boolean;
  voiceSettings: VillaVoiceSettings;
  autoPlay?: boolean;
}) {
  const turns = scene.turns ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'downloading' | 'playing' | 'error'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'preparing' | 'error'>('idle');
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const autoPlayedRef = useRef<Set<string>>(new Set());
  const playableTurns = useMemo(
    () => turns
      .map((turn) => ({ turn, content: cleanDisplayText(turn.content) }))
      .filter((item) => item.content),
    [turns],
  );

  useEffect(() => {
    if (isActive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, isActive]);

  const buildSceneAudioItems = async (includeNarrator: boolean): Promise<SceneAudioItem[]> => {
    const items: SceneAudioItem[] = [];
    const narration = cleanDisplayText(scene.narration);
    if (includeNarrator && narration) {
      items.push({
        key: `${scene.id}:narrator`,
        kind: 'narrator',
        agentId: 'narrator',
        emotion: narratorEmotion(`Scene ${scene.id}`),
        content: narration,
        blob: await fetchNarratorAudio({ label: `Scene ${scene.id}`, text: narration }, narration),
      });
    }
    for (const { turn, content } of playableTurns) {
      items.push({
        key: `${turn.time}:${turn.agent_id}`,
        kind: 'dialogue',
        agentId: turn.agent_id,
        actorId: turn.agent_id,
        emotion: turn.emotion,
        content,
        blob: await fetchTurnAudio(turn, content),
      });
    }
    return items;
  };

  const playScene = async (includeNarrator = true) => {
    if (voiceStatus === 'downloading' || voiceStatus === 'playing' || playableTurns.length === 0) return;
    setVoiceStatus('downloading');
    let ambience: ManagedAudio | null = null;
    try {
      const ambienceBlob = voiceSettings.sound_effects_enabled
        ? await fetchSceneAmbience(scene, voiceSettings)
        : null;
      const items = await buildSceneAudioItems(includeNarrator);
      if (ambienceBlob) {
        ambience = createManagedAudio(ambienceBlob, voiceSettings.sound_effects_volume, true);
        await waitForAudioReady(ambience.audio);
      }
      setVoiceStatus('playing');
      if (ambience) {
        ambience.audio.volume = clampVolume(voiceSettings.sound_effects_volume);
        await ambience.audio.play();
      }
      await playSceneAudioQueue(items, voiceSettings, setPlayingKey);
      if (ambience) {
        await fadeVolume(ambience.audio, 0, 800);
        ambience.cleanup();
        ambience = null;
      }
      setVoiceStatus('idle');
    } catch (err) {
      console.warn('VillaOS scene voice failed', err);
      if (ambience) ambience.cleanup();
      setPlayingKey(null);
      setVoiceStatus('error');
      window.setTimeout(() => setVoiceStatus('idle'), 1800);
    }
  };

  const downloadSceneVoices = async () => {
    if (downloadStatus === 'preparing' || playableTurns.length === 0) return;
    setDownloadStatus('preparing');
    try {
      const items = await buildSceneAudioItems(true);
      const mp3 = createMergedSceneMp3(items);
      triggerDownload(mp3, `${safeFileSegment(scene.location || scene.id)}-voices.mp3`);
      setDownloadStatus('idle');
    } catch (err) {
      console.warn('VillaOS scene voice download failed', err);
      setDownloadStatus('error');
      window.setTimeout(() => setDownloadStatus('idle'), 1800);
    }
  };

  useEffect(() => {
    if (!autoPlay || isActive || playableTurns.length === 0) return;
    const key = `${scene.id}:${playableTurns.length}`;
    if (autoPlayedRef.current.has(key)) return;
    autoPlayedRef.current.add(key);
    void playScene(false);
  }, [autoPlay, isActive, scene.id, playableTurns.length]);

  return (
    <div className="my-6">
      {/* Location header */}
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{scene.location}</span>
        <div className="flex-1 h-px bg-border/20" />
        {!isActive && playableTurns.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void downloadSceneVoices()}
              disabled={downloadStatus === 'preparing'}
              title="Download narrator and dialogue voice files"
              className="inline-flex items-center gap-1 rounded-full border border-border/25 px-2 py-1 text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/25 disabled:opacity-60 transition-colors"
            >
              {downloadStatus === 'preparing' ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Download size={10} />
              )}
              {downloadStatus === 'preparing'
                ? 'Preparing'
                : downloadStatus === 'error'
                  ? 'Download error'
                  : 'Download voices'}
            </button>
            <button
              type="button"
              onClick={() => void playScene(true)}
              disabled={voiceStatus === 'downloading' || voiceStatus === 'playing'}
              title="Download and play full scene"
              className="inline-flex items-center gap-1 rounded-full border border-border/25 px-2 py-1 text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/25 disabled:opacity-60 transition-colors"
            >
              {voiceStatus === 'downloading' ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Volume2 size={10} />
              )}
              {voiceStatus === 'downloading'
                ? 'Downloading'
                : voiceStatus === 'playing'
                  ? 'Playing'
                  : voiceStatus === 'error'
                    ? 'Voice error'
                    : 'Play scene'}
            </button>
          </div>
        )}
      </div>

      {/* Dialogue */}
      <div className="space-y-4">
        {turns.map((turn, i) => (
          <DialogueBubble
            key={i}
            turn={turn}
            agent={agentMap[turn.agent_id]}
            playing={playingKey === `${turn.time}:${turn.agent_id}`}
          />
        ))}

        {/* Typing indicator on active scene */}
        {isActive && turns.length > 0 && (
          <div className="flex items-center gap-2 pl-12">
            <div className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        {isActive && turns.length === 0 && (
          <div className="flex justify-center py-4">
            <div className="flex gap-1.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Episode viewer ───────────────────────────────────────────────────────────

type NarratorEntry = {
  label: string;
  text: string;
  active?: boolean;
};

function NarratorRail({ entries, autoPlay = false }: { entries: NarratorEntry[]; autoPlay?: boolean }) {
  const visible = entries.filter((entry) => cleanDisplayText(entry.text));
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const playedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const entriesKey = visible
    .map((entry) => `${entry.label}:${cleanDisplayText(entry.text)}`)
    .join('|');

  const playNarrator = async (entry: NarratorEntry) => {
    const content = cleanDisplayText(entry.text);
    if (!content) return;
    const key = `${entry.label}:${content}`;
    setPlayingKey(key);
    try {
      const audioBlob = await fetchNarratorAudio(entry, content);
      await playBlob(audioBlob);
    } catch (err) {
      console.warn('VillaOS narrator voice failed', err);
    } finally {
      setPlayingKey((current) => (current === key ? null : current));
    }
  };

  useEffect(() => {
    if (!autoPlay || visible.length === 0) return;
    const pending = visible
      .map((entry) => ({ entry, content: cleanDisplayText(entry.text) }))
      .filter(({ content }) => content)
      .filter(({ entry, content }) => !playedRef.current.has(`${entry.label}:${content}`));

    if (pending.length === 0) return;
    for (const { entry, content } of pending) {
      playedRef.current.add(`${entry.label}:${content}`);
    }

    queueRef.current = queueRef.current
      .then(async () => {
        for (const { entry } of pending) {
          await playNarrator(entry);
          await wait(250);
        }
      })
      .catch((err) => {
        console.warn('VillaOS narrator queue failed', err);
      });
  }, [autoPlay, entriesKey]);

  return (
    <aside className="min-h-0 overflow-y-auto border-r border-border/20 bg-background/60">
      <div className="sticky top-0 z-10 bg-background/95 px-4 py-3 border-b border-border/15">
        <div className="flex items-center gap-2 text-yellow-400">
          <Mic size={13} />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Narrator</span>
        </div>
      </div>
      <div className="p-3 space-y-3">
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground/50 italic px-1">Waiting for narration...</p>
        )}
        {visible.map((entry, i) => (
          <div
            key={`${entry.label}-${i}`}
            className={`rounded-lg border px-3 py-2.5 ${
              entry.active ? 'border-yellow-400/40 bg-yellow-400/10' : 'border-border/20 bg-card/20'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[10px] text-muted-foreground/55 uppercase tracking-widest">{entry.label}</div>
              <button
                type="button"
                onClick={() => void playNarrator(entry)}
                disabled={playingKey === `${entry.label}:${cleanDisplayText(entry.text)}`}
                title="Play narrator"
                className="h-5 w-5 rounded-full border border-border/20 text-yellow-400/70 hover:text-yellow-300 hover:bg-yellow-400/10 disabled:opacity-60 inline-flex items-center justify-center transition-colors"
              >
                {playingKey === `${entry.label}:${cleanDisplayText(entry.text)}` ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Volume2 size={10} />
                )}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-yellow-50/80 italic">{cleanDisplayText(entry.text)}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function LatestRail({
  scenes,
  agentMap,
  phase,
  activeSceneIdx,
}: {
  scenes: VillaScene[];
  agentMap: Record<string, VillaAgent>;
  phase?: string;
  activeSceneIdx?: number;
}) {
  const latest = allTurns(scenes).slice(-6).reverse();
  const activeScene = typeof activeSceneIdx === 'number' ? scenes[activeSceneIdx] : scenes[scenes.length - 1];

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-border/20 bg-background/60">
      <div className="sticky top-0 z-10 bg-background/95 px-4 py-3 border-b border-border/15">
        <div className="flex items-center gap-2 text-pink-400">
          <Radio size={13} />
          <span className="text-[10px] font-semibold uppercase tracking-widest">Latest</span>
        </div>
      </div>
      <div className="p-3 space-y-4">
        <div className="rounded-lg border border-border/20 bg-card/25 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/55 mb-1">
            <Clock size={10} /> Now
          </div>
          <p className="text-xs text-foreground/75">{phase ?? 'Episode complete'}</p>
          {activeScene && (
            <p className="text-[11px] text-muted-foreground/60 mt-1">{activeScene.location}</p>
          )}
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-2">Scenes</div>
          <div className="space-y-1.5">
            {scenes.map((scene, i) => (
              <div
                key={scene.id}
                className={`rounded-lg border px-2.5 py-2 ${
                  i === activeSceneIdx ? 'border-pink-500/35 bg-pink-500/10' : 'border-border/15 bg-card/15'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} className="text-muted-foreground/45 shrink-0" />
                  <span className="text-[11px] text-foreground/75 truncate">{scene.location}</span>
                  <span className="text-[10px] text-muted-foreground/45 ml-auto">{scene.turns?.length ?? 0}</span>
                </div>
              </div>
            ))}
            {scenes.length === 0 && (
              <p className="text-xs text-muted-foreground/45 italic">No scenes yet.</p>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-2">Recent lines</div>
          <div className="space-y-2">
            {latest.map(({ turn }, i) => {
              const agent = agentMap[turn.agent_id];
              const content = cleanDisplayText(turn.content);
              const emotion = cleanEmotionLabel(turn.emotion);
              if (!content) return null;
              return (
                <div key={`${turn.time}-${i}`} className="rounded-lg border border-border/15 bg-card/15 px-2.5 py-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold" style={{ color: agent?.avatar_color ?? '#aaa' }}>
                      {turn.agent_name}
                    </span>
                    {emotion && (
                      <span className="rounded-full bg-muted/20 px-1.5 py-px text-[8px] uppercase tracking-wider text-muted-foreground/50">
                        {emotion}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-foreground/70 line-clamp-2">{content}</p>
                </div>
              );
            })}
            {latest.length === 0 && (
              <p className="text-xs text-muted-foreground/45 italic">Waiting for the first line.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function EpisodeFrame({
  episodeNum,
  title,
  subtitle,
  live,
  scenes,
  activeSceneIdx,
  narratorEntries,
  agentMap,
  voiceSettings,
  timeline,
  actions,
}: {
  episodeNum: number;
  title: string;
  subtitle: string;
  live?: boolean;
  scenes: VillaScene[];
  activeSceneIdx?: number;
  narratorEntries: NarratorEntry[];
  agentMap: Record<string, VillaAgent>;
  voiceSettings: VillaVoiceSettings;
  timeline?: VillaEpisodeTimeline;
  actions?: ReactNode;
}) {
  const timelineLabel = timeline
    ? `${formatDurationMs(timeline.estimated_duration_ms)} planned / ${formatDurationMs(timeline.target_duration_ms)} target`
    : '';

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[280px_minmax(360px,1fr)_300px] overflow-hidden">
      <NarratorRail entries={narratorEntries} autoPlay={live === true && voiceSettings.narrator_auto_play} />

      <main className="min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Tv size={14} className="text-pink-400" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Episode {episodeNum}
                </span>
                {live && (
                  <span className="text-[10px] bg-yellow-400/15 text-yellow-400 rounded-full px-2 py-px animate-pulse font-medium">
                    LIVE
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground leading-tight truncate">"{title || `Episode ${episodeNum}`}"</h2>
              <p className="text-[11px] text-muted-foreground/60 mt-1 italic">
                {subtitle}
                {timelineLabel && <span className="not-italic"> · {timelineLabel}</span>}
              </p>
            </div>
            {actions}
          </div>

          {scenes.map((scene, i) => (
            <SceneViewer
              key={scene.id}
              scene={scene}
              agentMap={agentMap}
              isActive={live === true && i === activeSceneIdx}
              voiceSettings={voiceSettings}
              autoPlay={live === true && voiceSettings.character_auto_play}
            />
          ))}

          {scenes.length === 0 && (
            <div className="text-center py-12 text-xs text-muted-foreground/55 italic">
              The episode is warming up...
            </div>
          )}
        </div>
      </main>

      <LatestRail
        scenes={scenes}
        agentMap={agentMap}
        phase={subtitle}
        activeSceneIdx={activeSceneIdx}
      />
    </div>
  );
}

function LiveEpisodeViewer({
  live,
  agentMap,
  voiceSettings,
  onStop,
}: {
  live: VillaLiveEpisode;
  agentMap: Record<string, VillaAgent>;
  voiceSettings: VillaVoiceSettings;
  onStop: () => void;
}) {
  const phaseLabel: Record<string, string> = {
    opening: 'Opening',
    scene: 'Scene in progress',
    closing: 'Writing closing narration',
    updating: 'Updating the Villa',
  };
  const scenes = live.scenes ?? [];
  const narratorEntries: NarratorEntry[] = [
    { label: 'Opening', text: live.opening, active: live.phase === 'opening' },
    ...scenes.map((scene, i) => ({
      label: `Scene ${i + 1}`,
      text: scene.narration,
      active: live.phase === 'scene' && i === live.active_scene_idx,
    })),
  ];

  return (
    <EpisodeFrame
      episodeNum={live.episode_num}
      title={live.title}
      subtitle={phaseLabel[live.phase] ?? ''}
      live
      scenes={scenes}
      activeSceneIdx={live.active_scene_idx}
      narratorEntries={narratorEntries}
      agentMap={agentMap}
      voiceSettings={voiceSettings}
      timeline={live.timeline}
      actions={(
        <button
          onClick={onStop}
          className="shrink-0 text-xs border border-border/30 text-muted-foreground rounded-lg px-2.5 py-1.5 hover:bg-muted/30 transition-colors"
        >
          Clear
        </button>
      )}
    />
  );
}

function PastEpisodeViewer({
  episode,
  agentMap,
  voiceSettings,
  onClose,
}: {
  episode: VillaEpisode;
  agentMap: Record<string, VillaAgent>;
  voiceSettings: VillaVoiceSettings;
  onClose: () => void;
}) {
  const scenes = episode.scenes ?? [];
  const narratorEntries: NarratorEntry[] = [
    { label: 'Opening', text: episode.opening },
    ...scenes.map((scene, i) => ({ label: `Scene ${i + 1}`, text: scene.narration })),
    { label: 'Closing', text: episode.closing },
  ];

  return (
    <EpisodeFrame
      episodeNum={episode.number}
      title={episode.title}
      subtitle="Episode replay"
      scenes={scenes}
      narratorEntries={narratorEntries}
      agentMap={agentMap}
      voiceSettings={voiceSettings}
      timeline={episode.timeline}
      actions={(
        <button onClick={onClose} className="text-xs text-muted-foreground border border-border/30 rounded-lg px-2.5 py-1.5 hover:bg-muted/30">
          Close
        </button>
      )}
    />
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, allAgents }: { agent: VillaAgent; allAgents: VillaAgent[] }) {
  const [expanded, setExpanded] = useState(false);
  const sb = statusBadge(agent);
  const attrs = { ...emptyAttributes, ...(agent.attributes ?? {}) };
  const others = allAgents.filter((a) => a.id !== agent.id);
  const attrRows = [
    { label: 'Drama', val: attrs.drama, color: '#f43f5e' },
    { label: 'Flirt', val: attrs.flirtiness, color: '#fb923c' },
    { label: 'Loyal', val: attrs.loyalty, color: '#4ade80' },
    { label: 'Honest', val: attrs.honesty, color: '#60a5fa' },
    { label: 'Empathy', val: attrs.empathy, color: '#2dd4bf' },
    { label: 'Impulse', val: attrs.impulsiveness, color: '#f97316' },
    { label: 'Secure', val: 100 - attrs.insecurity, color: '#a78bfa' },
    { label: 'Humor', val: attrs.humor, color: '#facc15' },
    { label: 'Patience', val: attrs.patience, color: '#22c55e' },
    { label: 'Commit', val: attrs.commitment, color: '#ec4899' },
    { label: 'Strategy', val: attrs.strategy, color: '#818cf8' },
    { label: 'Jealous', val: attrs.jealousy, color: '#ef4444' },
    { label: 'Conf', val: attrs.confidence, color: '#38bdf8' },
  ];

  return (
    <div className="bg-card/40 border border-border/25 rounded-xl overflow-hidden">
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
            <Avatar agent={agent} size={36} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{agent.name}, {agent.age}</div>
            <div className={`text-xs mt-px ${sb.cls}`}>{sb.text}</div>
            {agent.origin && (
              <div className="text-[10px] text-muted-foreground/50 mt-px truncate">{agent.origin}</div>
            )}
          </div>
          {(agent.memories?.length ?? 0) > 0 && (
            <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground/40 hover:text-muted-foreground/70 pt-0.5">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground/70 leading-snug line-clamp-2 mb-2.5">{agent.personality}</p>

        {/* Attribute bars */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2.5">
          {attrRows.map(({ label, val, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground/50 w-10 shrink-0 truncate">{label}</span>
              <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, val))}%`, backgroundColor: color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Feelings row */}
        {others.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {others.map((other) => {
              const f = agent.feelings?.[other.id];
              const bg = f ? feelingColor(f.score) : '#1e293b';
              const border = f ? `${feelingColor(f.score)}50` : '#334155';
              const title = f ? `${other.name}: ${f.score > 0 ? '+' : ''}${f.score} — ${f.note}` : `${other.name}: no feelings yet`;
              return (
                <div key={other.id} title={title}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold cursor-default hover:scale-110 transition-transform shrink-0"
                  style={{ backgroundColor: bg, border: `1.5px solid ${border}`, color: f ? '#000' : '#64748b' }}
                >
                  {other.name[0]}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (agent.memories?.length ?? 0) > 0 && (
        <div className="border-t border-border/15 px-3 py-2.5 bg-card/20">
          <div className="text-[10px] text-muted-foreground font-medium mb-1.5">Memories</div>
          {agent.memories.slice(-5).map((m, i) => (
            <p key={i} className="text-[11px] text-foreground/60 leading-snug mb-0.5">• {m}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Arc panel ────────────────────────────────────────────────────────────────

function ArcSidebar({ arc }: { arc: VillaArc }) {
  return (
    <div className="space-y-3">
      {arc.episode_num > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">Current drama</div>
          <p className="text-xs text-foreground/80 leading-snug italic">"{arc.current_drama}"</p>
        </div>
      )}

      {(arc.active_dramas?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-orange-400/70 uppercase tracking-widest mb-1">Active</div>
          {arc.active_dramas.map((d, i) => (
            <p key={i} className="text-[11px] text-foreground/65 leading-snug mb-0.5">• {d}</p>
          ))}
        </div>
      )}

      {(arc.ongoing_tensions?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-yellow-400/60 uppercase tracking-widest mb-1">Tensions</div>
          {arc.ongoing_tensions.map((t, i) => (
            <p key={i} className="text-[11px] text-foreground/65 leading-snug mb-0.5">• {t}</p>
          ))}
        </div>
      )}

      {(arc.recent_events?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">Recent</div>
          {arc.recent_events.slice(0, 4).map((e, i) => (
            <p key={i} className="text-[11px] text-muted-foreground/60 leading-snug mb-0.5">• {e}</p>
          ))}
        </div>
      )}

      {arc.episode_num === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">No episodes yet — press Start Episode.</p>
      )}
    </div>
  );
}

// ─── Episode history item ─────────────────────────────────────────────────────

function EpisodeListItem({
  episode,
  isLatest,
  onOpen,
}: {
  episode: VillaEpisode;
  isLatest: boolean;
  onOpen: () => void;
}) {
  const date = new Date(episode.time).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const turns = episode.scenes?.reduce((n, s) => n + (s.turns?.length ?? 0), 0) ?? 0;

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
        isLatest ? 'border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10' : 'border-border/20 bg-card/20 hover:bg-muted/20'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] text-muted-foreground/60">Ep {episode.number}</span>
        {isLatest && <span className="text-[9px] text-pink-400 bg-pink-500/10 rounded-full px-1.5 py-px">latest</span>}
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{date}</span>
      </div>
      <p className="text-xs font-medium text-foreground/80 truncate">"{episode.title}"</p>
      <p className="text-[10px] text-muted-foreground/50 mt-px">{episode.scenes?.length ?? 0} scenes · {turns} lines</p>
    </button>
  );
}

// ─── Idle dashboard (no active episode) ──────────────────────────────────────

function IdleDashboard({ state, onOpen }: { state: VillaState; onOpen: (ep: VillaEpisode) => void }) {
  const agents = state.agents ?? [];
  const episodes = [...(state.episodes ?? [])].reverse();

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* Left: arc + episode list */}
      <div className="w-56 shrink-0 border-r border-border/20 flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-2 border-b border-border/10 shrink-0">
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-2">Story Arc</div>
          <ArcSidebar arc={state.arc} />
        </div>

        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
            Episodes ({episodes.length})
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
          {episodes.length === 0 && (
            <p className="text-[11px] text-muted-foreground/40 text-center pt-4">No episodes yet</p>
          )}
          {episodes.map((ep, i) => (
            <EpisodeListItem key={ep.id} episode={ep} isLatest={i === 0} onOpen={() => onOpen(ep)} />
          ))}
        </div>
      </div>

      {/* Right: agent grid */}
      <div className="flex-1 overflow-y-auto p-4 min-w-0">
        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Users size={11} /> Cast
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} allAgents={agents} />
          ))}
        </div>
        {agents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground/40 text-sm">
            <Heart size={24} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">Press Start Episode to begin</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function VillanosPage() {
  const [state, setState] = useState<VillaState | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VillaVoiceSettings>(defaultVoiceSettings);
  const [loading, setLoading] = useState(true);
  const [viewingEpisode, setViewingEpisode] = useState<VillaEpisode | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    const result = await villanosApi.state();
    if (result) { setState(result); setLoading(false); }
  }, []);

  const fetchVoiceSettings = useCallback(async () => {
    try {
      const result = await villanosApi.settings();
      setVoiceSettings({ ...defaultVoiceSettings, ...result });
    } catch (err) {
      console.warn('VillaOS voice settings failed', err);
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchVoiceSettings();
    pollRef.current = setInterval(fetchState, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState, fetchVoiceSettings]);

  // When episode ends, open the completed episode for viewing.
  const prevActive = useRef(false);
  useEffect(() => {
    if (prevActive.current && !state?.episode_active) {
      const eps = state?.episodes ?? [];
      if (eps.length > 0) setViewingEpisode(eps[eps.length - 1]);
    }
    prevActive.current = state?.episode_active ?? false;
  }, [state?.episode_active, state?.episodes]);

  const handleStart = async () => {
    setViewingEpisode(null);
    await villanosApi.startEpisode();
    await fetchState();
  };

  const handleStop = async () => {
    await villanosApi.stopEpisode();
    await fetchState();
  };

  const handleReset = async () => {
    await villanosApi.reset();
    setViewingEpisode(null);
    await fetchState();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading Villa…</div>
  );
  if (!state) return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Could not connect.</div>
  );

  const agentMap = Object.fromEntries((state.agents ?? []).map((a) => [a.id, a]));
  const live = state.live_episode ?? null;
  const epNum = state.arc?.episode_num ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart size={15} className="text-pink-400 shrink-0" />
          <span className="text-sm font-semibold">VillaOS</span>
          {epNum > 0 && (
            <span className="text-[11px] text-muted-foreground/50 hidden sm:block">· {epNum} episodes</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Back to dashboard if viewing a past episode */}
          {viewingEpisode && !state.episode_active && (
            <button
              onClick={() => setViewingEpisode(null)}
              className="text-xs border border-border/30 text-muted-foreground rounded-lg px-2.5 py-1.5 hover:bg-muted/30 transition-colors"
            >
              ← Dashboard
            </button>
          )}

          {state.episode_active ? (
            /* Episode running — show Clear button */
            <button
              onClick={handleStop}
              className="flex items-center gap-1 text-xs bg-orange-500/15 text-orange-400 border border-orange-500/25 rounded-lg px-2.5 py-1.5 hover:bg-orange-500/25 transition-colors font-medium"
            >
              <Square size={11} /> Clear
            </button>
          ) : (
            /* Idle — show Start Episode */
            <button
              onClick={handleStart}
              className="flex items-center gap-1.5 text-xs bg-pink-500/15 text-pink-400 border border-pink-500/20 rounded-lg px-3 py-1.5 hover:bg-pink-500/25 transition-colors font-medium"
            >
              <Play size={11} /> Start Episode
            </button>
          )}

          {/* Full reset */}
          <button
            onClick={handleReset}
            disabled={state.episode_active}
            title="Delete everything and restart from episode 1"
            className="flex items-center gap-1 text-xs border border-border/30 text-muted-foreground rounded-lg px-2.5 py-1.5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={11} /> Delete All
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {state.episode_active && live ? (
        <LiveEpisodeViewer
          live={live}
          agentMap={agentMap}
          voiceSettings={voiceSettings}
          onStop={handleStop}
        />
      ) : viewingEpisode ? (
        <PastEpisodeViewer
          episode={viewingEpisode}
          agentMap={agentMap}
          voiceSettings={voiceSettings}
          onClose={() => setViewingEpisode(null)}
        />
      ) : (
        <IdleDashboard state={state} onOpen={setViewingEpisode} />
      )}
    </div>
  );
}
