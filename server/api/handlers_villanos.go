package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/acanturgut/home-server/villanos"
)

type villanosSettingsFile struct {
	ElevenLabsAPIKey            string                       `json:"elevenlabs_api_key"`
	ElevenLabsModelID           string                       `json:"elevenlabs_model_id"`
	ElevenLabsDefaultVoiceID    string                       `json:"elevenlabs_default_voice_id"`
	ElevenLabsNarratorVoiceID   string                       `json:"elevenlabs_narrator_voice_id"`
	ElevenLabsStability         *float64                     `json:"elevenlabs_stability,omitempty"`
	ElevenLabsSimilarity        *float64                     `json:"elevenlabs_similarity,omitempty"`
	VoiceStyleIntensity         *float64                     `json:"voice_style_intensity,omitempty"`
	ConversationOverlapMs       *int                         `json:"conversation_overlap_ms,omitempty"`
	PauseSameSpeakerMs          *int                         `json:"pause_same_speaker_ms,omitempty"`
	PauseDifferentSpeakerMs     *int                         `json:"pause_different_speaker_ms,omitempty"`
	PauseEmotionalMs            *int                         `json:"pause_emotional_ms,omitempty"`
	PauseNarratorMs             *int                         `json:"pause_narrator_ms,omitempty"`
	NarratorAutoPlay            *bool                        `json:"narrator_auto_play,omitempty"`
	CharacterAutoPlay           *bool                        `json:"character_auto_play,omitempty"`
	SoundEffectsEnabled         *bool                        `json:"sound_effects_enabled,omitempty"`
	SoundEffectsPrompt          string                       `json:"sound_effects_prompt,omitempty"`
	SoundEffectsDurationSec     *float64                     `json:"sound_effects_duration_seconds,omitempty"`
	SoundEffectsVolume          *float64                     `json:"sound_effects_volume,omitempty"`
	SoundEffectsPromptInfluence *float64                     `json:"sound_effects_prompt_influence,omitempty"`
	SoundEffectsModelID         string                       `json:"sound_effects_model_id,omitempty"`
	Agents                      []villanos.AgentConfigUpdate `json:"agents,omitempty"`
}

type villanosSettingsDTO struct {
	ElevenLabsAPIKey            string                       `json:"elevenlabs_api_key,omitempty"`
	ElevenLabsAPIKeySet         bool                         `json:"elevenlabs_api_key_set"`
	ElevenLabsModelID           string                       `json:"elevenlabs_model_id"`
	ElevenLabsDefaultVoiceID    string                       `json:"elevenlabs_default_voice_id"`
	ElevenLabsNarratorVoiceID   string                       `json:"elevenlabs_narrator_voice_id"`
	ElevenLabsStability         float64                      `json:"elevenlabs_stability"`
	ElevenLabsSimilarity        float64                      `json:"elevenlabs_similarity"`
	VoiceStyleIntensity         float64                      `json:"voice_style_intensity"`
	ConversationOverlapMs       int                          `json:"conversation_overlap_ms"`
	PauseSameSpeakerMs          int                          `json:"pause_same_speaker_ms"`
	PauseDifferentSpeakerMs     int                          `json:"pause_different_speaker_ms"`
	PauseEmotionalMs            int                          `json:"pause_emotional_ms"`
	PauseNarratorMs             int                          `json:"pause_narrator_ms"`
	NarratorAutoPlay            bool                         `json:"narrator_auto_play"`
	CharacterAutoPlay           bool                         `json:"character_auto_play"`
	SoundEffectsEnabled         bool                         `json:"sound_effects_enabled"`
	SoundEffectsPrompt          string                       `json:"sound_effects_prompt"`
	SoundEffectsDurationSec     float64                      `json:"sound_effects_duration_seconds"`
	SoundEffectsVolume          float64                      `json:"sound_effects_volume"`
	SoundEffectsPromptInfluence float64                      `json:"sound_effects_prompt_influence"`
	SoundEffectsModelID         string                       `json:"sound_effects_model_id"`
	Agents                      []villanos.AgentConfigUpdate `json:"agents"`
	ClearElevenLabsAPIKey       bool                         `json:"clear_elevenlabs_api_key,omitempty"`
}

