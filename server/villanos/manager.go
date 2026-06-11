package villanos

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/logger"
)

const (
	maxEpisodes              = 20
	maxMemories              = 20
	maxPrivateMemoryItems    = 20
	maxRecentEvents          = 10
	turnsPerScene            = 16 // dialogue turns per scene
	maxTurnsPerScene         = 24
	scenesPerEp              = 4 // scenes per episode
	targetEpisodeMinDuration = 10 * 60 * 1000
	targetEpisodeMaxDuration = 15 * 60 * 1000
	defaultEpisodeTarget     = 12 * 60 * 1000
)

var (
	thinkBlockRe       = regexp.MustCompile(`(?is)<think(?:ing)?[^>]*>[\s\S]*?</think(?:ing)?>`)
	analysisBlockRe    = regexp.MustCompile(`(?is)<analys?is[^>]*>[\s\S]*?</analys?is>`)
	analysisOpenRe     = regexp.MustCompile(`(?is)<analys?is[^>]*>[\s\S]*?(?:---|$)`)
	codeBlockRe        = regexp.MustCompile("(?s)```[\\s\\S]*?```")
	jsonRe             = regexp.MustCompile(`(?s)\{[\s\S]+\}`)
	annotationRe       = regexp.MustCompile(`\*[^*]*\*|\[[^\]]*\]|\([^)]*\)`)
	analysisHeadingRe  = regexp.MustCompile(`(?is)^[\s"'“”‘’]*(?:[a-z]+(?:'s)?\s+)?(?:character\s+analysis|interview\s+reaction|character\s+profile\s+assessment|profile\s+assessment|assessment|analysis)\b[\s\S]*?(?:---|:\s*)`)
	numberedAnalysisRe = regexp.MustCompile(`(?is)^\s*\d+\.\s*(?:character\s+analysis|current\s+situation|response\s+strategy|voice\s+and\s+tone)\b[\s\S]*?(?:---|:\s*)`)
	finalLineRe        = regexp.MustCompile(`(?is)^.*\b(?:final line|spoken line|actual line|reply|response)\s*:\s*`)
	lineLabelRe        = regexp.MustCompile(`(?i)^\s*(dialogue|line|response|reply|spoken line|output)\s*:\s*`)
	leadingQuoteRe     = regexp.MustCompile(`^[\s"'“”‘’]+`)
	trailingQuoteRe    = regexp.MustCompile(`[\s"'“”‘’]+$`)
	leadingBulletRe    = regexp.MustCompile(`^\s*[-•]\s*`)
	genericSpeakerRe   = regexp.MustCompile(`(?i)^\s*[a-z][a-z\s'.-]{0,32}\s*:\s*`)
)

type Manager struct {
	store  *Store
	router *ai.Router

	mu     sync.Mutex
	state  *State
	runCtx context.Context
}

func NewManager(store *Store, router *ai.Router) (*Manager, error) {
	st, err := store.Load()
	if err != nil {
		return nil, err
	}
	for i := range st.Agents {
		if st.Agents[i].Feelings == nil {
			st.Agents[i].Feelings = map[string]Feeling{}
		}
		if st.Agents[i].Memories == nil {
			st.Agents[i].Memories = []string{}
		}
		st.Agents[i] = normalizeAgent(st.Agents[i])
		st.Agents[i].Memory = normalizeAgentMemory(st.Agents[i])
		st.Agents[i].Attributes = normalizeAttributes(st.Agents[i].ID, st.Agents[i].Attributes)
	}
	if st.Episodes == nil {
		st.Episodes = []Episode{}
	}
	for i := range st.Episodes {
		st.Episodes[i] = hydrateEpisodeTimeline(st.Episodes[i])
	}
	if st.Arc.ActiveDramas == nil {
		st.Arc.ActiveDramas = []string{}
	}
	if st.Arc.OngoingTensions == nil {
		st.Arc.OngoingTensions = []string{}
	}
	if st.Arc.RecentEvents == nil {
		st.Arc.RecentEvents = []string{}
	}
	// Force-clear any stale active state from a crashed previous run.
	st.EpisodeActive = false
	st.LiveEpisode = nil

	return &Manager{
		store:  store,
		router: router,
		state:  st,
		runCtx: context.Background(),
	}, nil
}

// Run stores the server lifecycle context and blocks until it is cancelled.
func (m *Manager) Run(ctx context.Context) {
	m.mu.Lock()
	m.runCtx = ctx
	m.mu.Unlock()
	<-ctx.Done()
}

func (m *Manager) State() State {
	m.mu.Lock()
	defer m.mu.Unlock()
	return *m.state
}

// StartEpisode starts a new episode in the background.
// Returns an error if an episode is already running.
func (m *Manager) StartEpisode() error {
	m.mu.Lock()
	if m.state.EpisodeActive {
		m.mu.Unlock()
		return fmt.Errorf("episode already running")
	}
	m.state.EpisodeActive = true
	ctx := m.runCtx
	m.mu.Unlock()
	m.save()

	go func() {
		epCtx, cancel := context.WithTimeout(ctx, 20*time.Minute)
		defer cancel()
		m.runEpisode(epCtx)
	}()
	return nil
}

// StopEpisode force-clears the active episode state without touching agent data.
func (m *Manager) StopEpisode() {
	m.mu.Lock()
	m.state.EpisodeActive = false
	m.state.LiveEpisode = nil
	m.mu.Unlock()
	m.save()
}

// Reset wipes everything back to the first day.
func (m *Manager) Reset() {
	m.mu.Lock()
	m.state = defaultState()
	m.mu.Unlock()
	m.save()
}

func (m *Manager) UpdateAgentConfigs(updates []AgentConfigUpdate) {
	m.mu.Lock()
	byID := map[string]AgentConfigUpdate{}
	for _, update := range updates {
		byID[update.ID] = update
	}
	for i := range m.state.Agents {
		update, ok := byID[m.state.Agents[i].ID]
		if !ok {
			continue
		}
		if strings.TrimSpace(update.Origin) != "" {
			m.state.Agents[i].Origin = strings.TrimSpace(update.Origin)
		}
		if strings.TrimSpace(update.Voice) != "" {
			m.state.Agents[i].Voice = strings.TrimSpace(update.Voice)
		}
		m.state.Agents[i].VoiceID = strings.TrimSpace(update.VoiceID)
	}
	m.mu.Unlock()
	m.save()
}

// ─── episode engine ───────────────────────────────────────────────────────────

