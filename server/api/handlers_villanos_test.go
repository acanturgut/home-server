package api

import (
	"testing"

	"github.com/acanturgut/home-server/villanos"
)

func TestApplyElevenLabsEmotionTag(t *testing.T) {
	got := applyElevenLabsEmotionTag("I actually fancy him.", "happily", "eleven_v3")
	want := "[happily] I actually fancy him."
	if got != want {
		t.Fatalf("applyElevenLabsEmotionTag() = %q, want %q", got, want)
	}
}

func TestApplyElevenLabsEmotionTagCanAddMidSentenceReaction(t *testing.T) {
	got := applyElevenLabsEmotionTag("I do like him, but I don't know if I trust it yet.", "nervous", "eleven_v3")
	want := "[nervously] I do like him, [hesitates] but I don't know if I trust it yet."
	if got != want {
		t.Fatalf("applyElevenLabsEmotionTag() = %q, want %q", got, want)
	}
}

func TestApplyElevenLabsEmotionTagSkipsCalmAndExistingTags(t *testing.T) {
	if got := applyElevenLabsEmotionTag("[sighs] Fine.", "angry", "eleven_v3"); got != "[sighs] Fine." {
		t.Fatalf("existing tag should be preserved: %q", got)
	}
	if got := applyElevenLabsEmotionTag("Fine. [sighs]", "angry", "eleven_v3"); got != "Fine. [sighs]" {
		t.Fatalf("existing trailing tag should be preserved: %q", got)
	}
}

func TestApplyElevenLabsEmotionTagOnlyForV3(t *testing.T) {
	if got := applyElevenLabsEmotionTag("I'm listening.", "calm", "eleven_multilingual_v2"); got != "I'm listening." {
		t.Fatalf("non-v3 model should not receive tag: %q", got)
	}
	if got := applyElevenLabsEmotionTag("I'm listening.", "calm", "eleven_v3"); got != "[calm] I'm listening." {
		t.Fatalf("v3 model should receive calm tag: %q", got)
	}
}

func TestElevenLabsAudioTagSupportsV3Reactions(t *testing.T) {
	cases := map[string]string{
		"sigh":        "[sighs]",
		"exhales":     "[exhales]",
		"hesitant":    "[hesitates]",
		"nervous":     "[nervously]",
		"curious":     "[curious]",
		"mischievous": "[mischievously]",
	}
	for emotion, want := range cases {
		if got := elevenLabsAudioTag(emotion); got != want {
			t.Fatalf("elevenLabsAudioTag(%q) = %q, want %q", emotion, got, want)
		}
	}
}

func TestAgentSettingsByIDPreservesVoiceIDs(t *testing.T) {
	agents := []villanos.AgentConfigUpdate{
		{ID: "tyler", Origin: "US", Voice: "warm", VoiceID: " voice-tyler "},
	}
	got := agentSettingsByID(agents)
	if got["tyler"].VoiceID != "voice-tyler" {
		t.Fatalf("voice id was not preserved and trimmed: %#v", got["tyler"])
	}
}