type villanosTTSRequest struct {
	AgentID string `json:"agent_id"`
	Text    string `json:"text"`
	Emotion string `json:"emotion"`
}

type villanosSoundEffectRequest struct {
	Text            string   `json:"text"`
	DurationSeconds *float64 `json:"duration_seconds,omitempty"`
	Loop            bool     `json:"loop,omitempty"`
	PromptInfluence *float64 `json:"prompt_influence,omitempty"`
	ModelID         string   `json:"model_id,omitempty"`
}

func (h *Handler) VillanosState(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	st := h.villanos.State()
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) VillanosStart(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	if err := h.villanos.StartEpisode(); err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) VillanosStop(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	h.villanos.StopEpisode()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) VillanosReset(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	h.villanos.Reset()
	settings := h.loadVillanosSettings()
	if len(settings.Agents) > 0 {
		h.villanos.UpdateAgentConfigs(settings.Agents)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) VillanosSettingsGet(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	settings := h.loadVillanosSettings()
	if settings.ElevenLabsModelID == "" {
		settings.ElevenLabsModelID = getEnvDefault("ELEVENLABS_MODEL_ID", "eleven_v3")
	}
	if settings.ElevenLabsDefaultVoiceID == "" {
		settings.ElevenLabsDefaultVoiceID = strings.TrimSpace(os.Getenv("ELEVENLABS_DEFAULT_VOICE_ID"))
	}
	if settings.ElevenLabsNarratorVoiceID == "" {
		settings.ElevenLabsNarratorVoiceID = strings.TrimSpace(os.Getenv("ELEVENLABS_NARRATOR_VOICE_ID"))
	}
	if settings.SoundEffectsModelID == "" {
		settings.SoundEffectsModelID = "eleven_text_to_sound_v2"
	}
	savedAgents := agentSettingsByID(settings.Agents)
	agents := make([]villanos.AgentConfigUpdate, 0, len(h.villanos.State().Agents))
	for _, agent := range h.villanos.State().Agents {
		cfg := villanos.AgentConfigUpdate{
			ID:      agent.ID,
			Origin:  agent.Origin,
			Voice:   agent.Voice,
			VoiceID: h.villanosAgentVoiceID(agent.ID),
		}
		if saved, ok := savedAgents[agent.ID]; ok {
			if strings.TrimSpace(saved.Origin) != "" {
				cfg.Origin = strings.TrimSpace(saved.Origin)
			}
			if strings.TrimSpace(saved.Voice) != "" {
				cfg.Voice = strings.TrimSpace(saved.Voice)
			}
			if strings.TrimSpace(saved.VoiceID) != "" {
				cfg.VoiceID = strings.TrimSpace(saved.VoiceID)
			}
		}
		agents = append(agents, cfg)
	}
	writeJSON(w, http.StatusOK, villanosSettingsDTO{
		ElevenLabsAPIKeySet:         h.elevenLabsAPIKey() != "",
		ElevenLabsModelID:           settings.ElevenLabsModelID,
		ElevenLabsDefaultVoiceID:    settings.ElevenLabsDefaultVoiceID,
		ElevenLabsNarratorVoiceID:   settings.ElevenLabsNarratorVoiceID,
		ElevenLabsStability:         h.elevenLabsStability(),
		ElevenLabsSimilarity:        h.elevenLabsSimilarity(),
		VoiceStyleIntensity:         h.villanosVoiceStyleIntensity(),
		ConversationOverlapMs:       h.villanosConversationOverlapMs(),
		PauseSameSpeakerMs:          h.villanosPauseSameSpeakerMs(),
		PauseDifferentSpeakerMs:     h.villanosPauseDifferentSpeakerMs(),
		PauseEmotionalMs:            h.villanosPauseEmotionalMs(),
		PauseNarratorMs:             h.villanosPauseNarratorMs(),
		NarratorAutoPlay:            h.villanosNarratorAutoPlay(),
		CharacterAutoPlay:           h.villanosCharacterAutoPlay(),
		SoundEffectsEnabled:         h.villanosSoundEffectsEnabled(),
		SoundEffectsPrompt:          settings.SoundEffectsPrompt,
		SoundEffectsDurationSec:     h.villanosSoundEffectsDurationSec(),
		SoundEffectsVolume:          h.villanosSoundEffectsVolume(),
		SoundEffectsPromptInfluence: h.villanosSoundEffectsPromptInfluence(),
		SoundEffectsModelID:         h.villanosSoundEffectsModelID(),
		Agents:                      agents,
	})
}

func (h *Handler) VillanosSettingsUpdate(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	var req villanosSettingsDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 128*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	settings := h.loadVillanosSettings()
	if req.ClearElevenLabsAPIKey {
		settings.ElevenLabsAPIKey = ""
	} else if strings.TrimSpace(req.ElevenLabsAPIKey) != "" {
		settings.ElevenLabsAPIKey = strings.TrimSpace(req.ElevenLabsAPIKey)
	}
	if strings.TrimSpace(req.ElevenLabsModelID) != "" {
		settings.ElevenLabsModelID = strings.TrimSpace(req.ElevenLabsModelID)
	}
	settings.ElevenLabsDefaultVoiceID = strings.TrimSpace(req.ElevenLabsDefaultVoiceID)
	settings.ElevenLabsNarratorVoiceID = strings.TrimSpace(req.ElevenLabsNarratorVoiceID)
	settings.ElevenLabsStability = ptrFloat(clampFloat(req.ElevenLabsStability, 0, 1))
	settings.ElevenLabsSimilarity = ptrFloat(clampFloat(req.ElevenLabsSimilarity, 0, 1))
	settings.VoiceStyleIntensity = ptrFloat(clampFloat(req.VoiceStyleIntensity, 0, 1))
	settings.ConversationOverlapMs = ptrInt(clampInt(req.ConversationOverlapMs, 0, 1200))
	settings.PauseSameSpeakerMs = ptrInt(clampInt(req.PauseSameSpeakerMs, 0, 2000))
	settings.PauseDifferentSpeakerMs = ptrInt(clampInt(req.PauseDifferentSpeakerMs, 0, 2000))
	settings.PauseEmotionalMs = ptrInt(clampInt(req.PauseEmotionalMs, 0, 3000))
	settings.PauseNarratorMs = ptrInt(clampInt(req.PauseNarratorMs, 0, 3000))
	settings.NarratorAutoPlay = ptrBool(req.NarratorAutoPlay)
	settings.CharacterAutoPlay = ptrBool(req.CharacterAutoPlay)
	settings.SoundEffectsEnabled = ptrBool(req.SoundEffectsEnabled)
	settings.SoundEffectsPrompt = strings.TrimSpace(req.SoundEffectsPrompt)
	settings.SoundEffectsDurationSec = ptrFloat(clampFloat(req.SoundEffectsDurationSec, 0.5, 30))
	settings.SoundEffectsVolume = ptrFloat(clampFloat(req.SoundEffectsVolume, 0, 1))
	settings.SoundEffectsPromptInfluence = ptrFloat(clampFloat(req.SoundEffectsPromptInfluence, 0, 1))
	if strings.TrimSpace(req.SoundEffectsModelID) != "" {
		settings.SoundEffectsModelID = strings.TrimSpace(req.SoundEffectsModelID)
	}
	settings.Agents = sanitizeAgentConfigUpdates(req.Agents)
	if err := h.saveVillanosSettings(settings); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.villanos.UpdateAgentConfigs(settings.Agents)
	h.VillanosSettingsGet(w, r)
}

func (h *Handler) VillanosTTS(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	apiKey := h.elevenLabsAPIKey()
	if apiKey == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ELEVENLABS_API_KEY is not configured"})
		return
	}

	req, err := decodeVillanosTTSRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.AgentID == "" || req.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agent_id and text required"})
		return
	}

	voiceID := h.villanosVoiceID(req.AgentID)
	if voiceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "voice id not configured for agent"})
		return
	}

	_, requestBody := h.elevenLabsTTSRequestBody(req)
	body, _ := json.Marshal(requestBody)
	endpoint := h.elevenLabsTTSEndpoint(voiceID)
	outReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create tts request"})
		return
	}
	outReq.Header.Set("xi-api-key", apiKey)
	outReq.Header.Set("Content-Type", "application/json")
	outReq.Header.Set("Accept", "audio/mpeg")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(outReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "tts request failed"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := "tts request failed"
		if data, readErr := io.ReadAll(io.LimitReader(resp.Body, 2048)); readErr == nil && len(data) > 0 {
			msg = string(data)
		}
		status := http.StatusBadGateway
		if resp.StatusCode == http.StatusTooManyRequests {
			status = http.StatusTooManyRequests
		}
		writeJSON(w, status, map[string]string{"error": msg})
		return
	}

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, resp.Body)
}

