package villanos

import (
	"strings"
	"testing"
)

func intPtr(v int) *int {
	return &v
}

func TestCleanDialogueLineRemovesAnnotationsAndLabels(t *testing.T) {
	got := cleanDialogueLine(`Zara: *leans closer* "I fancy you, but don't mug me off."`, "Zara")
	want := "I fancy you, but don't mug me off."
	if got != want {
		t.Fatalf("cleanDialogueLine() = %q, want %q", got, want)
	}
}

func TestCleanDialogueLineKeepsConversationShort(t *testing.T) {
	raw := `Line: I get what you're saying. But you keep flirting with everyone here. It makes me look silly. And I am not having that tonight.`
	got := cleanDialogueLine(raw, "Ella")
	if strings.Count(got, ".")+strings.Count(got, "!")+strings.Count(got, "?") > 2 {
		t.Fatalf("cleanDialogueLine() kept too many sentences: %q", got)
	}
	if len(strings.Fields(got)) > 34 {
		t.Fatalf("cleanDialogueLine() kept too many words: %q", got)
	}
}

func TestCleanDialogueLineAllowsLongerOpeningIntroductions(t *testing.T) {
	raw := `Line: I'm Zara, I'm walking in with big energy, big standards, and no interest in boring chat. I want someone funny, confident, and honest enough to keep up with me, but I am also here to laugh and actually enjoy this gorgeous villa.`
	got := cleanDialogueLineWithLimit(raw, "Zara", 56)
	if len(strings.Fields(got)) <= 34 {
		t.Fatalf("cleanDialogueLineWithLimit() cut opening intro too short: %q", got)
	}
	if len(strings.Fields(got)) > 56 {
		t.Fatalf("cleanDialogueLineWithLimit() kept too many words: %q", got)
	}
}

func TestCleanDialogueLineRemovesThinkingAndMarkdown(t *testing.T) {
	got := cleanDialogueLine("<think>plan a reply</think>\n**Jake says:** `You're fit, but I'm not promising anything yet.`", "Jake")
	want := "You're fit, but I'm not promising anything yet."
	if got != want {
		t.Fatalf("cleanDialogueLine() = %q, want %q", got, want)
	}
}

func TestCleanDialogueLineRemovesCharacterAnalysisPreamble(t *testing.T) {
	got := cleanDialogueLine(`Tyler's Character Analysis & Interview Reaction --- Character Profile Assessment: Tyler is calm and direct. Final line: "Ella surprised me, honestly."`, "Tyler")
	want := "Ella surprised me, honestly."
	if got != want {
		t.Fatalf("cleanDialogueLine() = %q, want %q", got, want)
	}
}

func TestStripThinkingRemovesAnalysisBlocks(t *testing.T) {
	got := stripThinking(`<analysis>plan narrator beats</analysis> --- "Tonight, the villa gets messy."`)
	want := "Tonight, the villa gets messy."
	if got != want {
		t.Fatalf("stripThinking() = %q, want %q", got, want)
	}
}

func TestStripThinkingRemovesMisspelledAnalysisBlocks(t *testing.T) {
	got := stripThinking(`<analyis>plan a reply</analyis> "I'm not being mugged off."`)
	want := "I'm not being mugged off."
	if got != want {
		t.Fatalf("stripThinking() = %q, want %q", got, want)
	}
}

func TestStripThinkingRemovesOpenAnalysisBlock(t *testing.T) {
	got := stripThinking(`<analysis>plan narrator beats and never close the tag --- "The villa gets messy tonight."`)
	want := "The villa gets messy tonight."
	if got != want {
		t.Fatalf("stripThinking() = %q, want %q", got, want)
	}
}

func TestNormalizeAttributesBackfillsNewTraits(t *testing.T) {
	attrs := normalizeAttributes("zara", AgentAttributes{
		Jealousy: 80, Confidence: 85, Drama: 90, Loyalty: 60, Flirtiness: 85,
	})
	if attrs.Honesty == 0 || attrs.Empathy == 0 || attrs.Strategy == 0 {
		t.Fatalf("normalizeAttributes() did not backfill new traits: %+v", attrs)
	}
}

func TestApplyAttributeUpdateClampsScores(t *testing.T) {
	attrs := AgentAttributes{Drama: 50, Honesty: 50}
	applyAttributeUpdate(&attrs, attributeUpdate{
		AgentID: "zara",
		Drama:   intPtr(120),
		Honesty: intPtr(-5),
	})
	if attrs.Drama != 100 || attrs.Honesty != 0 {
		t.Fatalf("applyAttributeUpdate() did not clamp scores: %+v", attrs)
	}
}

func TestInferDialogueEmotionUsesLineAndAttributes(t *testing.T) {
	agent := Agent{ID: "zara", Name: "Zara", Attributes: AgentAttributes{Flirtiness: 90, Humor: 65}}
	if got := inferDialogueEmotion("I can't lie, he is proper fit.", agent, false); got != "excited" {
		t.Fatalf("inferDialogueEmotion() = %q, want excited", got)
	}
	if got := inferDialogueEmotion("Haha, you're cheeky.", agent, false); got != "laughs" {
		t.Fatalf("inferDialogueEmotion() = %q, want laughs", got)
	}
}

