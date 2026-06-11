package villanos

import (
	"fmt"
	"strings"
)

const (
	introMusicMs        = 18000
	sceneAmbienceMs     = 180000
	dramaStingMs        = 1400
	shortPauseMs        = 350
	narratorPauseMs     = 850
	confessionalPauseMs = 1000
)

func hydrateEpisodeTimeline(ep Episode) Episode {
	if ep.Timeline == nil {
		timeline := BuildEpisodeTimeline(ep)
		ep.Timeline = &timeline
	}
	return ep
}

func BuildEpisodeTimeline(ep Episode) EpisodeTimeline {
	items := make([]TimelineItem, 0, 8+len(ep.Scenes)*8)
	scenes := make([]TimelineScene, 0, len(ep.Scenes))
	cursor := 0

	items = append(items, TimelineItem{
		ID:         timelineID("episode", ep.ID, "intro_music"),
		Type:       "music",
		StartMs:    cursor,
		DurationMs: introMusicMs,
		Volume:     0.16,
		FadeInMs:   1200,
		FadeOutMs:  900,
		Cue: &AudioCue{
			Prompt:    "bright reality TV opening music bed, upbeat warm pop underscore, no vocals",
			Volume:    0.16,
			FadeInMs:  1200,
			FadeOutMs: 900,
		},
	})

	if text := strings.TrimSpace(ep.Opening); text != "" {
		duration := estimateSpeechDurationMs(text)
		items = append(items, TimelineItem{
			ID:         timelineID("episode", ep.ID, "opening"),
			Type:       "narrator",
			Text:       text,
			Emotion:    "mischievous",
			StartMs:    cursor + 900,
			DurationMs: duration,
			Volume:     1,
		})
		cursor += duration + narratorPauseMs + 900
	}

	for i := range ep.Scenes {
		scene := ep.Scenes[i]
		sceneStart := cursor
		sceneItems := buildSceneTimelineItems(scene, cursor, i)
		if len(sceneItems) > 0 {
			items = append(items, sceneItems...)
			last := sceneItems[len(sceneItems)-1]
			cursor = maxInt(cursor, last.StartMs+last.DurationMs)
		}
		sceneDuration := maxInt(cursor-sceneStart, estimateSceneDurationMs(scene))
		sceneType := timelineSceneType(scene)
		scenes = append(scenes, TimelineScene{
			ID:                  scene.ID,
			Location:            scene.Location,
			Type:                sceneType,
			Participants:        append([]string{}, scene.Participants...),
			TargetDurationMs:    targetSceneDurationMs(scene, sceneType),
			EstimatedDurationMs: sceneDuration,
			Items:               sceneItems,
		})
		cursor += shortPauseMs
	}

	if text := strings.TrimSpace(ep.Closing); text != "" {
		duration := estimateSpeechDurationMs(text)
		items = append(items, TimelineItem{
			ID:         timelineID("episode", ep.ID, "closing"),
			Type:       "narrator",
			Text:       text,
			Emotion:    "excited",
			StartMs:    cursor + narratorPauseMs,
			DurationMs: duration,
			Volume:     1,
		})
		cursor += duration + narratorPauseMs
	}

	items = append(items, TimelineItem{
		ID:         timelineID("episode", ep.ID, "cliffhanger_sting"),
		Type:       "sting",
		StartMs:    cursor,
		DurationMs: dramaStingMs,
		Volume:     0.35,
		FadeOutMs:  800,
		Cue: &AudioCue{
			Prompt:    "short reality TV cliffhanger sting, dramatic but glossy, no vocals",
			Volume:    0.35,
			FadeOutMs: 800,
		},
	})
	cursor += dramaStingMs

	return EpisodeTimeline{
		TargetDurationMs:    defaultEpisodeTarget,
		EstimatedDurationMs: cursor,
		Scenes:              scenes,
		Items:               items,
	}
}

func BuildLiveEpisodeTimeline(live LiveEpisode) EpisodeTimeline {
	ep := Episode{
		ID:      fmt.Sprintf("live_ep%d", live.EpisodeNum),
		Number:  live.EpisodeNum,
		Title:   live.Title,
		Opening: live.Opening,
		Scenes:  live.Scenes,
	}
	return BuildEpisodeTimeline(ep)
}