func (h *Handler) VillanosTTSPreview(w http.ResponseWriter, r *http.Request) {
	if h.villanos == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "villanos not initialised"})
		return
	}
	req, err := decodeVillanosTTSRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.AgentID == "" || req.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agent_id and text required"})
		return
	}

	voiceID := h.villanosVoiceID(req.AgentID)
	modelID, requestBody := h.elevenLabsTTSRequestBody(req)
	writeJSON(w, http.StatusOK, map[string]any{
		"agent_id":           req.AgentID,
		"input_text":         req.Text,
		"emotion":            req.Emotion,
		"model_id":           modelID,
		"voice_id":           voiceID,
		"voice_configured":   voiceID != "",
		"endpoint":           h.elevenLabsTTSEndpoint(voiceID),
		"elevenlabs_request": requestBody,
	})
}

func (h *Handler) VillanosSoundEffect(w http.ResponseWriter, r *http.Request) {
	apiKey := h.elevenLabsAPIKey()
	if apiKey == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ELEVENLABS_API_KEY is not configured"})
		return
	}

	var req villanosSoundEffectRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 32*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Text = cleanTTSText(req.Text)
	if req.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "text required"})
		return
	}

	duration := h.villanosSoundEffectsDurationSec()
	if req.DurationSeconds != nil {
		duration = clampFloat(*req.DurationSeconds, 0.5, 30)
	}
	influence := h.villanosSoundEffectsPromptInfluence()
	if req.PromptInfluence != nil {
		influence = clampFloat(*req.PromptInfluence, 0, 1)
	}
	modelID := h.villanosSoundEffectsModelID()
	if strings.TrimSpace(req.ModelID) != "" {
		modelID = strings.TrimSpace(req.ModelID)
	}

	body, _ := json.Marshal(map[string]any{
		"text":             req.Text,
		"duration_seconds": duration,
		"loop":             req.Loop,
		"prompt_influence": influence,
		"model_id":         modelID,
	})
	endpoint := "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
	outReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create sound effect request"})
		return
	}
	outReq.Header.Set("xi-api-key", apiKey)
	outReq.Header.Set("Content-Type", "application/json")
	outReq.Header.Set("Accept", "audio/mpeg")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(outReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "sound effect request failed"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := "sound effect request failed"
		if data, readErr := io.ReadAll(io.LimitReader(resp.Body, 2048)); readErr == nil && len(data) > 0 {
			msg = string(data)
		}
		status := http.StatusBadGateway
		if resp.StatusCode == http.StatusTooManyRequests {
			status = http.StatusTooManyRequests
		}
		writeJSON(w, status, map[string]string{"error": msg})
		return
	}

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, resp.Body)
}

