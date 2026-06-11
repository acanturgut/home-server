package villanos

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Store struct {
	path string
}

func NewStore(dataDir string) *Store {
	return &Store{path: filepath.Join(dataDir, "villanos.json")}
}

func (s *Store) Load() (*State, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return defaultState(), nil
	}
	if err != nil {
		return nil, err
	}
	var st State
	if err := json.Unmarshal(data, &st); err != nil {
		return defaultState(), nil
	}
	return &st, nil
}

func (s *Store) Save(st *State) error {
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func defaultState() *State {
	return &State{
		Agents:   defaultAgents(),
		Episodes: []Episode{},
		Arc: VillaArc{
			EpisodeNum:      0,
			CurrentDrama:    "",
			ActiveDramas:    []string{},
			OngoingTensions: []string{},
			RecentEvents:    []string{},
		},
	}
}

func defaultAgents() []Agent {
	agents := []Agent{
		{
			ID: "zara", Name: "Zara", Age: 22,
			Origin:      "London, UK",
			Voice:       "London confidence, quick teasing, says what she wants without overdoing slang.",
			Personality: "Confident, flirtatious, loves being the centre of attention. Drama queen but fiercely loyal to her girls.",
			Trait:       "drama_queen", Status: "single", AvatarColor: "#e879f9",
			Attributes: AgentAttributes{
				Jealousy: 80, Confidence: 85, Drama: 90, Loyalty: 60, Flirtiness: 85,
				Honesty: 58, Empathy: 62, Impulsiveness: 78, Insecurity: 45, Humor: 70, Patience: 35, Commitment: 48, Strategy: 62,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
		{
			ID: "jake", Name: "Jake", Age: 24,
			Origin:      "Los Angeles, USA",
			Voice:       "American gym-bro charm, casual and smooth, avoids British slang unless repeating someone.",
			Personality: "Charming gym lad with a wandering eye. Says all the right things but sometimes means none of them.",
			Trait:       "player", Status: "single", AvatarColor: "#38bdf8",
			Attributes: AgentAttributes{
				Jealousy: 30, Confidence: 90, Drama: 40, Loyalty: 35, Flirtiness: 95,
				Honesty: 34, Empathy: 42, Impulsiveness: 68, Insecurity: 28, Humor: 82, Patience: 46, Commitment: 22, Strategy: 57,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
		{
			ID: "ella", Name: "Ella", Age: 21,
			Origin:      "Manchester, UK",
			Voice:       "Northern warmth, emotional and direct, natural but not exaggerated.",
			Personality: "Sweet, emotional, overthinks everything. Very genuine but easily manipulated.",
			Trait:       "emotional", Status: "single", AvatarColor: "#fb923c",
			Attributes: AgentAttributes{
				Jealousy: 70, Confidence: 35, Drama: 55, Loyalty: 85, Flirtiness: 45,
				Honesty: 82, Empathy: 90, Impulsiveness: 52, Insecurity: 78, Humor: 50, Patience: 62, Commitment: 86, Strategy: 25,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
		{
			ID: "tyler", Name: "Tyler", Age: 25,
			Origin:      "Toronto, Canada",
			Voice:       "Calm Canadian bluntness, dry humor, steady when others get heated.",
			Personality: "Cool, laid-back, says it how it is. Not here to play games but somehow always ends up in drama.",
			Trait:       "straight_talker", Status: "single", AvatarColor: "#4ade80",
			Attributes: AgentAttributes{
				Jealousy: 40, Confidence: 75, Drama: 50, Loyalty: 70, Flirtiness: 60,
				Honesty: 88, Empathy: 68, Impulsiveness: 42, Insecurity: 32, Humor: 64, Patience: 78, Commitment: 72, Strategy: 45,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
		{
			ID: "mia", Name: "Mia", Age: 23,
			Origin:      "Berlin, Germany",
			Voice:       "German precision, sharp and composed, direct when she spots nonsense.",
			Personality: "Sharp-tongued, strategic, always watching. Knows how to flip a situation to her advantage.",
			Trait:       "strategic", Status: "single", AvatarColor: "#f43f5e",
			Attributes: AgentAttributes{
				Jealousy: 55, Confidence: 88, Drama: 75, Loyalty: 25, Flirtiness: 70,
				Honesty: 46, Empathy: 38, Impulsiveness: 50, Insecurity: 36, Humor: 78, Patience: 58, Commitment: 30, Strategy: 94,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
		{
			ID: "luca", Name: "Luca", Age: 26,
			Origin:      "Milan, Italy",
			Voice:       "Italian romantic, expressive and sincere, a little dramatic when insecure.",
			Personality: "Hopeless romantic who genuinely wants to find love. Gets jealous but never in a scary way.",
			Trait:       "romantic", Status: "single", AvatarColor: "#a78bfa",
			Attributes: AgentAttributes{
				Jealousy: 65, Confidence: 45, Drama: 45, Loyalty: 80, Flirtiness: 55,
				Honesty: 76, Empathy: 82, Impulsiveness: 48, Insecurity: 70, Humor: 56, Patience: 66, Commitment: 92, Strategy: 34,
			},
			Feelings: map[string]Feeling{}, Memories: []string{},
		},
	}
	for i := range agents {
		agents[i].Memory = normalizeAgentMemory(agents[i])
	}
	return agents
}