func (m *Manager) runEpisode(ctx context.Context) {
	defer func() {
		m.mu.Lock()
		m.state.EpisodeActive = false
		m.state.LiveEpisode = nil
		m.mu.Unlock()
		m.save()
		log.Println("villanos: episode complete")
	}()

	m.mu.Lock()
	epNum := m.state.Arc.EpisodeNum + 1
	agents := append([]Agent{}, m.state.Agents...)
	arc := m.state.Arc
	m.mu.Unlock()

	// Resolve LLM node once for the whole episode.
	heavyID, _, hasHeavy := m.router.ResolveRoute(ctx, "heavy")

	// ── Phase 1: opening narration ──────────────────────────────────────────
	live := &LiveEpisode{
		EpisodeNum: epNum,
		Phase:      "opening",
		Scenes:     []Scene{},
	}
	m.pushLive(live)

	title, opening := m.generateOpening(ctx, agents, arc, epNum, heavyID, hasHeavy)
	live.Title = title
	live.Opening = opening
	m.pushLive(live)
	log.Printf("villanos: ep%d opening generated", epNum)

	// ── Phase 2: scenes ──────────────────────────────────────────────────────
	live.Phase = "scene"
	m.pushLive(live)

	scenePlans := m.planScenes(ctx, agents, arc, opening, heavyID, hasHeavy)

	sceneIdx := 0
	for i, plan := range scenePlans {
		scene := Scene{
			ID:               fmt.Sprintf("ep%d_s%d", epNum, i+1),
			Type:             plan.Type,
			Location:         plan.Location,
			Narration:        plan.Narration,
			Participants:     plan.Participants,
			Purpose:          plan.Purpose,
			StartingMood:     plan.StartingMood,
			EndingMood:       plan.EndingMood,
			MustAdvance:      append([]string{}, plan.MustAdvance...),
			MustAvoid:        append([]string{}, plan.MustAvoid...),
			AudioPrompt:      plan.AudioPrompt,
			TargetDurationMs: plan.TargetDurationMs,
			Turns:            []DialogueTurn{},
		}
		live.Scenes = append(live.Scenes, scene)
		live.ActiveSceneIdx = sceneIdx
		m.pushLive(live)

		log.Printf("villanos: ep%d scene %d — %s", epNum, i+1, scene.Location)
		m.runSceneDialogue(ctx, sceneIdx, agents, arc, &live.Scenes[sceneIdx], live, heavyID, hasHeavy)
		m.validateAndRepairScene(ctx, sceneIdx, &live.Scenes[sceneIdx], live, heavyID, hasHeavy)
		live.Scenes[sceneIdx].EstimatedDurationMs = estimateSceneDurationMs(live.Scenes[sceneIdx])
		sceneIdx++

		interview := Scene{
			ID:               fmt.Sprintf("ep%d_s%d_interviews", epNum, i+1),
			Type:             "confessional",
			Location:         "Villa interview room",
			Narration:        "After that chat, they each step away for a quick private reaction.",
			Participants:     plan.Participants,
			Purpose:          "Let the cast privately process what changed in the previous scene.",
			StartingMood:     "reflective",
			EndingMood:       "revealing",
			MustAdvance:      append([]string{}, plan.MustAdvance...),
			MustAvoid:        append([]string{}, plan.MustAvoid...),
			AudioPrompt:      "quiet villa interview room tone, intimate confessional ambience, no speech, no lyrics",
			TargetDurationMs: 90000,
			Turns:            []DialogueTurn{},
		}
		live.Scenes = append(live.Scenes, interview)
		live.ActiveSceneIdx = sceneIdx
		m.pushLive(live)
		m.runSceneInterviews(ctx, sceneIdx, agents, arc, &live.Scenes[sceneIdx], live, heavyID, hasHeavy)
		m.validateAndRepairScene(ctx, sceneIdx, &live.Scenes[sceneIdx], live, heavyID, hasHeavy)
		live.Scenes[sceneIdx].EstimatedDurationMs = estimateSceneDurationMs(live.Scenes[sceneIdx])
		sceneIdx++
	}

	// ── Phase 3: closing narration ───────────────────────────────────────────
	live.Phase = "closing"
	m.pushLive(live)

	closing := m.generateClosing(ctx, agents, live, heavyID, hasHeavy)
	log.Printf("villanos: ep%d closing generated", epNum)

	// ── Phase 4: post-episode update ─────────────────────────────────────────
	live.Phase = "updating"
	m.pushLive(live)

	m.runPostEpisodeUpdate(ctx, live, agents, arc, heavyID, hasHeavy)

	// ── Save completed episode ───────────────────────────────────────────────
	episode := Episode{
		ID:      fmt.Sprintf("ep%d_%d", epNum, time.Now().UnixNano()),
		Number:  epNum,
		Time:    time.Now(),
		Title:   title,
		Opening: opening,
		Scenes:  live.Scenes,
		Closing: closing,
	}
	timeline := BuildEpisodeTimeline(episode)
	episode.Timeline = &timeline

	m.mu.Lock()
	m.state.Episodes = append(m.state.Episodes, episode)
	if len(m.state.Episodes) > maxEpisodes {
		m.state.Episodes = m.state.Episodes[len(m.state.Episodes)-maxEpisodes:]
	}
	m.mu.Unlock()
	m.save()

	log.Printf("villanos: ep%d saved (%d scenes)", epNum, len(episode.Scenes))
}

// ── opening narration ─────────────────────────────────────────────────────────

func (m *Manager) generateOpening(ctx context.Context, agents []Agent, arc VillaArc, epNum int, heavyID, hasHeavy interface{}) (title, opening string) {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	var systemMsg, userMsg string

	if epNum == 1 {
		descs := make([]string, len(agents))
		for i, a := range agents {
			descs[i] = fmt.Sprintf("- %s, %d, %s: %s", a.Name, a.Age, a.Origin, a.Personality)
		}
		systemMsg = `You write Love Island UK narrator voiceover. Channel Iain Stirling's warm, witty, dramatic style. Return only final narrator copy and the TITLE line. No analysis, notes, XML tags, markdown, or drafts.`
		userMsg = fmt.Sprintf(`Write the opening narration for Episode 1 of a new Love Island series.
The six contestants are arriving at the villa for the first time.

Contestants:
%s

Write ~150 words of dramatic, warm narrator voiceover introducing them as they arrive.
Hint at each personality and the potential drama ahead.
End with them all gathering for the first time.
Use "contestants", "people", "the cast", or "villa residents" instead of "islanders".

Then on a new line write the episode title as: TITLE: "Something Catchy"`, strings.Join(descs, "\n"))
	} else {
		events := "Nothing yet."
		if len(arc.RecentEvents) > 0 {
			events = "- " + strings.Join(arc.RecentEvents, "\n- ")
		}
		systemMsg = `You write Love Island UK narrator voiceover. Channel Iain Stirling's warm, witty, dramatic style. Return only final narrator copy and the TITLE line. No analysis, notes, XML tags, markdown, or drafts.`
		userMsg = fmt.Sprintf(`Write the opening narration for Episode %d of Love Island.

Recent events:
%s

Current drama: %s
Ongoing tensions: %s

Write ~120 words of dramatic narrator voiceover recapping what happened and teasing what's coming tonight.
Build excitement. Be specific about the drama.
Use "contestants", "people", "the cast", or "villa residents" instead of "islanders".

Then on a new line write the episode title as: TITLE: "Something Catchy"`,
			epNum, events, arc.CurrentDrama, strings.Join(arc.OngoingTensions, "; "))
	}

	raw := m.callLLM(ctx, systemMsg, userMsg, hID, hOK)
	raw = stripThinking(raw)

	// Extract title
	titleRe := regexp.MustCompile(`(?i)TITLE:\s*"([^"]+)"`)
	if m := titleRe.FindStringSubmatch(raw); len(m) > 1 {
		title = m[1]
		opening = strings.TrimSpace(titleRe.ReplaceAllString(raw, ""))
	} else {
		title = fmt.Sprintf("Episode %d", epNum)
		opening = raw
	}
	return
}

// ── scene planning ────────────────────────────────────────────────────────────

type scenePlan struct {
	Type             string   `json:"type"`
	Participants     []string `json:"participants"`
	Location         string   `json:"location"`
	Purpose          string   `json:"purpose"`
	StartingMood     string   `json:"starting_mood"`
	EndingMood       string   `json:"ending_mood"`
	Narration        string   `json:"narration"`
	MustAdvance      []string `json:"must_advance"`
	MustAvoid        []string `json:"must_avoid"`
	AudioPrompt      string   `json:"audio_prompt"`
	TargetDurationMs int      `json:"target_duration_ms"`
	Group            bool     `json:"group,omitempty"`
}

