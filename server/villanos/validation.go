package villanos

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var repeatedPhraseRe = regexp.MustCompile(`(?i)\b(where'?s your head at|where is your head at|my head is at|i'?m intrigued|i am intrigued|you'?re cheeky|you are cheeky)\b`)

func validateScene(scene Scene) SceneValidation {
	issues := []string{}
	score := 100

	if strings.TrimSpace(scene.Purpose) == "" {
		issues = append(issues, "missing scene purpose")
		score -= 8
	}
	if len(scene.MustAdvance) == 0 {
		issues = append(issues, "missing must-advance beat")
		score -= 10
	}
	if len(scene.Turns) < 6 && scene.Type != "confessional" {
		issues = append(issues, "scene has too few dialogue turns")
		score -= 12
	}

	seenLines := map[string]int{}
	repeatedPhrases := map[string]int{}
	for _, turn := range scene.Turns {
		line := strings.TrimSpace(turn.Content)
		clean := strings.ToLower(strings.Join(strings.Fields(line), " "))
		if clean == "" {
			issues = append(issues, "empty dialogue line")
			score -= 6
			continue
		}
		if hasAnalysisLeak(line) {
			issues = append(issues, "analysis/system text leaked into dialogue")
			score -= 25
		}
		if strings.Contains(strings.ToLower(line), "island") || strings.Contains(strings.ToLower(line), "islander") {
			issues = append(issues, "uses island/islander wording instead of villa/cast")
			score -= 15
		}
		if len(strings.Fields(line)) > 48 {
			issues = append(issues, "dialogue line is too long to feel natural")
			score -= 8
		}
		seenLines[clean]++
		if seenLines[clean] > 1 {
			issues = append(issues, "duplicate dialogue line")
			score -= 12
		}
		for _, match := range repeatedPhraseRe.FindAllString(strings.ToLower(line), -1) {
			repeatedPhrases[match]++
			if repeatedPhrases[match] > 1 {
				issues = append(issues, "repeated stock reality-show phrase: "+match)
				score -= 8
			}
		}
	}

	if !sceneAppearsToAdvance(scene) && scene.Type != "confessional" {
		issues = append(issues, "scene may not clearly advance its stated beat")
		score -= 14
	}

	if score < 0 {
		score = 0
	}
	return SceneValidation{
		Score:       score,
		NeedsRepair: score < 82 || len(issues) > 0 && hasHardValidationIssue(issues),
		Issues:      uniqueStrings(issues),
	}
}

func hasAnalysisLeak(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "<analysis") ||
		strings.Contains(lower, "<analyis") ||
		strings.Contains(lower, "character analysis") ||
		strings.Contains(lower, "profile assessment") ||
		strings.Contains(lower, "final line:") ||
		strings.Contains(lower, "system prompt")
}

func hasHardValidationIssue(issues []string) bool {
	for _, issue := range issues {
		if strings.Contains(issue, "analysis") || strings.Contains(issue, "island") || strings.Contains(issue, "duplicate") {
			return true
		}
	}
	return false
}

func sceneAppearsToAdvance(scene Scene) bool {
	text := strings.ToLower(scene.Purpose + " " + strings.Join(scene.MustAdvance, " ") + " ")
	for _, turn := range scene.Turns {
		text += " " + strings.ToLower(turn.Content)
	}
	for _, word := range []string{"because", "but", "however", "actually", "honestly", "trust", "jealous", "date", "choose", "picked", "secret", "feel", "felt", "want", "need", "confused", "hurt"} {
		if strings.Contains(text, word) {
			return true
		}
	}
	return false
}

func deterministicRepairScene(scene *Scene) {
	scene.Narration = repairVillaWording(stripThinking(scene.Narration))
	for i := range scene.Turns {
		scene.Turns[i].Content = repairVillaWording(cleanDialogueLineWithLimit(scene.Turns[i].Content, scene.Turns[i].AgentName, 42))
	}
}

func repairVillaWording(text string) string {
	replacer := strings.NewReplacer(
		"islanders", "contestants",
		"Islanders", "Contestants",
		"islander", "contestant",
		"Islander", "Contestant",
		"the island", "the villa",
		"The island", "The villa",
		"on the island", "in the villa",
		"On the island", "In the villa",
	)
	return strings.TrimSpace(replacer.Replace(text))
}

func repairScenePrompt(scene Scene, validation SceneValidation) string {
	lines := make([]string, 0, len(scene.Turns))
	for i, turn := range scene.Turns {
		lines = append(lines, fmt.Sprintf(`{"index":%d,"agent_id":%q,"agent_name":%q,"content":%q,"emotion":%q}`, i, turn.AgentID, turn.AgentName, turn.Content, turn.Emotion))
	}
	return fmt.Sprintf(`Repair this reality-show villa scene. Return JSON only.

Scene:
- type: %s
- location: %s
- purpose: %s
- mood arc: %s -> %s
- must advance: %s
- must avoid: %s
- validation issues: %s

Current turns:
[%s]

Return:
{
  "purpose": "<tighter purpose>",
  "narration": "<1-2 sentence narrator setup, no analysis>",
  "turns": [
    {"index": 0, "content": "<natural spoken line only>", "emotion": "<emotion>"}
  ]
}

Rules:
- Preserve the same turn count and index order.
- Keep the same speaker for each index.
- Dialogue must sound like humans in a villa, not system prompts.
- Remove analysis, labels, markdown, stage directions, and island/islander wording.
- Avoid repeating stale phrases unless there is new emotional escalation.
- Each line should move attraction, trust, jealousy, secrecy, or a decision forward.`,
		scene.Type,
		scene.Location,
		scene.Purpose,
		scene.StartingMood,
		scene.EndingMood,
		strings.Join(scene.MustAdvance, "; "),
		strings.Join(scene.MustAvoid, "; "),
		strings.Join(validation.Issues, "; "),
		strings.Join(lines, ",\n"),
	)
}

type sceneRepairJSON struct {
	Purpose   string `json:"purpose"`
	Narration string `json:"narration"`
	Turns     []struct {
		Index   int    `json:"index"`
		Content string `json:"content"`
		Emotion string `json:"emotion"`
	} `json:"turns"`
}

func applySceneRepair(scene *Scene, raw string) bool {
	jsonStr := jsonRe.FindString(raw)
	if jsonStr == "" {
		return false
	}
	var repair sceneRepairJSON
	if err := json.Unmarshal([]byte(jsonStr), &repair); err != nil {
		return false
	}
	if strings.TrimSpace(repair.Purpose) != "" {
		scene.Purpose = strings.TrimSpace(repair.Purpose)
	}
	if strings.TrimSpace(repair.Narration) != "" {
		scene.Narration = repairVillaWording(stripThinking(repair.Narration))
	}
	applied := false
	for _, turn := range repair.Turns {
		if turn.Index < 0 || turn.Index >= len(scene.Turns) {
			continue
		}
		content := repairVillaWording(cleanDialogueLineWithLimit(turn.Content, scene.Turns[turn.Index].AgentName, 42))
		if content == "" {
			continue
		}
		scene.Turns[turn.Index].Content = content
		if strings.TrimSpace(turn.Emotion) != "" {
			scene.Turns[turn.Index].Emotion = strings.TrimSpace(turn.Emotion)
		}
		applied = true
	}
	return applied
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
