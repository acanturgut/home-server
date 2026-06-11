import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Mic2, Music2, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SkeletonRows } from '@/features/settings/components/SettingsRows';
import {
  settingsApi,
  type VillanosAgentSettingsDTO,
  type VillanosSettingsDTO,
} from '@/features/settings/api';

const emptySettings: VillanosSettingsDTO = {
  elevenlabs_api_key: '',
  elevenlabs_api_key_set: false,
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
  agents: [],
};

export function VillanosSettingsTab() {
  const [settings, setSettings] = useState<VillanosSettingsDTO>(emptySettings);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await settingsApi.getVillanosSettings();
      setSettings({ ...emptySettings, ...next, elevenlabs_api_key: '' });
      setApiKeyDraft('');
      setClearKey(false);
      setSaved(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof VillanosSettingsDTO>(
    key: K,
    value: VillanosSettingsDTO[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function updateAgent(id: string, patch: Partial<VillanosAgentSettingsDTO>) {
    setSettings((prev) => ({
      ...prev,
      agents: prev.agents.map((agent) =>
        agent.id === id ? { ...agent, ...patch } : agent,
      ),
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: VillanosSettingsDTO = {
        ...settings,
        elevenlabs_api_key: clearKey ? '' : apiKeyDraft.trim(),
        clear_elevenlabs_api_key: clearKey,
      };
      const next = await settingsApi.putVillanosSettings(payload);
      setSettings({ ...emptySettings, ...next, elevenlabs_api_key: '' });
      setApiKeyDraft('');
      setClearKey(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <SettingsCard
        title="VillaOS Voice"
        icon={<Mic2 size={14} />}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading || saving}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reload
            </Button>
            <Button size="sm" onClick={save} disabled={loading || saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        }
      >
        {loading ? (
          <SkeletonRows rows={5} block />
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  ElevenLabs API key
                </span>
                <Input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => {
                    setApiKeyDraft(e.target.value);
                    setClearKey(false);
                  }}
                  placeholder={
                    settings.elevenlabs_api_key_set
                      ? 'Saved on server. Type to replace.'
                      : 'Paste API key'
                  }
                />
                <span className="block text-[11px] text-muted-foreground/60">
                  {settings.elevenlabs_api_key_set
                    ? 'A key is configured. It is not sent back to the browser.'
                    : 'No ElevenLabs key is configured yet.'}
                </span>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  TTS model
                </span>
                <Input
                  value={settings.elevenlabs_model_id}
                  onChange={(e) => update('elevenlabs_model_id', e.target.value)}
                  placeholder="eleven_v3"
                />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Default voice ID
                </span>
                <Input
                  value={settings.elevenlabs_default_voice_id}
                  onChange={(e) =>
                    update('elevenlabs_default_voice_id', e.target.value)
                  }
                  placeholder="Used when a character has no voice ID"
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Narrator voice ID
                </span>
                <Input
                  value={settings.elevenlabs_narrator_voice_id}
                  onChange={(e) =>
                    update('elevenlabs_narrator_voice_id', e.target.value)
                  }
                  placeholder="Used for opening, scene, and closing narration"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Stability
                </span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.elevenlabs_stability}
                  onChange={(e) =>
                    update('elevenlabs_stability', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Similarity boost
                </span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.elevenlabs_similarity}
                  onChange={(e) =>
                    update('elevenlabs_similarity', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Voice style intensity
                </span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.voice_style_intensity}
                  onChange={(e) =>
                    update('voice_style_intensity', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Overlap ms
                </span>
                <Input
                  type="number"
                  min={0}
                  max={1200}
                  step={50}
                  value={settings.conversation_overlap_ms}
                  onChange={(e) =>
                    update('conversation_overlap_ms', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Same speaker pause ms
                </span>
                <Input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={settings.pause_same_speaker_ms}
                  onChange={(e) =>
                    update('pause_same_speaker_ms', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Reply pause ms
                </span>
                <Input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={settings.pause_different_speaker_ms}
                  onChange={(e) =>
                    update('pause_different_speaker_ms', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Emotional pause ms
                </span>
                <Input
                  type="number"
                  min={0}
                  max={3000}
                  step={50}
                  value={settings.pause_emotional_ms}
                  onChange={(e) =>
                    update('pause_emotional_ms', Number(e.target.value))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                  Narrator pause ms
                </span>
                <Input
                  type="number"
                  min={0}
                  max={3000}
                  step={50}
                  value={settings.pause_narrator_ms}
                  onChange={(e) =>
                    update('pause_narrator_ms', Number(e.target.value))
                  }
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border/20 bg-card/20 px-3 py-2 text-xs text-foreground/80">
                <input
                  type="checkbox"
                  checked={settings.narrator_auto_play}
                  onChange={(e) => update('narrator_auto_play', e.target.checked)}
                />
                Narrator auto-play
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border/20 bg-card/20 px-3 py-2 text-xs text-foreground/80">
                <input
                  type="checkbox"
                  checked={settings.character_auto_play}
                  onChange={(e) => update('character_auto_play', e.target.checked)}
                />
                Character auto-play
              </label>
            </div>

            {settings.elevenlabs_api_key_set && (
              <button
                type="button"
                onClick={() => {
                  setClearKey((v) => !v);
                  setApiKeyDraft('');
                  setSaved(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  clearKey
                    ? 'border-red-500/35 bg-red-500/10 text-red-300'
                    : 'border-border/30 text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <KeyRound size={12} />
                {clearKey ? 'API key will be cleared on save' : 'Clear saved API key'}
              </button>
            )}

            <div className="rounded-lg border border-border/25 bg-card/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                <Music2 size={13} />
                Scene ambience
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-border/20 bg-background/25 px-3 py-2 text-xs text-foreground/80">
                  <input
                    type="checkbox"
                    checked={settings.sound_effects_enabled}
                    onChange={(e) => update('sound_effects_enabled', e.target.checked)}
                  />
                  Generate background ambience for scene playback
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                    SFX model
                  </span>
                  <Input
                    value={settings.sound_effects_model_id}
                    onChange={(e) => update('sound_effects_model_id', e.target.value)}
                    placeholder="eleven_text_to_sound_v2"
                  />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                    Ambience prompt
                  </span>
                  <Input
                    value={settings.sound_effects_prompt}
                    onChange={(e) => update('sound_effects_prompt', e.target.value)}
                    placeholder="Optional. Adds mood, music, pool sounds, night villa ambience..."
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                    Duration seconds
                  </span>
                  <Input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={settings.sound_effects_duration_seconds}
                    onChange={(e) =>
                      update('sound_effects_duration_seconds', Number(e.target.value))
                    }
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                    Ambience volume
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.sound_effects_volume}
                    onChange={(e) => update('sound_effects_volume', Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                    Prompt influence
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.sound_effects_prompt_influence}
                    onChange={(e) =>
                      update('sound_effects_prompt_influence', Number(e.target.value))
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Cast Voices" icon={<KeyRound size={14} />}>
        {loading ? (
          <SkeletonRows rows={6} block />
        ) : (
          <div className="space-y-3">
            {settings.agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-lg border border-border/25 bg-card/20 p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium capitalize text-foreground/90">
                      {agent.id}
                    </div>
                    <div className="text-[11px] text-muted-foreground/60">
                      Origin, voice style, and ElevenLabs voice mapping
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                      Origin
                    </span>
                    <Input
                      value={agent.origin}
                      onChange={(e) =>
                        updateAgent(agent.id, { origin: e.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                      ElevenLabs voice ID
                    </span>
                    <Input
                      value={agent.voice_id}
                      onChange={(e) =>
                        updateAgent(agent.id, { voice_id: e.target.value })
                      }
                      placeholder="voice_id"
                    />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
                      Voice style prompt
                    </span>
                    <Input
                      value={agent.voice}
                      onChange={(e) =>
                        updateAgent(agent.id, { voice: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