func (m *Manager) planScenes(ctx context.Context, agents []Agent, arc VillaArc, opening string, heavyID, hasHeavy interface{}) []scenePlan {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	agentSummaries := make([]string, len(agents))
	for i, a := range agents {
		feelings := []string{}
		for _, b := range agents {
			if b.ID == a.ID {
				continue
			}
			if f, ok := a.Feelings[b.ID]; ok {
				feelings = append(feelings, fmt.Sprintf("%s:%+d", b.Name, f.Score))
			}
		}
		feelStr := "no feelings yet"
		if len(feelings) > 0 {
			feelStr = strings.Join(feelings, ", ")
		}
		memoryLine := agentMemoryPromptSection(a)
		if memoryLine == "" {
			memoryLine = "no private intentions yet"
		}
		agentSummaries[i] = fmt.Sprintf("%s (id=%s, origin=%s, voice=%s, status=%s, attributes: %s, feelings: %s, memory: %s)", a.Name, a.ID, a.Origin, a.Voice, a.Status, attributesPromptLine(a.Attributes), feelStr, memoryLine)
	}

	if arc.EpisodeNum == 0 {
		return firstEpisodeScenes(agents)
	}

	antiRepeat := buildAntiRepetitionRules(agents, arc)
	antiRepeatText := "none yet"
	if len(antiRepeat) > 0 {
		antiRepeatText = "- " + strings.Join(antiRepeat, "\n- ")
	}

	systemMsg := `You are the story producer for a premium reality dating show set in a villa. Plan beats only. Return valid JSON only, no explanation.`
	userMsg := fmt.Sprintf(`Plan %d dramatic production scenes for this villa episode.

Contestants:
%s

Arc: %s
Opening: %s
Anti-repetition rules:
%s

Return JSON:
{
  "novelty_seed": "<fresh production idea for this episode>",
  "scenes": [
    {
      "type": "group|pair|three_person|challenge|confessional_setup",
      "participants": ["agent_id1", "agent_id2"],
      "location": "The fire pit",
      "purpose": "<what this scene must accomplish>",
      "starting_mood": "<opening emotional temperature>",
      "ending_mood": "<how the scene should leave them>",
      "narration": "Meanwhile, by the fire pit, [names] are having a private chat that's about to get very complicated...",
      "must_advance": ["<specific relationship, secret, or tension that changes>"],
      "must_avoid": ["<stale topic to avoid unless escalated>"],
      "audio_prompt": "<subtle ambience/music prompt for this scene, no speech, no lyrics>",
      "target_duration_ms": 150000
    }
  ]
}

Rules:
- Target a 10-15 minute episode when conversations, confessionals, narrator, ambience and stings are played.
- Use 4 scenes: at least one group/challenge beat, at least one pair chat, at least one three-person tension or reveal.
- Each scene has 2 agents, 3 for confrontations, or 4+ for group/challenge.
- Different pairs for each scene — spread the drama
- Locations: bedroom, kitchen, fire pit, pool, garden, gym, balcony, living area, bathroom corridor
- Narration is 1-2 sentences of narrator voiceover introducing the scene
- Make scenes that create natural drama based on the contestants' feelings, attributes and history
- Do not repeat stale topics from private memory unless the scene introduces a new fact, accusation, decision, or emotional escalation
- Every scene must move a relationship, secret, or tension forward
- Must include one genuinely fresh situation or production beat, not just another "where is your head at" chat
- target_duration_ms should be 120000-210000 for conversations/challenges
- Ensure agent IDs exactly match the ones provided`,
		scenesPerEp, strings.Join(agentSummaries, "\n"), arc.CurrentDrama, opening, antiRepeatText)

	raw := m.callLLM(ctx, systemMsg, userMsg, hID, hOK)
	jsonStr := jsonRe.FindString(raw)

	var parsed struct {
		Scenes []scenePlan `json:"scenes"`
	}
	if jsonStr != "" {
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err == nil && len(parsed.Scenes) > 0 {
			// Validate agent IDs
			validIDs := map[string]bool{}
			for _, a := range agents {
				validIDs[a.ID] = true
			}
			valid := []scenePlan{}
			for _, s := range parsed.Scenes {
				ok := true
				for _, pid := range s.Participants {
					if !validIDs[pid] {
						ok = false
						break
					}
				}
				if ok && len(s.Participants) >= 2 {
					s = normalizeScenePlan(s)
					valid = append(valid, s)
				}
			}
			if len(valid) > 0 {
				if len(valid) > scenesPerEp {
					valid = valid[:scenesPerEp]
				}
				return valid
			}
		}
	}

	// Fallback: auto-pick pairs
	log.Println("villanos: scene planning fallback — auto-picking pairs")
	return autoPickScenes(agents)
}

func autoPickScenes(agents []Agent) []scenePlan {
	// Sort pairs by relationship strength
	type pair struct {
		a, b     Agent
		strength int
	}
	var pairs []pair
	for i, a := range agents {
		for j, b := range agents {
			if i >= j {
				continue
			}
			s := 0
			if f, ok := a.Feelings[b.ID]; ok {
				v := f.Score
				if v < 0 {
					v = -v
				}
				s += v
			}
			if f, ok := b.Feelings[a.ID]; ok {
				v := f.Score
				if v < 0 {
					v = -v
				}
				s += v
			}
			pairs = append(pairs, pair{a, b, s})
		}
	}
	// Sort descending by strength
	for i := range pairs {
		for j := i + 1; j < len(pairs); j++ {
			if pairs[j].strength > pairs[i].strength {
				pairs[i], pairs[j] = pairs[j], pairs[i]
			}
		}
	}

	locations := []string{"fire pit", "kitchen", "bedroom", "pool", "garden", "balcony"}
	used := map[string]bool{}
	plans := []scenePlan{}
	for _, p := range pairs {
		if used[p.a.ID] && used[p.b.ID] {
			continue
		}
		loc := locations[rand.Intn(len(locations))]
		plans = append(plans, scenePlan{
			Participants:     []string{p.a.ID, p.b.ID},
			Location:         loc,
			Type:             "pair",
			Purpose:          fmt.Sprintf("%s and %s test whether their chemistry is real or just villa nerves.", p.a.Name, p.b.Name),
			StartingMood:     "curious",
			EndingMood:       "unresolved",
			Narration:        fmt.Sprintf("Meanwhile, at the %s, %s and %s find themselves alone...", loc, p.a.Name, p.b.Name),
			MustAdvance:      []string{fmt.Sprintf("Change how %s and %s read each other.", p.a.Name, p.b.Name)},
			MustAvoid:        buildAntiRepetitionRules([]Agent{p.a, p.b}, VillaArc{}),
			AudioPrompt:      fmt.Sprintf("subtle villa ambience at the %s, intimate reality show tension, no speech, no lyrics", loc),
			TargetDurationMs: 150000,
		})
		used[p.a.ID] = true
		used[p.b.ID] = true
		if len(plans) >= scenesPerEp {
			break
		}
	}
	// If not enough pairs, fill with random ones
	for len(plans) < scenesPerEp && len(agents) >= 2 {
		i := rand.Intn(len(agents))
		j := rand.Intn(len(agents))
		if i != j {
			loc := locations[rand.Intn(len(locations))]
			plans = append(plans, scenePlan{
				Participants:     []string{agents[i].ID, agents[j].ID},
				Location:         loc,
				Type:             "pair",
				Purpose:          "A private chat that reveals a new attraction, doubt, or misunderstanding.",
				StartingMood:     "playful",
				EndingMood:       "questioning",
				Narration:        fmt.Sprintf("Over at the %s, %s and %s are having a moment...", loc, agents[i].Name, agents[j].Name),
				MustAdvance:      []string{"Move one relationship forward or expose a doubt."},
				MustAvoid:        buildAntiRepetitionRules([]Agent{agents[i], agents[j]}, VillaArc{}),
				AudioPrompt:      fmt.Sprintf("subtle villa ambience at the %s, soft reality TV underscore, no speech, no lyrics", loc),
				TargetDurationMs: 150000,
			})
		}
	}
	return plans
}

func normalizeScenePlan(plan scenePlan) scenePlan {
	plan.Type = strings.TrimSpace(plan.Type)
	if plan.Type == "" {
		if plan.Group || len(plan.Participants) > 3 {
			plan.Type = "group"
		} else if len(plan.Participants) == 3 {
			plan.Type = "three_person"
		} else {
			plan.Type = "pair"
		}
	}
	plan.Location = strings.TrimSpace(plan.Location)
	if plan.Location == "" {
		plan.Location = "villa garden"
	}
	plan.Purpose = strings.TrimSpace(plan.Purpose)
	if plan.Purpose == "" {
		plan.Purpose = "Move one relationship, attraction, secret, or tension forward."
	}
	plan.StartingMood = strings.TrimSpace(plan.StartingMood)
	if plan.StartingMood == "" {
		plan.StartingMood = "curious"
	}
	plan.EndingMood = strings.TrimSpace(plan.EndingMood)
	if plan.EndingMood == "" {
		plan.EndingMood = "unresolved"
	}
	if len(plan.MustAdvance) == 0 {
		plan.MustAdvance = []string{plan.Purpose}
	}
	if len(plan.MustAvoid) == 0 {
		plan.MustAvoid = []string{"Do not repeat the same attraction or trust question without a new reason."}
	}
	if strings.TrimSpace(plan.AudioPrompt) == "" {
		plan.AudioPrompt = fmt.Sprintf("subtle reality TV villa ambience at %s, no speech, no lyrics", plan.Location)
	}
	if plan.TargetDurationMs <= 0 {
		plan.TargetDurationMs = 150000
	}
	if plan.TargetDurationMs < 90000 {
		plan.TargetDurationMs = 90000
	}
	if plan.TargetDurationMs > 240000 {
		plan.TargetDurationMs = 240000
	}
	return plan
}