func decodeVillanosTTSRequest(r *http.Request) (villanosTTSRequest, error) {
	var req villanosTTSRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 16*1024)).Decode(&req); err != nil {
		return req, err
	}
	req.AgentID = strings.TrimSpace(req.AgentID)
	req.Text = cleanTTSText(req.Text)
	req.Emotion = strings.TrimSpace(req.Emotion)
	return req, nil
}

func (h *Handler) elevenLabsTTSRequestBody(req villanosTTSRequest) (string, map[string]any) {
	modelID := h.elevenLabsModelID()
	return modelID, map[string]any{
		"text":     applyElevenLabsEmotionTag(req.Text, req.Emotion, modelID),
		"model_id": modelID,
		"voice_settings": map[string]any{
			"stability":        h.elevenLabsStability(),
			"similarity_boost": h.elevenLabsSimilarity(),
			"style":            h.villanosVoiceStyleIntensity(),
		},
	}
}

func (h *Handler) elevenLabsTTSEndpoint(voiceID string) string {
	return fmt.Sprintf("https://api.elevenlabs.io/v1/text-to-speech/%s/stream?output_format=mp3_44100_128", url.PathEscape(voiceID))
}

func (h *Handler) villanosVoiceID(agentID string) string {
	if strings.EqualFold(agentID, "narrator") {
		if v := strings.TrimSpace(h.loadVillanosSettings().ElevenLabsNarratorVoiceID); v != "" {
			return v
		}
		if v := strings.TrimSpace(os.Getenv("ELEVENLABS_NARRATOR_VOICE_ID")); v != "" {
			return v
		}
	}
	if v := h.villanosAgentVoiceID(agentID); v != "" {
		return v
	}
	if v := strings.TrimSpace(h.loadVillanosSettings().ElevenLabsDefaultVoiceID); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("ELEVENLABS_DEFAULT_VOICE_ID"))
}

