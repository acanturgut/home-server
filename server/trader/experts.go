package trader

import (
	"sort"
	"strings"
)

// expert is a domain specialist who joins the meeting only when the
// briefing's symbols / news touch their sector. Each expert speaks once,
// after Raj's tape read and before Kenji's initial proposal — that's
// the right slot for a "here's what I know about this sector" injection.
type expert struct {
	Name        string   // canonical key (must match a panelRole.Name)
	DisplayName string   // shown in transcript
	Sector      string   // human label — "Tech", "Energy", etc.
	Temperature float64
	System      string
	// Tickers / tokens that, if present in the watchlist or news symbols,
	// trigger this expert. Matched case-insensitively.
	Triggers []string
}

// experts is the roster. Add more here as needed — the dispatcher will
// auto-include them when the briefing matches.
var experts = []expert{
	{
		Name:        "tech_expert",
		DisplayName: "Diane · Tech Sector Expert",
		Sector:      "Tech / Semis",
		Temperature: 0.45,
		Triggers: []string{
			"AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NVDA",
			"AMD", "INTC", "TSM", "AVGO", "QCOM", "MU", "ORCL", "CRM",
			"NFLX", "ADBE", "PLTR", "SNOW", "SHOP", "UBER", "ABNB",
			"SOXX", "SMH", "QQQ", "ARKK", "XLK",
		},
		System: `You are DIANE, a tech-sector specialist on call. You ONLY join
when tech / semis / megacap-internet names are in play. Speak in 3-6
sentences. Reference what Lana / Raj said, then add the sector colour
they don't have:
  - hyperscaler capex cycle, AI-spend pull-throughs, GPU supply
  - semi cycle (memory vs logic, foundry utilisation)
  - margin / pricing pressure (cloud, ad, subscription)
  - regulatory overhang (DOJ, EU DMA, China export controls)
Be specific: "TSMC's 3nm is sold out through Q3, that's a tailwind
for AAPL's iPhone margin story Lana mentioned." Do NOT propose
trades — that's Kenji's lane.`,
	},
	{
		Name:        "energy_expert",
		DisplayName: "Marcus · Energy Sector Expert",
		Sector:      "Energy",
		Temperature: 0.45,
		Triggers: []string{
			"XOM", "CVX", "COP", "OXY", "EOG", "SLB", "PSX", "MPC",
			"VLO", "HAL", "BKR", "FANG", "DVN", "PXD",
			"USO", "XLE", "OIH", "BNO",
			// crude/gas/oil keywords matched against news titles too
		},
		System: `You are MARCUS, an energy-sector specialist on call. Speak in
3-6 sentences. Cover the angles others miss:
  - crude inventory / OPEC+ cadence, refining cracks
  - nat-gas storage, weather-driven demand
  - upstream capex discipline vs shale growth
  - geopolitical premium (Middle East, Russia, sanctions)
Tie it to what Lana flagged. Do NOT propose trades — Kenji handles
that.`,
	},
	{
		Name:        "auto_expert",
		DisplayName: "Sora · Auto Sector Expert",
		Sector:      "Auto / EV",
		Temperature: 0.45,
		Triggers: []string{
			"TSLA", "F", "GM", "RIVN", "LCID", "NIO", "LI", "XPEV",
			"STLA", "TM", "HMC", "MBG.DE", "VOW3.DE", "BMW.DE",
			"NVDA", // ADAS exposure
		},
		System: `You are SORA, an auto / EV sector specialist on call. Speak in
3-6 sentences. Add what others can't see:
  - unit deliveries vs estimates, ASP / mix trends
  - battery cost curve, lithium / nickel / cobalt input prices
  - China EV competition, tariff / IRA credit dynamics
  - ADAS / robotaxi narrative vs reality
Reference Lana's headlines. Do NOT propose trades.`,
	},
	{
		Name:        "finance_expert",
		DisplayName: "Imani · Banks & Finance Expert",
		Sector:      "Banks / Finance",
		Temperature: 0.4,
		Triggers: []string{
			"JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC",
			"BLK", "SCHW", "AXP", "V", "MA", "PYPL", "COIN",
			"XLF", "KRE", "KBE",
		},
		System: `You are IMANI, a banks & financials specialist. Speak in 3-6
sentences. Cover:
  - NIM trajectory vs Fed path, deposit beta
  - credit quality (NCO / reserve build), CRE exposure
  - capital markets fee outlook (IPO / M&A)
  - regulatory capital (Basel III endgame)
Tie back to whatever Lana / Raj flagged. No trades.`,
	},
	{
		Name:        "crypto_expert",
		DisplayName: "Kai · Crypto Expert",
		Sector:      "Crypto",
		Temperature: 0.5,
		Triggers: []string{
			"BTC-USD", "ETH-USD", "SOL-USD", "BTC", "ETH", "SOL",
			"COIN", "MSTR", "MARA", "RIOT", "HUT",
		},
		System: `You are KAI, a crypto / digital-assets specialist. Speak in 3-6
sentences. Cover:
  - BTC dominance, ETH/BTC ratio, alt rotation
  - on-chain flows (exchange in/outflow, miner reserves)
  - ETF flows (spot BTC, spot ETH)
  - regulatory headlines (SEC, MiCA, stablecoin policy)
Reference what Lana / Raj said. No trades.`,
	},
	{
		Name:        "geo_expert",
		DisplayName: "Hassan · Geopolitics Expert",
		Sector:      "Geopolitics",
		Temperature: 0.5,
		Triggers: []string{
			// matched against news titles, not symbols
		},
		System: `You are HASSAN, a geopolitics specialist. You join when news
flow is dominated by macro-political risk (war, elections, sanctions,
tariffs, central-bank policy). Speak in 3-6 sentences. Frame the risk
in terms of:
  - which assets get a premium / discount under each plausible path
  - duration: a 24h headline shock vs a multi-quarter regime change
  - safe-haven flows (gold, USD, JPY, CHF, treasuries)
Reference Lana directly. No trades.`,
	},
	{
		Name:        "health_expert",
		DisplayName: "Priya · Healthcare Expert",
		Sector:      "Healthcare",
		Temperature: 0.4,
		Triggers: []string{
			"JNJ", "PFE", "MRK", "LLY", "NVO", "ABBV", "BMY", "AMGN",
			"UNH", "CVS", "CI", "HUM", "ELV",
			"XLV", "IBB", "XBI",
		},
		System: `You are PRIYA, a healthcare / biotech specialist. Speak in 3-6
sentences. Cover:
  - GLP-1 cycle (LLY, NVO) — supply, demand, competition
  - patent cliffs and pipeline catalysts
  - payer dynamics (UNH, ELV) and managed-care MLR trends
  - FDA / EMA approval calendar
Reference Lana. No trades.`,
	},
	{
		Name:        "consumer_expert",
		DisplayName: "Wei · Consumer Expert",
		Sector:      "Consumer",
		Temperature: 0.45,
		Triggers: []string{
			"AMZN", "WMT", "COST", "TGT", "HD", "LOW", "NKE", "LULU",
			"SBUX", "MCD", "CMG", "DIS", "DKNG",
			"XLY", "XLP",
		},
		System: `You are WEI, a consumer / retail specialist. Speak in 3-6
sentences. Cover:
  - low-end vs high-end consumer divergence
  - inventory turns, gross-margin recovery
  - foot traffic, comp sales, e-commerce penetration
  - input cost (commodities, freight, labour)
Tie to the tape and headlines. No trades.`,
	},
}