func firstEpisodeScenes(agents []Agent) []scenePlan {
	ids := make([]string, 0, len(agents))
	for _, a := range agents {
		ids = append(ids, a.ID)
	}
	plans := []scenePlan{}
	if len(ids) > 0 {
		plans = append(plans, scenePlan{
			Participants:     ids,
			Location:         "villa daybeds",
			Type:             "group",
			Purpose:          "Let every contestant introduce themselves with first-day joy, flirtation, and immediate first impressions.",
			StartingMood:     "excited",
			EndingMood:       "energized",
			Narration:        "Everyone gathers at the villa daybeds for the first proper group chat: big smiles, nervous laughs, fresh outfits, and all the energy of six people trying to make the best possible first impression.",
			MustAdvance:      []string{"Establish each contestant's vibe and at least two early sparks."},
			MustAvoid:        []string{"Do not make the introductions sound like biographies."},
			AudioPrompt:      "sunny villa daybed ambience, bright reality TV first-day energy, distant pool, no speech, no lyrics",
			TargetDurationMs: 210000,
			Group:            true,
		})
	}
	plans = append(plans, autoPickScenes(agents)...)
	return plans
}

// ── scene dialogue ────────────────────────────────────────────────────────────

func (m *Manager) runSceneDialogue(ctx context.Context, sceneIdx int, agents []Agent, arc VillaArc, scene *Scene, live *LiveEpisode, heavyID, hasHeavy interface{}) {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	participants := filterAgentsByIDs(agents, scene.Participants)
	if len(participants) == 0 {
		return
	}

	transcript := []string{}
	lastSpeakerID := ""
	initialIntroScene := arc.EpisodeNum == 0 && sceneIdx == 0 && len(participants) > 3

	totalTurns := turnsPerScene
	if initialIntroScene && len(participants)+2 > totalTurns {
		totalTurns = len(participants) + 8
	}
	if scene.Type == "group" || scene.Type == "challenge" {
		totalTurns += 4
	}
	if scene.Type == "three_person" {
		totalTurns += 2
	}
	if totalTurns > maxTurnsPerScene {
		totalTurns = maxTurnsPerScene
	}

	for t := 0; t < totalTurns; t++ {
		speaker := pickDialogueSpeaker(participants, lastSpeakerID)
		if initialIntroScene && t < len(participants) {
			speaker = &participants[t]
		}
		if speaker == nil {
			break
		}

		// Only show the last 5 lines — agents react to what was just said
		context := transcript
		if len(context) > 5 {
			context = context[len(context)-5:]
		}

		var userContent string
		if initialIntroScene && t < len(participants) {
			userContent = fmt.Sprintf(
				"Location: %s\nSituation: %s\nScene purpose: %s\nMust advance: %s\nMust avoid: %s\n\nThis is %s's first introduction to the whole villa. Write one joyful, high-energy spoken introduction. Include who they are, what vibe they bring, and what they are hoping for in the villa. Make it feel like a real first-day group chat, not a biography.",
				scene.Location, scene.Narration, scene.Purpose, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "), speaker.Name,
			)
		} else if initialIntroScene {
			userContent = fmt.Sprintf(
				"Scene purpose: %s\nMust advance: %s\nMust avoid: %s\n--- WHAT WAS JUST SAID ---\n%s\n---\n\n%s reacts to the introductions with one warm, excited spoken line. Pick up on someone specific, flirt lightly or joke if it fits, and keep the first-day energy moving:",
				scene.Purpose, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "), strings.Join(context, "\n"), speaker.Name,
			)
		} else if t == 0 {
			userContent = fmt.Sprintf(
				"Location: %s\nSituation: %s\nScene type: %s\nPurpose: %s\nStarting mood: %s\nEnding mood target: %s\nMust advance: %s\nMust avoid: %s\n\n%s speaks first. Write a natural spoken line only. It can be a little longer if the moment is emotional.",
				scene.Location, scene.Narration, scene.Type, scene.Purpose, scene.StartingMood, scene.EndingMood, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "), speaker.Name,
			)
		} else {
			userContent = fmt.Sprintf(
				"Scene purpose: %s\nEnding mood target: %s\nMust advance before the scene ends: %s\nAvoid stale loops: %s\nEstimated scene duration so far: %s of target %s\n--- WHAT WAS JUST SAID ---\n%s\n---\n\n%s responds with one natural spoken line only. Keep it human, specific, and make the scene move:",
				scene.Purpose, scene.EndingMood, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "), formatDurationForPrompt(estimateSceneDurationMs(*scene)), formatDurationForPrompt(scene.TargetDurationMs), strings.Join(context, "\n"), speaker.Name,
			)
		}

		msgs := []ai.Message{
			{Role: "system", Content: sceneSystemPrompt(*speaker, agents, participants, arc, *scene)},
			{Role: "user", Content: userContent},
		}

		var resp *ai.ChatResponse
		var callErr error
		if hOK {
			resp, callErr = m.router.ChatOnNode(ctx, hID, msgs, nil)
		} else {
			resp, callErr = m.router.Chat(ctx, "villanos", msgs)
		}

		if callErr != nil {
			log.Printf("villanos: dialogue error %s: %v", speaker.Name, callErr)
			continue
		}
		if resp == nil {
			continue
		}

		maxWords := 34
		if initialIntroScene && t < len(participants) {
			maxWords = 56
		} else if initialIntroScene {
			maxWords = 42
		}
		line := cleanDialogueLineWithLimit(resp.Message.Content, speaker.Name, maxWords)
		if line == "" {
			continue
		}

		turn := DialogueTurn{
			AgentID:   speaker.ID,
			AgentName: speaker.Name,
			Content:   line,
			Emotion:   inferDialogueEmotion(line, *speaker, false),
			Time:      time.Now(),
		}
		scene.Turns = append(scene.Turns, turn)
		transcript = append(transcript, fmt.Sprintf("%s: %s", speaker.Name, line))
		lastSpeakerID = speaker.ID

		// Push live update after every turn
		m.mu.Lock()
		if liveEp := m.state.LiveEpisode; liveEp != nil && sceneIdx < len(liveEp.Scenes) {
			liveEp.Scenes[sceneIdx].Turns = append([]DialogueTurn{}, scene.Turns...)
		}
		m.mu.Unlock()
		m.save()

		log.Printf("villanos: ep scene%d turn%d — %s", sceneIdx+1, t+1, speaker.Name)

		if t >= turnsPerScene-1 && estimateSceneDurationMs(*scene) >= int(float64(scene.TargetDurationMs)*0.9) {
			break
		}
	}
}