func (h *Handler) villanosAgentVoiceID(agentID string) string {
	st := h.villanos.State()
	for _, agent := range st.Agents {
		if agent.ID == agentID && strings.TrimSpace(agent.VoiceID) != "" {
			return strings.TrimSpace(agent.VoiceID)
		}
	}
	for _, agent := range h.loadVillanosSettings().Agents {
		if agent.ID == agentID && strings.TrimSpace(agent.VoiceID) != "" {
			return strings.TrimSpace(agent.VoiceID)
		}
	}
	envKey := "ELEVENLABS_VOICE_" + strings.ToUpper(strings.NewReplacer("-", "_", " ", "_").Replace(agentID))
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return v
	}
	return ""
}

func (h *Handler) elevenLabsAPIKey() string {
	if v := strings.TrimSpace(h.loadVillanosSettings().ElevenLabsAPIKey); v != "" {
		return v
	}
	return strings.TrimSpace(h.cfg.ElevenLabsKey)
}

func (h *Handler) elevenLabsModelID() string {
	if v := strings.TrimSpace(h.loadVillanosSettings().ElevenLabsModelID); v != "" {
		return v
	}
	return getEnvDefault("ELEVENLABS_MODEL_ID", "eleven_v3")
}

func (h *Handler) elevenLabsStability() float64 {
	if v := h.loadVillanosSettings().ElevenLabsStability; v != nil {
		return clampFloat(*v, 0, 1)
	}
	return 0.45
}

func (h *Handler) elevenLabsSimilarity() float64 {
	if v := h.loadVillanosSettings().ElevenLabsSimilarity; v != nil {
		return clampFloat(*v, 0, 1)
	}
	return 0.75
}

func (h *Handler) villanosVoiceStyleIntensity() float64 {
	if v := h.loadVillanosSettings().VoiceStyleIntensity; v != nil {
		return clampFloat(*v, 0, 1)
	}
	return 0.35
}

func (h *Handler) villanosConversationOverlapMs() int {
	if v := h.loadVillanosSettings().ConversationOverlapMs; v != nil {
		return clampInt(*v, 0, 1200)
	}
	return 420
}

func (h *Handler) villanosPauseSameSpeakerMs() int {
	if v := h.loadVillanosSettings().PauseSameSpeakerMs; v != nil {
		return clampInt(*v, 0, 2000)
	}
	return 200
}

func (h *Handler) villanosPauseDifferentSpeakerMs() int {
	if v := h.loadVillanosSettings().PauseDifferentSpeakerMs; v != nil {
		return clampInt(*v, 0, 2000)
	}
	return 320
}

