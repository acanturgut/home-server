package villanos

import "time"

type AgentAttributes struct {
	Jealousy      int `json:"jealousy"`
	Confidence    int `json:"confidence"`
	Drama         int `json:"drama"`
	Loyalty       int `json:"loyalty"`
	Flirtiness    int `json:"flirtiness"`
	Honesty       int `json:"honesty"`
	Empathy       int `json:"empathy"`
	Impulsiveness int `json:"impulsiveness"`
	Insecurity    int `json:"insecurity"`
	Humor         int `json:"humor"`
	Patience      int `json:"patience"`
	Commitment    int `json:"commitment"`
	Strategy      int `json:"strategy"`
}

type Feeling struct {
	Score int    `json:"score"` // -100 hate → 100 love
	Note  string `json:"note"`
}

type PrivateFeeling struct {
	Attraction int    `json:"attraction"`
	Trust      int    `json:"trust"`
	Jealousy   int    `json:"jealousy"`
	Resentment int    `json:"resentment"`
	Curiosity  int    `json:"curiosity"`
	Note       string `json:"note"`
}

type AgentMemory struct {
	SelfStory       string                    `json:"self_story"`
	PrivateFeelings map[string]PrivateFeeling `json:"private_feelings"`
	Secrets         []string                  `json:"secrets"`
	Intentions      []string                  `json:"intentions"`
	AvoidTopics     []string                  `json:"avoid_topics"`
	RecentSceneRefs []string                  `json:"recent_scene_refs"`
}

type Agent struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Age         int                `json:"age"`
	Origin      string             `json:"origin"`
	Voice       string             `json:"voice"`
	VoiceID     string             `json:"voice_id,omitempty"`
	Personality string             `json:"personality"`
	Trait       string             `json:"trait"`
	Status      string             `json:"status"` // single | coupled | recoupled | dumped
	CoupledWith string             `json:"coupled_with,omitempty"`
	AvatarColor string             `json:"avatar_color"`
	Attributes  AgentAttributes    `json:"attributes"`
	Feelings    map[string]Feeling `json:"feelings"`
	Memories    []string           `json:"memories"`
	Memory      AgentMemory        `json:"memory"`
}

type DialogueTurn struct {
	AgentID   string    `json:"agent_id"`
	AgentName string    `json:"agent_name"`
	Content   string    `json:"content"`
	Emotion   string    `json:"emotion,omitempty"`
	Time      time.Time `json:"time"`
}

// Scene is one segment of an episode — 2-3 agents in one location.
type Scene struct {
	ID                  string           `json:"id"`
	Type                string           `json:"type,omitempty"`
	Location            string           `json:"location"`
	Narration           string           `json:"narration"`    // narrator intro for this scene
	Participants        []string         `json:"participants"` // agent IDs
	Purpose             string           `json:"purpose,omitempty"`
	StartingMood        string           `json:"starting_mood,omitempty"`
	EndingMood          string           `json:"ending_mood,omitempty"`
	MustAdvance         []string         `json:"must_advance,omitempty"`
	MustAvoid           []string         `json:"must_avoid,omitempty"`
	AudioPrompt         string           `json:"audio_prompt,omitempty"`
	Turns               []DialogueTurn   `json:"turns"`
	TargetDurationMs    int              `json:"target_duration_ms,omitempty"`
	EstimatedDurationMs int              `json:"estimated_duration_ms,omitempty"`
	Validation          *SceneValidation `json:"validation,omitempty"`
}

type SceneValidation struct {
	Score        int      `json:"score"`
	NeedsRepair  bool     `json:"needs_repair"`
	Issues       []string `json:"issues,omitempty"`
	Repaired     bool     `json:"repaired,omitempty"`
	RepairReason string   `json:"repair_reason,omitempty"`
}

type AudioCue struct {
	Prompt    string  `json:"prompt"`
	Volume    float64 `json:"volume"`
	FadeInMs  int     `json:"fade_in_ms,omitempty"`
	FadeOutMs int     `json:"fade_out_ms,omitempty"`
	Loop      bool    `json:"loop,omitempty"`
}

type TimelineItem struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"` // music | ambience | narrator | dialogue | confessional | sting | pause
	SceneID     string    `json:"scene_id,omitempty"`
	SpeakerID   string    `json:"speaker_id,omitempty"`
	SpeakerName string    `json:"speaker_name,omitempty"`
	Text        string    `json:"text,omitempty"`
	Emotion     string    `json:"emotion,omitempty"`
	Cue         *AudioCue `json:"cue,omitempty"`
	StartMs     int       `json:"start_ms"`
	DurationMs  int       `json:"duration_ms"`
	Volume      float64   `json:"volume"`
	FadeInMs    int       `json:"fade_in_ms,omitempty"`
	FadeOutMs   int       `json:"fade_out_ms,omitempty"`
	OverlapMs   int       `json:"overlap_ms,omitempty"`
}

type TimelineScene struct {
	ID                  string         `json:"id"`
	Location            string         `json:"location"`
	Type                string         `json:"type"`
	Participants        []string       `json:"participants"`
	TargetDurationMs    int            `json:"target_duration_ms"`
	EstimatedDurationMs int            `json:"estimated_duration_ms"`
	Items               []TimelineItem `json:"items"`
}

type EpisodeTimeline struct {
	TargetDurationMs    int             `json:"target_duration_ms"`
	EstimatedDurationMs int             `json:"estimated_duration_ms"`
	Scenes              []TimelineScene `json:"scenes"`
	Items               []TimelineItem  `json:"items"`
}

// Episode is one full show episode with opening, scenes and closing.
type Episode struct {
	ID       string           `json:"id"`
	Number   int              `json:"number"`
	Time     time.Time        `json:"time"`
	Title    string           `json:"title"`
	Opening  string           `json:"opening"` // narrator voiceover
	Scenes   []Scene          `json:"scenes"`
	Closing  string           `json:"closing"` // narrator wrap-up
	Timeline *EpisodeTimeline `json:"timeline,omitempty"`
}

// LiveEpisode streams the in-progress episode to the frontend.
type LiveEpisode struct {
	EpisodeNum     int              `json:"episode_num"`
	Title          string           `json:"title"`
	Opening        string           `json:"opening"`
	Scenes         []Scene          `json:"scenes"` // completed + currently active
	Timeline       *EpisodeTimeline `json:"timeline,omitempty"`
	Phase          string           `json:"phase"` // "opening" | "scene" | "closing" | "updating"
	ActiveSceneIdx int              `json:"active_scene_idx"`
}

// VillaArc is the evolving drama storyline across all episodes.
type VillaArc struct {
	EpisodeNum      int      `json:"episode_num"`
	CurrentDrama    string   `json:"current_drama"`
	ActiveDramas    []string `json:"active_dramas"`
	OngoingTensions []string `json:"ongoing_tensions"`
	RecentEvents    []string `json:"recent_events"`
}

type State struct {
	Agents        []Agent      `json:"agents"`
	Episodes      []Episode    `json:"episodes"`
	LiveEpisode   *LiveEpisode `json:"live_episode,omitempty"`
	EpisodeActive bool         `json:"episode_active"`
	Arc           VillaArc     `json:"arc"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

type AgentConfigUpdate struct {
	ID      string `json:"id"`
	Origin  string `json:"origin"`
	Voice   string `json:"voice"`
	VoiceID string `json:"voice_id"`
}
