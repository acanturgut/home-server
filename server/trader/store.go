package trader

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Store persists the trader State to <data>/trader.json. Reads/writes are
// fully serialised by a single mutex; the JSON is rewritten atomically by
// tmpfile + rename.
type Store struct {
	mu   sync.Mutex
	path string
}

func NewStore(dataDir string) *Store {
	return &Store{path: filepath.Join(dataDir, "trader.json")}
}

// Load returns the persisted state, or a sensibly-defaulted blank state
// the very first time the server boots.
func (s *Store) Load() (*State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultState(), nil
		}
		return nil, err
	}
	var st State
	if err := json.Unmarshal(b, &st); err != nil {
		return nil, err
	}
	// Restored portfolios always start paused — the operator must press
	// Start again so we never accidentally spin the trade loop after a
	// crash.
	st.Running = false
	st.NextTick = time.Time{}
	if st.IntervalMin <= 0 {
		st.IntervalMin = 1
	}
	if len(st.Watchlist) == 0 {
		st.Watchlist = defaultWatchlist()
	}
	if st.CreatedAt.IsZero() {
		st.CreatedAt = time.Now()
	}
	return &st, nil
}

// Save writes the state to disk. The caller is expected to mutate the
// passed value before invoking (Manager handles this internally).
func (s *Store) Save(st *State) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	st.UpdatedAt = time.Now()
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("rename trader state: %w", err)
	}
	return nil
}

func defaultState() *State {
	now := time.Now()
	return &State{
		Running:     false,
		Cash:        0,
		Watchlist:   defaultWatchlist(),
		IntervalMin: 1,
		Positions:   []Position{},
		Trades:      []Trade{},
		Logs:        []AgentLog{},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

func defaultWatchlist() []string {
	// Alpaca paper supports US equities + a small set of crypto pairs;
	// foreign-suffix tickers (.L, .DE, .HK …) are not tradable through
	// Alpaca, so we keep this list US-only plus a few liquid crypto names.
	return []string{
		// US mega-caps & momentum
		"AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "NFLX", "AVGO",
		// US broad-market ETFs (regime / hedge)
		"SPY", "QQQ", "IWM", "DIA", "VTI",
		// Sector / thematic ETFs
		"XLE", "XLF", "XLK", "SOXX", "ARKK",
		// US-listed ADRs (foreign exposure without foreign exchanges)
		"BABA", "TSM", "VALE", "PBR", "BIDU", "NIO",
		// Commodities / hedges (US ETFs)
		"GLD", "SLV", "USO", "TLT", "UUP",
		// Crypto (Alpaca symbols rendered in our internal -USD form)
		"BTC-USD", "ETH-USD", "SOL-USD",
	}
}
