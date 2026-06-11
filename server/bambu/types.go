package bambu

import (
	"sync"
	"time"
)

// Printer is the persisted configuration for a single Bambu printer.
// All three of Host / Serial / AccessCode are required to bring up the
// MQTT and camera links.
type Printer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`         // LAN IP, no scheme (e.g. "192.168.50.42")
	Serial     string `json:"serial"`       // SN from printer's WLAN screen
	AccessCode string `json:"access_code"`  // 8-digit code from printer's WLAN screen
	Model      string `json:"model"`        // free-form: "A1", "P1S", "X1C", …
	CreatedAt  time.Time `json:"created_at"`
}

// AMSTray represents one tray (filament spool) loaded in the AMS lite/AMS.
type AMSTray struct {
	ID    int    `json:"id"`
	Name  string `json:"name,omitempty"`  // e.g. "PLA Basic"
	Color string `json:"color,omitempty"` // hex "RRGGBB" without leading #
}

// Status is the latest distilled state of a printer derived from the MQTT
// `device/{sn}/report` stream. Fields are best-effort: missing data stays
// at zero values rather than failing the whole snapshot.
type Status struct {
	Online           bool      `json:"online"`
	UpdatedAt        time.Time `json:"updated_at,omitempty"`
	State            string    `json:"state,omitempty"`         // RUNNING / IDLE / FAILED / FINISH / PAUSED
	StageDescription string    `json:"stage_description,omitempty"`
	GcodeFile        string    `json:"gcode_file,omitempty"`
	Subtask          string    `json:"subtask_name,omitempty"`
	Progress         int       `json:"progress"`                // 0..100
	LayerNum         int       `json:"layer_num"`
	TotalLayers      int       `json:"total_layers"`
	RemainingMin     int       `json:"remaining_min"`
	NozzleTarget     float64   `json:"nozzle_target"`
	NozzleTemper     float64   `json:"nozzle_temper"`
	BedTarget        float64   `json:"bed_target"`
	BedTemper        float64   `json:"bed_temper"`
	ChamberTemper    float64   `json:"chamber_temper"`
	WifiSignal       string    `json:"wifi_signal,omitempty"`
	FanCool          int       `json:"fan_cool"`     // %
	FanAux           int       `json:"fan_aux"`      // %
	FanChamber       int       `json:"fan_chamber"`  // %
	NozzleType       string    `json:"nozzle_type,omitempty"`
	HMS              []string  `json:"hms,omitempty"` // active error/warning codes
	AMSTrays         []AMSTray `json:"ams_trays,omitempty"`
	LightOn          bool      `json:"light_on"`
	LastError        string    `json:"last_error,omitempty"` // populated when MQTT or camera fails
}

// statusBox is a tiny mutex-guarded wrapper. Used by mqtt.go to publish
// fresh snapshots that handlers.go reads from a different goroutine.
type statusBox struct {
	mu  sync.RWMutex
	cur Status
}

func (s *statusBox) set(v Status) {
	s.mu.Lock()
	s.cur = v
	s.mu.Unlock()
}

func (s *statusBox) get() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cur
}

func (s *statusBox) update(fn func(*Status)) {
	s.mu.Lock()
	fn(&s.cur)
	s.mu.Unlock()
}
