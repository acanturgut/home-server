package villanos

import "strings"

type agentMemoryUpdate struct {
	AgentID         string                    `json:"agent_id"`
	SelfStory       string                    `json:"self_story,omitempty"`
	PrivateMemory   string                    `json:"private_memory,omitempty"`
	PrivateFeelings map[string]PrivateFeeling `json:"private_feelings,omitempty"`
	Secrets         []string                  `json:"secrets,omitempty"`
	Intentions      []string                  `json:"intentions,omitempty"`
	AvoidTopics     []string                  `json:"avoid_topics,omitempty"`
	RecentSceneRefs []string                  `json:"recent_scene_refs,omitempty"`
}

func normalizeAgentMemory(agent Agent) AgentMemory {
	memory := agent.Memory
	if memory.PrivateFeelings == nil {
		memory.PrivateFeelings = map[string]PrivateFeeling{}
	}
	if memory.Secrets == nil {
		memory.Secrets = []string{}
	}
	if memory.Intentions == nil {
		memory.Intentions = []string{}
	}
	if memory.AvoidTopics == nil {
		memory.AvoidTopics = []string{}
	}
	if memory.RecentSceneRefs == nil {
		memory.RecentSceneRefs = []string{}
	}
	if strings.TrimSpace(memory.SelfStory) == "" {
		memory.SelfStory = strings.TrimSpace(agent.Personality)
	}
	return memory
}

func applyAgentMemoryUpdate(agent *Agent, update agentMemoryUpdate) {
	agent.Memory = normalizeAgentMemory(*agent)
	if strings.TrimSpace(update.SelfStory) != "" {
		agent.Memory.SelfStory = strings.TrimSpace(update.SelfStory)
	}
	if strings.TrimSpace(update.PrivateMemory) != "" {
		agent.Memories = append(agent.Memories, strings.TrimSpace(update.PrivateMemory))
	}
	for id, feeling := range update.PrivateFeelings {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		feeling.Attraction = clampScore(feeling.Attraction)
		feeling.Trust = clampScore(feeling.Trust)
		feeling.Jealousy = clampScore(feeling.Jealousy)
		feeling.Resentment = clampScore(feeling.Resentment)
		feeling.Curiosity = clampScore(feeling.Curiosity)
		feeling.Note = strings.TrimSpace(feeling.Note)
		agent.Memory.PrivateFeelings[id] = feeling
	}
	agent.Memory.Secrets = trimMemoryList(append(agent.Memory.Secrets, update.Secrets...))
	agent.Memory.Intentions = trimMemoryList(append(agent.Memory.Intentions, update.Intentions...))
	agent.Memory.AvoidTopics = trimMemoryList(append(agent.Memory.AvoidTopics, update.AvoidTopics...))
	agent.Memory.RecentSceneRefs = trimMemoryList(append(agent.Memory.RecentSceneRefs, update.RecentSceneRefs...))
	if len(agent.Memories) > maxMemories {
		agent.Memories = agent.Memories[len(agent.Memories)-maxMemories:]
	}
}

func trimMemoryList(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.Join(strings.Fields(value), " ")
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	if len(out) > maxPrivateMemoryItems {
		out = out[len(out)-maxPrivateMemoryItems:]
	}
	return out
}

func agentMemoryPromptSection(agent Agent) string {
	memory := normalizeAgentMemory(agent)
	parts := []string{}
	if strings.TrimSpace(memory.SelfStory) != "" {
		parts = append(parts, "Self-story: "+memory.SelfStory)
	}
	if len(memory.Intentions) > 0 {
		parts = append(parts, "Private intentions: "+strings.Join(memory.Intentions, "; "))
	}
	if len(memory.AvoidTopics) > 0 {
		parts = append(parts, "Avoid repeating unless it escalates: "+strings.Join(memory.AvoidTopics, "; "))
	}
	if len(memory.Secrets) > 0 {
		parts = append(parts, "Secrets/private reservations: "+strings.Join(memory.Secrets, "; "))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n")
}
