import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';

export type VillaAgentAttributes = {
  jealousy: number;
  confidence: number;
  drama: number;
  loyalty: number;
  flirtiness: number;
  honesty: number;
  empathy: number;
  impulsiveness: number;
  insecurity: number;
  humor: number;
  patience: number;
  commitment: number;
  strategy: number;
};

export type VillaFeeling = {
  score: number; // -100 to 100
  note: string;
};

export type VillaPrivateFeeling = {
  attraction: number;
  trust: number;
  jealousy: number;
  resentment: number;
  curiosity: number;
  note: string;
};

export type VillaAgentMemory = {
  self_story: string;
  private_feelings: Record<string, VillaPrivateFeeling>;
  secrets: string[];
  intentions: string[];
  avoid_topics: string[];
  recent_scene_refs: string[];
};

export type VillaAgent = {
  id: string;
  name: string;
  age: number;
  origin: string;
  voice: string;
  voice_id?: string;
  personality: string;
  trait: string;
  status: 'single' | 'coupled' | 'recoupled' | 'dumped';
  coupled_with?: string;
  avatar_color: string;
  attributes: VillaAgentAttributes;
  feelings: Record<string, VillaFeeling>;
  memories: string[];
  memory?: VillaAgentMemory;
};

export type VillaDialogueTurn = {
  agent_id: string;
  agent_name: string;
  content: string;
  emotion?: string;
  time: string;
};

export type VillaScene = {
  id: string;
  type?: string;
  location: string;
  narration: string;
  participants: string[];
  purpose?: string;
  starting_mood?: string;
  ending_mood?: string;
  must_advance?: string[];
  must_avoid?: string[];
  audio_prompt?: string;
  turns: VillaDialogueTurn[];
  target_duration_ms?: number;
  estimated_duration_ms?: number;
};

export type VillaAudioCue = {
  prompt: string;
  volume: number;
  fade_in_ms?: number;
  fade_out_ms?: number;
  loop?: boolean;
};

export type VillaTimelineItem = {
  id: string;
  type: 'music' | 'ambience' | 'narrator' | 'dialogue' | 'confessional' | 'sting' | 'pause';
  scene_id?: string;
  speaker_id?: string;
  speaker_name?: string;
  text?: string;
  emotion?: string;
  cue?: VillaAudioCue;
  start_ms: number;
  duration_ms: number;
  volume: number;
  fade_in_ms?: number;
  fade_out_ms?: number;
  overlap_ms?: number;
};

export type VillaTimelineScene = {
  id: string;
  location: string;
  type: string;
  participants: string[];
  target_duration_ms: number;
  estimated_duration_ms: number;
  items: VillaTimelineItem[];
};

export type VillaEpisodeTimeline = {
  target_duration_ms: number;
  estimated_duration_ms: number;
  scenes: VillaTimelineScene[];
  items: VillaTimelineItem[];
};

export type VillaEpisode = {
  id: string;
  number: number;
  time: string;
  title: string;
  opening: string;
  scenes: VillaScene[];
  closing: string;
  timeline?: VillaEpisodeTimeline;
};

export type VillaLiveEpisode = {
  episode_num: number;
  title: string;
  opening: string;
  scenes: VillaScene[];
  timeline?: VillaEpisodeTimeline;
  phase: 'opening' | 'scene' | 'closing' | 'updating';
  active_scene_idx: number;
};

export type VillaArc = {
  episode_num: number;
  current_drama: string;
  active_dramas: string[];
  ongoing_tensions: string[];
  recent_events: string[];
};

export type VillaState = {
  agents: VillaAgent[];
  episodes: VillaEpisode[];
  live_episode?: VillaLiveEpisode;
  episode_active: boolean;
  arc: VillaArc;
  updated_at: string;
};

export type VillaTTSPreview = {
  agent_id: string;
  input_text: string;
  emotion: string;
  model_id: string;
  voice_id: string;
  voice_configured: boolean;
  endpoint: string;
  elevenlabs_request: {
    text: string;
    model_id: string;
    voice_settings: {
      stability: number;
      similarity_boost: number;
      style?: number;
    };
  };
};

export type VillaVoiceSettings = {
  elevenlabs_model_id: string;
  elevenlabs_default_voice_id: string;
  elevenlabs_narrator_voice_id: string;
  elevenlabs_stability: number;
  elevenlabs_similarity: number;
  voice_style_intensity: number;
  conversation_overlap_ms: number;
  pause_same_speaker_ms: number;
  pause_different_speaker_ms: number;
  pause_emotional_ms: number;
  pause_narrator_ms: number;
  narrator_auto_play: boolean;
  character_auto_play: boolean;
  sound_effects_enabled: boolean;
  sound_effects_prompt: string;
  sound_effects_duration_seconds: number;
  sound_effects_volume: number;
  sound_effects_prompt_influence: number;
  sound_effects_model_id: string;
};

export const villanosApi = {
  state: () => apiJsonSafe<VillaState>('/api/villanos/state'),
  settings: () => apiJson<VillaVoiceSettings>('/api/villanos/settings'),
  startEpisode: () => apiJson<{ ok: boolean }>('/api/villanos/start', { method: 'POST' }),
  stopEpisode: () => apiJson<{ ok: boolean }>('/api/villanos/stop', { method: 'POST' }),
  reset: () => apiJson<{ ok: boolean }>('/api/villanos/reset', { method: 'POST' }),
  tts: async (agentId: string, text: string, emotion?: string) => {
    const resp = await apiFetch('/api/villanos/tts', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, text, emotion }),
    });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const data = await resp.json();
        if (data?.error) msg = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return resp.blob();
  },
  ttsPreview: (agentId: string, text: string, emotion?: string) =>
    apiJson<VillaTTSPreview>('/api/villanos/tts/preview', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, text, emotion }),
    }),
  soundEffect: async (text: string, durationSeconds?: number, loop = true, promptInfluence?: number, modelId?: string) => {
    const resp = await apiFetch('/api/villanos/sound-effect', {
      method: 'POST',
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        loop,
        prompt_influence: promptInfluence,
        model_id: modelId,
      }),
    });
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const data = await resp.json();
        if (data?.error) msg = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return resp.blob();
  },
};