func buildSceneTimelineItems(scene Scene, startMs, sceneIdx int) []TimelineItem {
	items := []TimelineItem{}
	cursor := startMs
	sceneType := timelineSceneType(scene)

	ambienceDuration := maxInt(sceneAmbienceMs, estimateSceneDurationMs(scene)+5000)
	items = append(items, TimelineItem{
		ID:         timelineID(scene.ID, "ambience"),
		Type:       "ambience",
		SceneID:    scene.ID,
		StartMs:    cursor,
		DurationMs: ambienceDuration,
		Volume:     0.14,
		FadeInMs:   900,
		FadeOutMs:  1200,
		Cue: &AudioCue{
			Prompt:    sceneAmbiencePrompt(scene, sceneType),
			Volume:    0.14,
			FadeInMs:  900,
			FadeOutMs: 1200,
			Loop:      true,
		},
	})

	if text := strings.TrimSpace(scene.Narration); text != "" {
		duration := estimateSpeechDurationMs(text)
		items = append(items, TimelineItem{
			ID:         timelineID(scene.ID, "narrator"),
			Type:       "narrator",
			SceneID:    scene.ID,
			Text:       text,
			Emotion:    "curious",
			StartMs:    cursor,
			DurationMs: duration,
			Volume:     1,
		})
		cursor += duration + narratorPauseMs
	}

	for i, turn := range scene.Turns {
		text := strings.TrimSpace(turn.Content)
		if text == "" {
			continue
		}
		duration := estimateSpeechDurationMs(text)
		pause := dialoguePauseMs(sceneType, i, turn.Emotion)
		items = append(items, TimelineItem{
			ID:          timelineID(scene.ID, turn.AgentID, fmt.Sprintf("%d", i)),
			Type:        sceneTypeItemType(sceneType),
			SceneID:     scene.ID,
			SpeakerID:   turn.AgentID,
			SpeakerName: turn.AgentName,
			Text:        text,
			Emotion:     turn.Emotion,
			StartMs:     cursor,
			DurationMs:  duration,
			Volume:      1,
			OverlapMs:   overlapMs(sceneType, turn.Emotion),
		})
		cursor += duration + pause
	}

	if sceneIdx > 0 && sceneType != "confessional" {
		items = append(items, TimelineItem{
			ID:         timelineID(scene.ID, "transition_sting"),
			Type:       "sting",
			SceneID:    scene.ID,
			StartMs:    cursor,
			DurationMs: 900,
			Volume:     0.22,
			FadeOutMs:  500,
			Cue: &AudioCue{
				Prompt:    "quick polished reality TV transition sting, no vocals",
				Volume:    0.22,
				FadeOutMs: 500,
			},
		})
	}
	return items
}

func estimateSceneDurationMs(scene Scene) int {
	total := 0
	if scene.Narration != "" {
		total += estimateSpeechDurationMs(scene.Narration) + narratorPauseMs
	}
	for i, turn := range scene.Turns {
		total += estimateSpeechDurationMs(turn.Content)
		total += dialoguePauseMs("", i, turn.Emotion)
	}
	if total == 0 {
		return targetSceneDurationMs(scene, "conversation")
	}
	return total
}

func estimateSpeechDurationMs(text string) int {
	words := len(strings.Fields(text))
	if words == 0 {
		return 0
	}
	// Conversational TTS averages around 145 words/min; add a small performance buffer.
	ms := int(float64(words)/2.4*1000) + 450
	if ms < 900 {
		return 900
	}
	return ms
}

func targetSceneDurationMs(scene Scene, sceneType string) int {
	if scene.TargetDurationMs > 0 {
		return scene.TargetDurationMs
	}
	if sceneType == "confessional" {
		return 75 * 1000
	}
	if len(scene.Participants) > 3 {
		return 3 * 60 * 1000
	}
	return 2 * 60 * 1000
}

func sceneTypeItemType(sceneType string) string {
	if sceneType == "confessional" {
		return "confessional"
	}
	return "dialogue"
}

func dialoguePauseMs(sceneType string, index int, emotion string) int {
	if sceneType == "confessional" {
		return confessionalPauseMs
	}
	if index == 0 {
		return 450
	}
	if isEmotionalTimelineEmotion(emotion) {
		return 750
	}
	return 320
}

func overlapMs(sceneType, emotion string) int {
	if sceneType == "confessional" || isEmotionalTimelineEmotion(emotion) {
		return 0
	}
	return 260
}

func isEmotionalTimelineEmotion(emotion string) bool {
	switch strings.ToLower(strings.TrimSpace(emotion)) {
	case "sad", "sighs", "exhales", "nervous", "hesitates", "angry", "frustrated":
		return true
	default:
		return false
	}
}

func sceneAmbiencePrompt(scene Scene, sceneType string) string {
	location := strings.TrimSpace(scene.Location)
	if location == "" {
		location = "the villa"
	}
	if sceneType == "confessional" {
		return "quiet villa interview room tone, intimate reality show confessional ambience, no speech, no lyrics"
	}
	if strings.TrimSpace(scene.AudioPrompt) != "" {
		return strings.TrimSpace(scene.AudioPrompt)
	}
	return fmt.Sprintf("seamless looping reality TV villa ambience at %s, subtle room tone, distant poolside movement, warm background texture, no speech, no lyrics", location)
}

func timelineSceneType(scene Scene) string {
	sceneType := strings.TrimSpace(scene.Type)
	if sceneType == "" {
		sceneType = "conversation"
	}
	if sceneType == "confessional" || strings.Contains(strings.ToLower(scene.ID+" "+scene.Location), "interview") {
		return "confessional"
	}
	return sceneType
}

func timelineID(parts ...string) string {
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			clean = append(clean, strings.NewReplacer(" ", "_", "/", "_").Replace(part))
		}
	}
	return strings.Join(clean, "_")
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