func (h *Handler) villanosPauseEmotionalMs() int {
	if v := h.loadVillanosSettings().PauseEmotionalMs; v != nil {
		return clampInt(*v, 0, 3000)
	}
	return 650
}

func (h *Handler) villanosPauseNarratorMs() int {
	if v := h.loadVillanosSettings().PauseNarratorMs; v != nil {
		return clampInt(*v, 0, 3000)
	}
	return 850
}

func (h *Handler) villanosNarratorAutoPlay() bool {
	if v := h.loadVillanosSettings().NarratorAutoPlay; v != nil {
		return *v
	}
	return true
}

func (h *Handler) villanosCharacterAutoPlay() bool {
	if v := h.loadVillanosSettings().CharacterAutoPlay; v != nil {
		return *v
	}
	return false
}

func (h *Handler) villanosSoundEffectsEnabled() bool {
	if v := h.loadVillanosSettings().SoundEffectsEnabled; v != nil {
		return *v
	}
	return false
}

func (h *Handler) villanosSoundEffectsDurationSec() float64 {
	if v := h.loadVillanosSettings().SoundEffectsDurationSec; v != nil {
		return clampFloat(*v, 0.5, 30)
	}
	return 12
}

func (h *Handler) villanosSoundEffectsVolume() float64 {
	if v := h.loadVillanosSettings().SoundEffectsVolume; v != nil {
		return clampFloat(*v, 0, 1)
	}
	return 0.18
}

func (h *Handler) villanosSoundEffectsPromptInfluence() float64 {
	if v := h.loadVillanosSettings().SoundEffectsPromptInfluence; v != nil {
		return clampFloat(*v, 0, 1)
	}
	return 0.35
}

func (h *Handler) villanosSoundEffectsModelID() string {
	if v := strings.TrimSpace(h.loadVillanosSettings().SoundEffectsModelID); v != "" {
		return v
	}
	return "eleven_text_to_sound_v2"
}

func (h *Handler) villanosSettingsPath() string {
	return filepath.Join(h.cfg.DataDir, "villanos_settings.json")
}

func (h *Handler) loadVillanosSettings() villanosSettingsFile {
	var settings villanosSettingsFile
	data, err := os.ReadFile(h.villanosSettingsPath())
	if err != nil {
		return settings
	}
	_ = json.Unmarshal(data, &settings)
	return settings
}

func (h *Handler) saveVillanosSettings(settings villanosSettingsFile) error {
	if err := os.MkdirAll(h.cfg.DataDir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(h.villanosSettingsPath(), data, 0o600)
}

func agentSettingsByID(agents []villanos.AgentConfigUpdate) map[string]villanos.AgentConfigUpdate {
	byID := make(map[string]villanos.AgentConfigUpdate, len(agents))
	for _, agent := range agents {
		if strings.TrimSpace(agent.ID) == "" {
			continue
		}
		agent.ID = strings.TrimSpace(agent.ID)
		agent.Origin = strings.TrimSpace(agent.Origin)
		agent.Voice = strings.TrimSpace(agent.Voice)
		agent.VoiceID = strings.TrimSpace(agent.VoiceID)
		byID[agent.ID] = agent
	}
	return byID
}

func sanitizeAgentConfigUpdates(agents []villanos.AgentConfigUpdate) []villanos.AgentConfigUpdate {
	if len(agents) == 0 {
		return nil
	}
	byID := agentSettingsByID(agents)
	out := make([]villanos.AgentConfigUpdate, 0, len(byID))
	for _, agent := range agents {
		id := strings.TrimSpace(agent.ID)
		if id == "" {
			continue
		}
		clean, ok := byID[id]
		if !ok {
			continue
		}
		out = append(out, clean)
		delete(byID, id)
	}
	return out
}

func cleanTTSText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.Join(strings.Fields(s), " ")
	if idx := strings.LastIndex(s, "---"); idx >= 0 && idx+3 < len(s) {
		s = strings.TrimSpace(s[idx+3:])
	}
	return strings.Trim(s, `"'“”‘’ `)
}