func TestInferDialogueEmotionAddsV3ReactionRange(t *testing.T) {
	agent := Agent{ID: "ella", Name: "Ella", Attributes: AgentAttributes{Insecurity: 75, Humor: 75}}
	if got := inferDialogueEmotion("I'm not sure what he means.", agent, true); got != "nervous" {
		t.Fatalf("inferDialogueEmotion() = %q, want nervous", got)
	}
	if got := inferDialogueEmotion("Why would he say that?", agent, false); got != "curious" {
		t.Fatalf("inferDialogueEmotion() = %q, want curious", got)
	}
}

func TestBuildEpisodeTimelineAddsProductionTracks(t *testing.T) {
	ep := Episode{
		ID:      "ep_test",
		Number:  1,
		Opening: "Tonight, the villa opens and everyone is trying to make a first impression.",
		Scenes: []Scene{{
			ID:           "s1",
			Location:     "pool terrace",
			Narration:    "At the pool terrace, Zara and Jake test the waters.",
			Participants: []string{"zara", "jake"},
			Turns: []DialogueTurn{
				{AgentID: "zara", AgentName: "Zara", Content: "You're very confident for someone I've just met.", Emotion: "playfully"},
				{AgentID: "jake", AgentName: "Jake", Content: "I mean, I'm trying to keep up with you.", Emotion: "laughs"},
			},
		}},
		Closing: "Tomorrow night, one chat might change everything.",
	}
	timeline := BuildEpisodeTimeline(ep)
	if timeline.TargetDurationMs != defaultEpisodeTarget {
		t.Fatalf("timeline target = %d, want %d", timeline.TargetDurationMs, defaultEpisodeTarget)
	}
	if timeline.EstimatedDurationMs <= 0 {
		t.Fatalf("timeline estimated duration was not set")
	}
	types := map[string]bool{}
	for _, item := range timeline.Items {
		types[item.Type] = true
	}
	for _, typ := range []string{"music", "ambience", "narrator", "dialogue", "sting"} {
		if !types[typ] {
			t.Fatalf("timeline missing %s item: %#v", typ, types)
		}
	}
}

func TestAgentMemoryUpdateTrimsAndDedupes(t *testing.T) {
	agent := Agent{ID: "mia", Personality: "Sharp and strategic."}
	applyAgentMemoryUpdate(&agent, agentMemoryUpdate{
		AgentID:       "mia",
		PrivateMemory: "I noticed Jake dodged the question.",
		Intentions:    []string{"Ask Jake directly.", "Ask Jake directly."},
		AvoidTopics:   []string{"Do not repeat the same trust chat."},
	})
	if agent.Memory.SelfStory == "" {
		t.Fatalf("memory self story was not initialized")
	}
	if len(agent.Memory.Intentions) != 1 {
		t.Fatalf("intentions were not deduped: %#v", agent.Memory.Intentions)
	}
	if len(agent.Memories) != 1 {
		t.Fatalf("private memory was not added to memories: %#v", agent.Memories)
	}
}

func TestValidateSceneFlagsAnalysisAndIslandWording(t *testing.T) {
	scene := Scene{
		ID:           "s1",
		Type:         "pair",
		Location:     "fire pit",
		Purpose:      "Move trust forward.",
		MustAdvance:  []string{"Zara asks Jake for honesty."},
		Participants: []string{"zara", "jake"},
		Turns: []DialogueTurn{
			{AgentID: "zara", AgentName: "Zara", Content: "<analysis>plan</analysis> Final line: I need to know if this island chat is real."},
			{AgentID: "jake", AgentName: "Jake", Content: "Where's your head at?"},
			{AgentID: "zara", AgentName: "Zara", Content: "Where's your head at?"},
		},
	}
	got := validateScene(scene)
	if !got.NeedsRepair {
		t.Fatalf("validateScene() should require repair: %#v", got)
	}
	joined := strings.Join(got.Issues, " ")
	if !strings.Contains(joined, "analysis") || !strings.Contains(joined, "island") {
		t.Fatalf("validateScene() missing expected issues: %#v", got.Issues)
	}
}

func TestDeterministicRepairSceneCleansVillaWording(t *testing.T) {
	scene := Scene{
		Narration: "Tonight on the island, the islanders talk.",
		Turns: []DialogueTurn{{
			AgentName: "Zara",
			Content:   `Zara: <analysis>ignore</analysis> "I like the island, but this islander thing is intense."`,
		}},
	}
	deterministicRepairScene(&scene)
	if strings.Contains(strings.ToLower(scene.Narration+" "+scene.Turns[0].Content), "island") {
		t.Fatalf("deterministicRepairScene() did not remove island wording: %#v", scene)
	}
	if strings.Contains(strings.ToLower(scene.Turns[0].Content), "analysis") {
		t.Fatalf("deterministicRepairScene() did not remove analysis leak: %#v", scene.Turns[0].Content)
	}
}