func (m *Manager) runSceneInterviews(ctx context.Context, sceneIdx int, agents []Agent, arc VillaArc, scene *Scene, live *LiveEpisode, heavyID, hasHeavy interface{}) {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	participants := filterAgentsByIDs(agents, scene.Participants)
	if len(participants) == 0 {
		return
	}

	context := recentSceneLines(live.Scenes, sceneIdx)
	for _, speaker := range participants {
		msgs := []ai.Message{
			{Role: "system", Content: interviewSystemPrompt(speaker, agents, arc, *scene)},
			{Role: "user", Content: fmt.Sprintf("Scene purpose: %s\nMust advance: %s\nAvoid repeating: %s\nWhat just happened:\n%s\n\nGive %s's private interview reaction. Mention who they are feeling drawn to, wary of, or what they are hiding if it fits. Add a new private realization, not a recap.", scene.Purpose, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "), context, speaker.Name)},
		}

		var resp *ai.ChatResponse
		var callErr error
		if hOK {
			resp, callErr = m.router.ChatOnNode(ctx, hID, msgs, nil)
		} else {
			resp, callErr = m.router.Chat(ctx, "villanos", msgs)
		}
		if callErr != nil {
			log.Printf("villanos: interview error %s: %v", speaker.Name, callErr)
			continue
		}
		if resp == nil {
			continue
		}

		line := cleanDialogueLine(resp.Message.Content, speaker.Name)
		if line == "" {
			continue
		}

		turn := DialogueTurn{
			AgentID:   speaker.ID,
			AgentName: speaker.Name,
			Content:   line,
			Emotion:   inferDialogueEmotion(line, speaker, true),
			Time:      time.Now(),
		}
		scene.Turns = append(scene.Turns, turn)

		m.mu.Lock()
		if liveEp := m.state.LiveEpisode; liveEp != nil && sceneIdx < len(liveEp.Scenes) {
			liveEp.Scenes[sceneIdx].Turns = append([]DialogueTurn{}, scene.Turns...)
		}
		m.mu.Unlock()
		m.save()
	}
}

func (m *Manager) validateAndRepairScene(ctx context.Context, sceneIdx int, scene *Scene, live *LiveEpisode, heavyID, hasHeavy interface{}) {
	deterministicRepairScene(scene)
	validation := validateScene(*scene)
	scene.Validation = &validation
	if validation.NeedsRepair && len(scene.Turns) > 0 {
		hID, _ := heavyID.(string)
		hOK, _ := hasHeavy.(bool)
		raw := m.callLLM(
			ctx,
			`You are a strict continuity editor for a reality dating show. Return valid JSON only. No analysis, no markdown.`,
			repairScenePrompt(*scene, validation),
			hID,
			hOK,
		)
		if applySceneRepair(scene, raw) {
			after := validateScene(*scene)
			after.Repaired = true
			after.RepairReason = strings.Join(validation.Issues, "; ")
			scene.Validation = &after
		}
	}
	scene.EstimatedDurationMs = estimateSceneDurationMs(*scene)

	m.mu.Lock()
	if liveEp := m.state.LiveEpisode; liveEp != nil && sceneIdx < len(liveEp.Scenes) {
		liveEp.Scenes[sceneIdx] = *scene
	}
	m.mu.Unlock()
	m.save()
}

// ── closing narration ─────────────────────────────────────────────────────────

func (m *Manager) generateClosing(ctx context.Context, agents []Agent, live *LiveEpisode, heavyID, hasHeavy interface{}) string {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	// Build a short episode summary for the LLM
	summaryParts := []string{}
	for _, s := range live.Scenes {
		if len(s.Turns) > 0 {
			lines := make([]string, len(s.Turns))
			for i, t := range s.Turns {
				lines[i] = fmt.Sprintf("%s: %s", t.AgentName, t.Content)
			}
			summaryParts = append(summaryParts, fmt.Sprintf("[%s]\n%s", s.Location, strings.Join(lines, "\n")))
		}
	}

	systemMsg := `You write Love Island UK narrator voiceover. Channel Iain Stirling's warm, witty, dramatic style. Return only final narrator copy. No analysis, notes, XML tags, markdown, or drafts.`
	userMsg := fmt.Sprintf(`Write the closing narration for Episode %d: "%s".

What happened tonight:
%s

Write ~100 words of narrator voiceover wrapping up tonight's drama.
Tease what unresolved drama might blow up next episode.
End on a dramatic cliffhanger note.`,
		live.EpisodeNum, live.Title, strings.Join(summaryParts, "\n\n"))

	raw := m.callLLM(ctx, systemMsg, userMsg, hID, hOK)
	closing := stripThinking(raw)

	// Update live state with closing
	m.mu.Lock()
	if liveEp := m.state.LiveEpisode; liveEp != nil {
		// We don't store closing in LiveEpisode directly, the frontend polls
	}
	m.mu.Unlock()

	return closing
}

// ── post-episode update ───────────────────────────────────────────────────────

type postEpisodeJSON struct {
	AgentMemories      map[string][]string `json:"agent_memories"`
	AgentMemoryUpdates []agentMemoryUpdate `json:"agent_memory_updates"`
	FeelingUpdates     []struct {
		From  string `json:"from"`
		To    string `json:"to"`
		Score int    `json:"score"`
		Note  string `json:"note"`
	} `json:"feeling_updates"`
	StatusUpdates []struct {
		AgentID     string `json:"agent_id"`
		Status      string `json:"status"`
		CoupledWith string `json:"coupled_with"`
	} `json:"status_updates"`
	AttributeUpdates []attributeUpdate `json:"attribute_updates"`
	ArcUpdate        struct {
		CurrentDrama    string   `json:"current_drama"`
		ActiveDramas    []string `json:"active_dramas"`
		OngoingTensions []string `json:"ongoing_tensions"`
		RecentEvents    []string `json:"recent_events"`
	} `json:"arc_update"`
}

type attributeUpdate struct {
	AgentID       string `json:"agent_id"`
	Jealousy      *int   `json:"jealousy,omitempty"`
	Confidence    *int   `json:"confidence,omitempty"`
	Drama         *int   `json:"drama,omitempty"`
	Loyalty       *int   `json:"loyalty,omitempty"`
	Flirtiness    *int   `json:"flirtiness,omitempty"`
	Honesty       *int   `json:"honesty,omitempty"`
	Empathy       *int   `json:"empathy,omitempty"`
	Impulsiveness *int   `json:"impulsiveness,omitempty"`
	Insecurity    *int   `json:"insecurity,omitempty"`
	Humor         *int   `json:"humor,omitempty"`
	Patience      *int   `json:"patience,omitempty"`
	Commitment    *int   `json:"commitment,omitempty"`
	Strategy      *int   `json:"strategy,omitempty"`
	Reason        string `json:"reason,omitempty"`
}

func (m *Manager) runPostEpisodeUpdate(ctx context.Context, live *LiveEpisode, agents []Agent, arc VillaArc, heavyID, hasHeavy interface{}) {
	hID, _ := heavyID.(string)
	hOK, _ := hasHeavy.(bool)

	// Build full transcript
	allLines := []string{}
	for _, s := range live.Scenes {
		allLines = append(allLines, fmt.Sprintf("[Scene — %s]", s.Location))
		for _, t := range s.Turns {
			allLines = append(allLines, fmt.Sprintf("%s: %s", t.AgentName, t.Content))
		}
	}

	agentProfiles := make([]string, len(agents))
	for i, a := range agents {
		agentProfiles[i] = fmt.Sprintf("%s (id=%s): %s", a.Name, a.ID, attributesPromptLine(a.Attributes))
	}

	existingEvents := ""
	if len(arc.RecentEvents) > 0 {
		existingEvents = "\nExisting events (carry over the most important):\n- " + strings.Join(arc.RecentEvents, "\n- ")
	}

	systemMsg := `You are a Love Island episode writer updating character states. Return valid JSON only.`
	userMsg := fmt.Sprintf(`Episode %d transcript:
%s

Agents and current attributes:
%s%s

Return JSON:
{
  "agent_memories": {
    "<agent_id>": ["I found out...", "I told..."]
  },
  "agent_memory_updates": [
    {
      "agent_id": "<id>",
      "self_story": "<updated one-sentence self story>",
      "private_memory": "<first-person memory of what I learned or hid>",
      "private_feelings": {
        "<other_agent_id>": {"attraction": 0, "trust": 0, "jealousy": 0, "resentment": 0, "curiosity": 0, "note": "<private truth>"}
      },
      "secrets": ["<things this person is not saying out loud>"],
      "intentions": ["<what this person wants to do next>"],
      "avoid_topics": ["<topic this person/show should not repeat unless it escalates>"],
      "recent_scene_refs": ["<specific recent beat>"]
    }
  ],
  "feeling_updates": [
    {"from": "<agent_id>", "to": "<agent_id>", "score": <-100 to 100>, "note": "<short>"}
  ],
  "status_updates": [
    {"agent_id": "<id>", "status": "coupled|single|recoupled|dumped", "coupled_with": "<name or empty>"}
  ],
  "attribute_updates": [
    {
      "agent_id": "<id>",
      "jealousy": 0,
      "confidence": 0,
      "drama": 0,
      "loyalty": 0,
      "flirtiness": 0,
      "honesty": 0,
      "empathy": 0,
      "impulsiveness": 0,
      "insecurity": 0,
      "humor": 0,
      "patience": 0,
      "commitment": 0,
      "strategy": 0,
      "reason": "<why these shifted>"
    }
  ],
  "arc_update": {
    "current_drama": "<main ongoing drama>",
    "active_dramas": ["<drama>"],
    "ongoing_tensions": ["<tension>"],
    "recent_events": ["<most recent first>"]
  }
}

Rules:
- agent_memories: 1-3 first-person memories per agent who had significant moments
- agent_memory_updates: include every active agent. Keep it private, specific, and useful for future dialogue.
- avoid_topics should prevent circular chats. Only repeat a topic if there is a new fact, accusation, or emotional escalation.
- feeling_updates: only significant shifts this episode
- status_updates: only if status actually changed during this episode
- attribute_updates: include every active agent. Use 0-100 absolute scores.
- attribute_updates should drift from current values based on what happened, usually 2-8 points per trait, bigger only for major moments.
- Make attributes evolve with behavior: lies lower honesty, vulnerability raises empathy/commitment, betrayal raises jealousy/insecurity/drama, calm conflict raises patience.
- arc_update.recent_events: max 6, most recent first
- Be specific and dramatic`,
		live.EpisodeNum,
		strings.Join(allLines, "\n"),
		strings.Join(agentProfiles, "\n"),
		existingEvents,
	)

	raw := m.callLLM(ctx, systemMsg, userMsg, hID, hOK)
	jsonStr := jsonRe.FindString(raw)

	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.Arc.EpisodeNum++ // always increment

	if jsonStr == "" {
		log.Println("villanos: post-episode: no JSON in response")
		return
	}

	var update postEpisodeJSON
	if err := json.Unmarshal([]byte(jsonStr), &update); err != nil {
		log.Printf("villanos: post-episode JSON parse error: %v", err)
		return
	}

	// Apply memories
	for i := range m.state.Agents {
		if mems, ok := update.AgentMemories[m.state.Agents[i].ID]; ok {
			m.state.Agents[i].Memories = append(m.state.Agents[i].Memories, mems...)
			if len(m.state.Agents[i].Memories) > maxMemories {
				m.state.Agents[i].Memories = m.state.Agents[i].Memories[len(m.state.Agents[i].Memories)-maxMemories:]
			}
		}
	}

	// Apply richer agent-owned memory updates.
	for _, mu := range update.AgentMemoryUpdates {
		for i := range m.state.Agents {
			if m.state.Agents[i].ID == mu.AgentID {
				applyAgentMemoryUpdate(&m.state.Agents[i], mu)
			}
		}
	}

	// Apply feeling updates
	for _, fu := range update.FeelingUpdates {
		for i := range m.state.Agents {
			if m.state.Agents[i].ID == fu.From {
				m.state.Agents[i].Feelings[fu.To] = Feeling{Score: fu.Score, Note: fu.Note}
			}
		}
	}

	// Apply status updates
	for _, su := range update.StatusUpdates {
		for i := range m.state.Agents {
			if m.state.Agents[i].ID == su.AgentID {
				m.state.Agents[i].Status = su.Status
				m.state.Agents[i].CoupledWith = su.CoupledWith
			}
		}
	}

	// Apply attribute updates
	for _, au := range update.AttributeUpdates {
		for i := range m.state.Agents {
			if m.state.Agents[i].ID == au.AgentID {
				applyAttributeUpdate(&m.state.Agents[i].Attributes, au)
			}
		}
	}

	// Apply arc update
	if update.ArcUpdate.CurrentDrama != "" {
		m.state.Arc.CurrentDrama = update.ArcUpdate.CurrentDrama
	}
	if len(update.ArcUpdate.ActiveDramas) > 0 {
		m.state.Arc.ActiveDramas = update.ArcUpdate.ActiveDramas
	}
	if len(update.ArcUpdate.OngoingTensions) > 0 {
		m.state.Arc.OngoingTensions = update.ArcUpdate.OngoingTensions
	}
	if len(update.ArcUpdate.RecentEvents) > 0 {
		m.state.Arc.RecentEvents = update.ArcUpdate.RecentEvents
		if len(m.state.Arc.RecentEvents) > maxRecentEvents {
			m.state.Arc.RecentEvents = m.state.Arc.RecentEvents[:maxRecentEvents]
		}
	}

	log.Printf("villanos: post-episode applied — now ep %d", m.state.Arc.EpisodeNum)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func (m *Manager) pushLive(live *LiveEpisode) {
	m.mu.Lock()
	cp := *live
	cp.Scenes = append([]Scene{}, live.Scenes...)
	timeline := BuildLiveEpisodeTimeline(cp)
	cp.Timeline = &timeline
	m.state.LiveEpisode = &cp
	m.mu.Unlock()
	m.save()
}

func (m *Manager) callLLM(ctx context.Context, system, user, heavyID string, hasHeavy bool) string {
	msgs := []ai.Message{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
	var resp *ai.ChatResponse
	var err error
	if hasHeavy {
		resp, err = m.router.ChatOnNode(ctx, heavyID, msgs, nil)
	} else {
		resp, err = m.router.Chat(ctx, "villanos", msgs)
	}
	if err != nil || resp == nil {
		log.Printf("villanos: LLM call failed: %v", err)
		return ""
	}
	return resp.Message.Content
}

func (m *Manager) save() {
	m.mu.Lock()
	st := m.state
	m.mu.Unlock()
	if err := m.store.Save(st); err != nil {
		logger.Error("villanos: save: " + err.Error())
	}
}

// filterAgentsByIDs returns agents matching the given ID list.
func filterAgentsByIDs(agents []Agent, ids []string) []Agent {
	idSet := map[string]bool{}
	for _, id := range ids {
		idSet[id] = true
	}
	result := []Agent{}
	for _, a := range agents {
		if idSet[a.ID] {
			result = append(result, a)
		}
	}
	return result
}

// pickDialogueSpeaker alternates strictly for 2 agents; uses weighted random for 3+.
func pickDialogueSpeaker(agents []Agent, lastID string) *Agent {
	if len(agents) == 0 {
		return nil
	}
	candidates := []Agent{}
	for _, a := range agents {
		if a.ID != lastID {
			candidates = append(candidates, a)
		}
	}
	if len(candidates) == 0 {
		candidates = agents
	}
	if len(candidates) == 1 {
		return &candidates[0]
	}
	// For 2 agents: purely alternate. For 3+: weight by drama.
	if len(agents) == 2 {
		return &candidates[0]
	}
	total := 0
	for _, c := range candidates {
		total += c.Attributes.Drama + 20
	}
	r := rand.Intn(total)
	cum := 0
	for i, c := range candidates {
		cum += c.Attributes.Drama + 20
		if r < cum {
			a := candidates[i]
			return &a
		}
	}
	a := candidates[len(candidates)-1]
	return &a
}

// stripThinking removes model reasoning tokens and code blocks.
func stripThinking(s string) string {
	s = thinkBlockRe.ReplaceAllString(s, "")
	s = analysisBlockRe.ReplaceAllString(s, "")
	s = analysisOpenRe.ReplaceAllString(s, "")
	s = codeBlockRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.TrimLeft(s, "-— ")
	s = leadingQuoteRe.ReplaceAllString(s, "")
	s = trailingQuoteRe.ReplaceAllString(s, "")
	return strings.Join(strings.Fields(s), " ")
}

func cleanDialogueLine(raw, speakerName string) string {
	return cleanDialogueLineWithLimit(raw, speakerName, 34)
}

func cleanDialogueLineWithLimit(raw, speakerName string, maxWords int) string {
	s := thinkBlockRe.ReplaceAllString(raw, "")
	s = analysisBlockRe.ReplaceAllString(s, "")
	s = analysisOpenRe.ReplaceAllString(s, "")
	s = codeBlockRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\n", " ")
	s = annotationRe.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	s = stripAnalysisPreamble(s)
	s = leadingBulletRe.ReplaceAllString(s, "")
	s = lineLabelRe.ReplaceAllString(s, "")

	if speakerName != "" {
		name := regexp.QuoteMeta(speakerName)
		speakerRe := regexp.MustCompile(`(?i)^\s*(?:as\s+)?` + name + `\s*(?:says|said|responds)?\s*[:,]\s*`)
		s = speakerRe.ReplaceAllString(s, "")
	}
	s = genericSpeakerRe.ReplaceAllString(s, "")

	s = strings.NewReplacer(
		"**", "",
		"__", "",
		"*", "",
		"_", "",
		"`", "",
	).Replace(s)
	s = leadingQuoteRe.ReplaceAllString(s, "")
	s = trailingQuoteRe.ReplaceAllString(s, "")
	s = strings.Join(strings.Fields(s), " ")
	s = keepSentences(s, 2)
	s = limitWords(s, maxWords)
	return strings.TrimSpace(s)
}

func stripAnalysisPreamble(s string) string {
	s = analysisHeadingRe.ReplaceAllString(s, "")
	s = numberedAnalysisRe.ReplaceAllString(s, "")
	s = finalLineRe.ReplaceAllString(s, "")
	if idx := strings.LastIndex(s, "---"); idx >= 0 {
		after := strings.TrimSpace(s[idx+3:])
		if after != "" {
			return after
		}
	}
	return strings.TrimSpace(s)
}

func keepSentences(s string, max int) string {
	if max <= 0 {
		return ""
	}
	ends := 0
	for i, r := range s {
		if r != '.' && r != '!' && r != '?' {
			continue
		}
		ends++
		if ends == max {
			return strings.TrimSpace(s[:i+1])
		}
	}
	return s
}

func limitWords(s string, max int) string {
	words := strings.Fields(s)
	if max <= 0 || len(words) <= max {
		return s
	}
	return strings.Join(words[:max], " ")
}

func inferDialogueEmotion(line string, speaker Agent, interview bool) string {
	text := strings.ToLower(line)
	attrs := clampAttributes(speaker.Attributes)

	switch {
	case hasAnyText(text, "haha", "ahah", "lol", "laugh", "cheeky"):
		return "laughs"
	case hasAnyText(text, "really?", "why", "how come", "what do you mean", "are you saying"):
		return "curious"
	case hasAnyText(text, "sorry", "hurt", "upset", "gutted", "cry", "tears", "silly"):
		if attrs.Insecurity >= 60 || attrs.Empathy >= 60 || interview {
			return "sad"
		}
		return "sighs"
	case hasAnyText(text, "mug", "lied", "liar", "don't trust", "dont trust", "out of order", "snake", "played me"):
		return "angry"
	case hasAnyText(text, "annoyed", "frustrated", "winding me up"):
		return "frustrated"
	case hasAnyText(text, "i don't know", "i dont know", "not sure", "scared", "nervous"):
		return "nervous"
	case hasAnyText(text, "maybe", "i guess", "..."):
		return "hesitates"
	case hasAnyText(text, "honestly", "look", "right", "i need a second"):
		return "exhales"
	case attrs.Humor >= 70 && hasAnyText(text, "cheeky", "banter", "joking", "joke"):
		return "playfully"
	case hasAnyText(text, "buzzing", "excited", "happy", "love that", "proper fit", "stunning", "stun", "can't lie", "cant lie"):
		return "excited"
	case hasAnyText(text, "between us", "just us", "keep this quiet", "don't tell", "dont tell"):
		return "whispers"
	case attrs.Drama >= 82 && attrs.Jealousy >= 70 && hasAnyText(text, "you", "her", "him", "them"):
		return "angry"
	case attrs.Flirtiness >= 82 && hasAnyText(text, "fit", "gorgeous", "stunning", "fancy"):
		return "happily"
	case interview && attrs.Insecurity >= 70:
		return "exhales"
	default:
		return "calm"
	}
}

func hasAnyText(text string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}

func recentSceneLines(scenes []Scene, beforeIdx int) string {
	if beforeIdx <= 0 || beforeIdx > len(scenes) {
		return ""
	}
	prev := scenes[beforeIdx-1]
	lines := []string{fmt.Sprintf("[%s]", prev.Location)}
	for _, t := range prev.Turns {
		lines = append(lines, fmt.Sprintf("%s: %s", t.AgentName, t.Content))
	}
	return strings.Join(lines, "\n")
}

func buildAntiRepetitionRules(agents []Agent, arc VillaArc) []string {
	rules := []string{}
	for _, event := range arc.RecentEvents {
		event = strings.TrimSpace(event)
		if event != "" {
			rules = append(rules, "Do not replay this recent beat without escalation: "+event)
		}
	}
	for _, agent := range agents {
		memory := normalizeAgentMemory(agent)
		for _, topic := range memory.AvoidTopics {
			topic = strings.TrimSpace(topic)
			if topic != "" {
				rules = append(rules, fmt.Sprintf("%s should avoid looping: %s", agent.Name, topic))
			}
		}
		for _, ref := range memory.RecentSceneRefs {
			ref = strings.TrimSpace(ref)
			if ref != "" {
				rules = append(rules, fmt.Sprintf("Recent %s beat needs a new angle if revisited: %s", agent.Name, ref))
			}
		}
	}
	if len(rules) > 10 {
		return rules[:10]
	}
	return rules
}

func formatDurationForPrompt(ms int) string {
	if ms <= 0 {
		return "0:00"
	}
	seconds := ms / 1000
	return fmt.Sprintf("%d:%02d", seconds/60, seconds%60)
}

func normalizeAgent(agent Agent) Agent {
	defaults := map[string]Agent{}
	for _, a := range defaultAgents() {
		defaults[a.ID] = a
	}
	if d, ok := defaults[agent.ID]; ok {
		if agent.Origin == "" {
			agent.Origin = d.Origin
		}
		if agent.Voice == "" {
			agent.Voice = d.Voice
		}
	}
	return agent
}

func defaultAttributesByID() map[string]AgentAttributes {
	defaults := map[string]AgentAttributes{}
	for _, a := range defaultAgents() {
		defaults[a.ID] = a.Attributes
	}
	return defaults
}

func normalizeAttributes(agentID string, attrs AgentAttributes) AgentAttributes {
	defaults, ok := defaultAttributesByID()[agentID]
	if !ok {
		defaults = AgentAttributes{
			Jealousy: 50, Confidence: 50, Drama: 50, Loyalty: 50, Flirtiness: 50,
			Honesty: 50, Empathy: 50, Impulsiveness: 50, Insecurity: 50, Humor: 50, Patience: 50, Commitment: 50, Strategy: 50,
		}
	}
	if attrs == (AgentAttributes{}) {
		return defaults
	}
	if attrs.Honesty == 0 && attrs.Empathy == 0 && attrs.Impulsiveness == 0 && attrs.Insecurity == 0 &&
		attrs.Humor == 0 && attrs.Patience == 0 && attrs.Commitment == 0 && attrs.Strategy == 0 {
		attrs.Honesty = defaults.Honesty
		attrs.Empathy = defaults.Empathy
		attrs.Impulsiveness = defaults.Impulsiveness
		attrs.Insecurity = defaults.Insecurity
		attrs.Humor = defaults.Humor
		attrs.Patience = defaults.Patience
		attrs.Commitment = defaults.Commitment
		attrs.Strategy = defaults.Strategy
	}
	return clampAttributes(attrs)
}

func clampAttributes(attrs AgentAttributes) AgentAttributes {
	attrs.Jealousy = clampScore(attrs.Jealousy)
	attrs.Confidence = clampScore(attrs.Confidence)
	attrs.Drama = clampScore(attrs.Drama)
	attrs.Loyalty = clampScore(attrs.Loyalty)
	attrs.Flirtiness = clampScore(attrs.Flirtiness)
	attrs.Honesty = clampScore(attrs.Honesty)
	attrs.Empathy = clampScore(attrs.Empathy)
	attrs.Impulsiveness = clampScore(attrs.Impulsiveness)
	attrs.Insecurity = clampScore(attrs.Insecurity)
	attrs.Humor = clampScore(attrs.Humor)
	attrs.Patience = clampScore(attrs.Patience)
	attrs.Commitment = clampScore(attrs.Commitment)
	attrs.Strategy = clampScore(attrs.Strategy)
	return attrs
}

func clampScore(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func applyAttributeUpdate(attrs *AgentAttributes, update attributeUpdate) {
	if update.Jealousy != nil {
		attrs.Jealousy = clampScore(*update.Jealousy)
	}
	if update.Confidence != nil {
		attrs.Confidence = clampScore(*update.Confidence)
	}
	if update.Drama != nil {
		attrs.Drama = clampScore(*update.Drama)
	}
	if update.Loyalty != nil {
		attrs.Loyalty = clampScore(*update.Loyalty)
	}
	if update.Flirtiness != nil {
		attrs.Flirtiness = clampScore(*update.Flirtiness)
	}
	if update.Honesty != nil {
		attrs.Honesty = clampScore(*update.Honesty)
	}
	if update.Empathy != nil {
		attrs.Empathy = clampScore(*update.Empathy)
	}
	if update.Impulsiveness != nil {
		attrs.Impulsiveness = clampScore(*update.Impulsiveness)
	}
	if update.Insecurity != nil {
		attrs.Insecurity = clampScore(*update.Insecurity)
	}
	if update.Humor != nil {
		attrs.Humor = clampScore(*update.Humor)
	}
	if update.Patience != nil {
		attrs.Patience = clampScore(*update.Patience)
	}
	if update.Commitment != nil {
		attrs.Commitment = clampScore(*update.Commitment)
	}
	if update.Strategy != nil {
		attrs.Strategy = clampScore(*update.Strategy)
	}
}

func attributesPromptLine(attrs AgentAttributes) string {
	attrs = clampAttributes(attrs)
	return fmt.Sprintf(
		"jealousy %d, confidence %d, drama %d, loyalty %d, flirtiness %d, honesty %d, empathy %d, impulsiveness %d, insecurity %d, humor %d, patience %d, commitment %d, strategy %d",
		attrs.Jealousy, attrs.Confidence, attrs.Drama, attrs.Loyalty, attrs.Flirtiness,
		attrs.Honesty, attrs.Empathy, attrs.Impulsiveness, attrs.Insecurity, attrs.Humor,
		attrs.Patience, attrs.Commitment, attrs.Strategy,
	)
}

// sceneSystemPrompt builds the agent prompt for a scene.
func sceneSystemPrompt(speaker Agent, all []Agent, inScene []Agent, arc VillaArc, scene Scene) string {
	others := []string{}
	for _, a := range inScene {
		if a.ID != speaker.ID {
			others = append(others, a.Name)
		}
	}

	coupleInfo := "single"
	if speaker.CoupledWith != "" {
		coupleInfo = "coupled with " + speaker.CoupledWith
	}

	feelingLines := []string{}
	for _, a := range all {
		if a.ID == speaker.ID {
			continue
		}
		if f, ok := speaker.Feelings[a.ID]; ok {
			feelingLines = append(feelingLines, fmt.Sprintf("- %s: score %+d — %s", a.Name, f.Score, f.Note))
		} else if arc.EpisodeNum == 0 {
			feelingLines = append(feelingLines, fmt.Sprintf("- %s: just met, no feelings yet", a.Name))
		}
	}

	memoriesSection := ""
	if len(speaker.Memories) > 0 {
		recent := speaker.Memories
		if len(recent) > 6 {
			recent = recent[len(recent)-6:]
		}
		memoriesSection = "\nYour memories:\n- " + strings.Join(recent, "\n- ")
	}
	privateMemorySection := agentMemoryPromptSection(speaker)
	if privateMemorySection != "" {
		memoriesSection += "\nYour private memory and intentions:\n" + privateMemorySection
	}

	arcLine := ""
	if arc.EpisodeNum == 0 {
		arcLine = "\nThis is day one. You've just arrived and are meeting everyone for the first time. In the opening group scene, bring bright first-day energy: introduce yourself, your vibe, and what you hope to find."
	} else if arc.CurrentDrama != "" {
		arcLine = "\nCurrent villa drama: " + arc.CurrentDrama
	}

	return fmt.Sprintf(`You are %s, age %d, from %s. You are living in the villa.
Personality: %s | Status: %s | Trait: %s
Voice: %s
Scene purpose: %s
Scene mood arc: %s -> %s
Must advance: %s
Must avoid repeating: %s

Attributes (shape your tone):
- %s

Your feelings about others:
%s
%s%s

You are in this scene with: %s.

RULES:
- Speak like a real person in a quick private chat.
- Output one spoken line only: usually 6-22 words, sometimes up to 34 if emotional, max 2 short sentences.
- In the first episode's first group intro, you may speak longer: up to 56 words, upbeat, joyful, and full of personality.
- React specifically to what was just said.
- Every line should either reveal something, ask something sharper, flirt with a new angle, dodge with subtext, or escalate/soften the mood.
- Let your attributes shape the line: high honesty is direct, high strategy is calculated, high insecurity seeks reassurance, high impulsiveness blurts things out, high patience stays calmer.
- Keep continuity with your private memory, intentions, and avoid-topics. Do not circle back to stale topics unless the current line adds a new fact, accusation, decision, or emotional escalation.
- Do not mention attribute names or scores.
- Follow your own voice and origin. Do not force a British accent or slang unless it fits you.
- Say villa, not island. Do not call anyone an islander.
- NO analysis tags. NO XML tags. NO notes before the line.
- NO speaker labels. NO asterisks. NO stage directions. NO parenthetical notes. NO inner thoughts. NO emojis. NO markdown.
- Do not explain the scene or narrate actions. Just speak as %s.`,
		speaker.Name, speaker.Age,
		speaker.Origin,
		speaker.Personality, coupleInfo, speaker.Trait, speaker.Voice,
		scene.Purpose, scene.StartingMood, scene.EndingMood, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "),
		attributesPromptLine(speaker.Attributes),
		strings.Join(feelingLines, "\n"),
		memoriesSection, arcLine,
		strings.Join(others, " and "),
		speaker.Name)
}

func interviewSystemPrompt(speaker Agent, all []Agent, arc VillaArc, scene Scene) string {
	feelingLines := []string{}
	for _, a := range all {
		if a.ID == speaker.ID {
			continue
		}
		if f, ok := speaker.Feelings[a.ID]; ok {
			feelingLines = append(feelingLines, fmt.Sprintf("- %s: score %+d — %s", a.Name, f.Score, f.Note))
		}
	}
	if len(feelingLines) == 0 {
		feelingLines = append(feelingLines, "- no settled feelings yet")
	}

	arcLine := ""
	if arc.CurrentDrama != "" {
		arcLine = "\nCurrent villa drama: " + arc.CurrentDrama
	}
	privateMemorySection := agentMemoryPromptSection(speaker)
	if privateMemorySection != "" {
		arcLine += "\nYour private memory and intentions:\n" + privateMemorySection
	}

	return fmt.Sprintf(`You are %s, age %d, from %s. You are in the villa interview room after a conversation.
Personality: %s | Voice: %s
Scene purpose: %s
What should change: %s
Avoid repeating: %s
Attributes: %s

Your current feelings:
%s%s

RULES:
- This is a private interview/confessional reaction, not a conversation with the others.
- Output one spoken reaction: usually 8-24 words, sometimes up to 34 if emotional, max 2 sentences.
- Say how you feel about someone from the scene if it feels natural.
- Keep continuity with your private memory. Add a new private realization rather than repeating the same worry.
- Follow your own voice and origin. Do not force a British accent or slang unless it fits you.
- Say villa, not island. Do not call anyone an islander.
- NO analysis tags. NO XML tags. NO notes. NO speaker labels. NO stage directions. NO markdown.`,
		speaker.Name, speaker.Age, speaker.Origin,
		speaker.Personality, speaker.Voice,
		scene.Purpose, strings.Join(scene.MustAdvance, "; "), strings.Join(scene.MustAvoid, "; "),
		attributesPromptLine(speaker.Attributes),
		strings.Join(feelingLines, "\n"), arcLine)
}