func applyElevenLabsEmotionTag(text, emotion, modelID string) string {
	text = strings.TrimSpace(text)
	if !isElevenLabsV3Model(modelID) {
		return text
	}
	tag := elevenLabsAudioTag(emotion)
	if tag == "" || text == "" || hasElevenLabsTag(text) {
		return text
	}
	return tag + " " + insertElevenLabsMidSentenceTag(text, emotion)
}

func isElevenLabsV3Model(modelID string) bool {
	modelID = strings.ToLower(strings.TrimSpace(modelID))
	return modelID == "eleven_v3" || strings.Contains(modelID, "eleven_v3")
}

func hasElevenLabsTag(text string) bool {
	return strings.Contains(text, "[") && strings.Contains(text, "]")
}

func insertElevenLabsMidSentenceTag(text, emotion string) string {
	tag := elevenLabsMidSentenceTag(emotion)
	if tag == "" || len(strings.Fields(text)) < 10 {
		return text
	}
	if idx := firstClauseBreak(text); idx > 0 && idx+1 < len(text) {
		return strings.TrimSpace(text[:idx+1]) + " " + tag + " " + strings.TrimSpace(text[idx+1:])
	}

	words := strings.Fields(text)
	if len(words) < 10 {
		return text
	}
	insertAt := len(words) / 2
	if insertAt < 5 {
		insertAt = 5
	}
	if insertAt > 8 {
		insertAt = 8
	}
	next := append([]string{}, words[:insertAt]...)
	next = append(next, tag)
	next = append(next, words[insertAt:]...)
	return strings.Join(next, " ")
}

func firstClauseBreak(text string) int {
	best := -1
	bestEnd := -1
	for _, marker := range []string{",", ";", " — ", " - "} {
		if idx := strings.Index(text, marker); idx >= 12 {
			if best == -1 || idx < best {
				best = idx
				bestEnd = idx + len(marker) - 1
			}
		}
	}
	if bestEnd >= 0 {
		return bestEnd
	}
	return best
}

func elevenLabsMidSentenceTag(emotion string) string {
	switch strings.ToLower(strings.NewReplacer("_", " ", "-", " ").Replace(strings.TrimSpace(emotion))) {
	case "sigh", "sighs", "sighing", "sad", "sorrowful":
		return "[sighs]"
	case "exhale", "exhales", "exhaling":
		return "[exhales]"
	case "hesitate", "hesitates", "hesitant", "hesitating", "nervous", "nervously":
		return "[hesitates]"
	default:
		return ""
	}
}

func elevenLabsAudioTag(emotion string) string {
	normalized := strings.ToLower(strings.NewReplacer("_", " ", "-", " ").Replace(strings.TrimSpace(emotion)))
	switch normalized {
	case "laugh", "laughs", "laughing":
		return "[laughs]"
	case "laughs harder", "starts laughing":
		return "[" + normalized + "]"
	case "sigh", "sighs", "sighing":
		return "[sighs]"
	case "exhale", "exhales", "exhaling":
		return "[exhales]"
	case "hesitate", "hesitates", "hesitant", "hesitating":
		return "[hesitates]"
	case "whisper", "whispers", "whispering":
		return "[whispers]"
	case "shout", "shouts", "shouting":
		return "[shouts]"
	case "sad", "sorrowful":
		return "[sad]"
	case "angry", "frustrated":
		return "[angry]"
	case "happy", "happily":
		return "[happily]"
	case "excited", "excitedly":
		return "[excited]"
	case "nervous", "nervously":
		return "[nervously]"
	case "curious", "curiously":
		return "[curious]"
	case "playful", "playfully", "mischievous", "mischievously":
		return "[mischievously]"
	case "sarcastic", "sarcastically":
		return "[sarcastic]"
	case "calm", "calmly":
		return "[calm]"
	default:
		return ""
	}
}

func getEnvDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func clampFloat(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func ptrFloat(v float64) *float64 {
	return &v
}

func ptrInt(v int) *int {
	return &v
}

func ptrBool(v bool) *bool {
	return &v
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// SetVillanos wires the villanos manager into the handler.
func (h *Handler) SetVillanos(m *villanos.Manager) { h.villanos = m }