// expertKeywordTriggers is a separate map of free-text keywords (matched
// against news titles + buckets) for experts that don't really map to
// tickers — Geopolitics, Energy macro, etc. Lowercased.
var expertKeywordTriggers = map[string][]string{
	"energy_expert": {
		"opec", "crude", "oil price", "natural gas", "nat-gas",
		"refinery", "refining", "pipeline", "barrel",
	},
	"geo_expert": {
		"war", "ceasefire", "sanction", "tariff", "election",
		"fed", "ecb", "boj", "central bank", "treasury", "yield",
		"middle east", "ukraine", "russia", "china", "taiwan",
		"iran", "israel", "gaza", "houthi", "north korea",
	},
	"crypto_expert": {
		"bitcoin", "ethereum", "stablecoin", "etf", "halving",
		"sec", "mica",
	},
	"health_expert": {
		"glp-1", "ozempic", "wegovy", "fda approval", "phase 3",
		"clinical trial", "biosimilar",
	},
}

// pickExperts returns the subset of experts that should join this
// meeting based on the watchlist symbols and news content. Capped to
// 3 experts per meeting so the agenda doesn't explode.
func pickExperts(watchlist []string, news []NewsItem) []expert {
	scores := map[string]int{}
	// Symbol triggers (watchlist + news symbols).
	syms := map[string]bool{}
	for _, s := range watchlist {
		syms[strings.ToUpper(strings.TrimSpace(s))] = true
	}
	for _, n := range news {
		syms[strings.ToUpper(strings.TrimSpace(n.Symbol))] = true
	}
	for _, e := range experts {
		for _, t := range e.Triggers {
			if syms[strings.ToUpper(t)] {
				scores[e.Name] += 2 // strong signal: ticker on the desk
			}
		}
	}
	// Keyword triggers (news titles + summaries).
	var newsBlob strings.Builder
	for _, n := range news {
		newsBlob.WriteString(strings.ToLower(n.Title))
		newsBlob.WriteByte(' ')
		newsBlob.WriteString(strings.ToLower(n.Summary))
		newsBlob.WriteByte(' ')
	}
	blob := newsBlob.String()
	for name, kws := range expertKeywordTriggers {
		for _, kw := range kws {
			if strings.Contains(blob, kw) {
				scores[name]++ // weaker signal
			}
		}
	}
	// Filter to anything with at least one match, sort by score desc.
	type scored struct {
		e     expert
		score int
	}
	picked := []scored{}
	for _, e := range experts {
		if s := scores[e.Name]; s > 0 {
			picked = append(picked, scored{e, s})
		}
	}
	sort.SliceStable(picked, func(i, j int) bool {
		return picked[i].score > picked[j].score
	})
	if len(picked) > 3 {
		picked = picked[:3]
	}
	out := make([]expert, 0, len(picked))
	for _, p := range picked {
		out = append(out, p.e)
	}
	return out
}

// expertRolesAndTurns returns the ai.Router-ready role definitions and
// agenda turns for the given experts. Caller splices these into the
// base agenda right after the analyst's opening.
func expertRolesAndTurns(es []expert) (roles []panelRole, turns []panelTurn) {
	for _, e := range es {
		roles = append(roles, panelRole{
			Name:        e.Name,
			DisplayName: e.DisplayName,
			Temperature: e.Temperature,
			System:      e.System,
		})
		turns = append(turns, panelTurn{
			Role:       e.Name,
			UserPrompt: e.DisplayName + ", you're on call. What does the team need to know about " + e.Sector + " right now?",
		})
	}
	return roles, turns
}
