package bambu

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
)

// Bambu command payloads (the JSON we publish on `device/{sn}/request`).
//
// Reverse-engineered from Bambu Studio's open-source slicer + community
// efforts. All commands take a sequence_id; the printer echoes it back
// in the report so you could correlate replies, but we ignore that and
// just trust the next status snapshot.

var seqCounter uint64

func nextSeq() string {
	return fmt.Sprintf("%d", atomic.AddUint64(&seqCounter, 1))
}

// Command sends one of the named commands to the printer. Args is a free
// map for command-specific params (e.g. {"target": 60} for set_bed_temp).
//
// Recognised actions:
//   pause            – pause current print
//   resume           – resume paused print
//   stop             – cancel/stop print
//   light            – toggle chamber light. args: {"on": true|false}
//   speed            – set print speed level. args: {"level": 1..4}
//                       1=Silent  2=Standard  3=Sport  4=Ludicrous
//   nozzle_temp      – set nozzle target. args: {"target": 220}
//   bed_temp         – set bed target. args: {"target": 60}
//   fan              – set part-cooling fan %. args: {"speed": 0..100}
//   aux_fan          – aux fan %.    args: {"speed": 0..100}
//   chamber_fan      – chamber fan %. args: {"speed": 0..100}
//   home             – move to home position
//   unload_filament  – AMS unload current spool
func (m *Manager) Command(id, action string, args map[string]any) error {
	m.mu.RLock()
	cli := m.mqtts[id]
	m.mu.RUnlock()
	if cli == nil {
		return fmt.Errorf("printer not found")
	}
	payload, err := buildCommand(action, args)
	if err != nil {
		return err
	}
	return cli.Publish(payload)
}

// PrintProjectFile asks the printer to start printing an already-uploaded
// 3MF file from internal storage. Mirrors what Bambu Studio sends when
// you click "Print Plate" with "Send to printer" target.
func (m *Manager) PrintProjectFile(id string, opts PrintRequest) error {
	m.mu.RLock()
	cli := m.mqtts[id]
	m.mu.RUnlock()
	if cli == nil {
		return fmt.Errorf("printer not found")
	}
	payload, err := buildPrintCommand(opts)
	if err != nil {
		return err
	}
	return cli.Publish(payload)
}

// PrintRequest captures the slicer-style options for kicking off a print.
// Defaults match what Bambu Handy uses when you tap "Print" on a model.
type PrintRequest struct {
	Filename       string `json:"filename"`         // file in printer storage e.g. "myprint.3mf"
	Plate          int    `json:"plate"`            // plate index, 1-based
	UseAMS         bool   `json:"use_ams"`          // pull from AMS vs external spool
	BedLeveling    bool   `json:"bed_leveling"`     // run auto-bed-level before print
	FlowCalibration bool  `json:"flow_calibration"` // dynamic flow-rate calibration
	VibrationCal   bool   `json:"vibration_cal"`    // input shaping cal
	LayerInspect   bool   `json:"layer_inspect"`    // first-layer AI inspection
	Timelapse      bool   `json:"timelapse"`        // record timelapse
	AMSMapping     []int  `json:"ams_mapping,omitempty"` // per-extruder slot index, -1 = skip
}

func buildCommand(action string, args map[string]any) ([]byte, error) {
	if args == nil {
		args = map[string]any{}
	}
	wrap := func(category string, body map[string]any) ([]byte, error) {
		body["sequence_id"] = nextSeq()
		return json.Marshal(map[string]any{category: body})
	}
	switch strings.ToLower(action) {
	case "pause":
		return wrap("print", map[string]any{"command": "pause"})
	case "resume":
		return wrap("print", map[string]any{"command": "resume"})
	case "stop":
		return wrap("print", map[string]any{"command": "stop"})
	case "light":
		on, _ := args["on"].(bool)
		mode := "off"
		if on {
			mode = "on"
		}
		return wrap("system", map[string]any{
			"command":   "ledctrl",
			"led_node":  "chamber_light",
			"led_mode":  mode,
			"led_on_time":    500,
			"led_off_time":   500,
			"loop_times":     0,
			"interval_time":  0,
		})
	case "speed":
		lvl := toIntAny(args["level"])
		if lvl < 1 || lvl > 4 {
			return nil, fmt.Errorf("speed level must be 1..4")
		}
		return wrap("print", map[string]any{
			"command":      "print_speed",
			"param":        fmt.Sprintf("%d", lvl),
		})
	case "nozzle_temp":
		t := toIntAny(args["target"])
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   fmt.Sprintf("M104 S%d\n", t),
		})
	case "bed_temp":
		t := toIntAny(args["target"])
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   fmt.Sprintf("M140 S%d\n", t),
		})
	case "fan":
		s := toIntAny(args["speed"])
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   fmt.Sprintf("M106 P1 S%d\n", clampPercentToByte(s)),
		})
	case "aux_fan":
		s := toIntAny(args["speed"])
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   fmt.Sprintf("M106 P2 S%d\n", clampPercentToByte(s)),
		})
	case "chamber_fan":
		s := toIntAny(args["speed"])
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   fmt.Sprintf("M106 P3 S%d\n", clampPercentToByte(s)),
		})
	case "home":
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   "G28\n",
		})
	case "unload_filament":
		return wrap("print", map[string]any{
			"command": "gcode_line",
			"param":   "M620 S255\n",
		})
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func buildPrintCommand(o PrintRequest) ([]byte, error) {
	if o.Filename == "" {
		return nil, fmt.Errorf("filename required")
	}
	if o.Plate < 1 {
		o.Plate = 1
	}
	// Files uploaded via FTPS land in /cache. The printer expects a path
	// relative to the storage root, with the leading slash.
	storagePath := o.Filename
	if !strings.HasPrefix(storagePath, "/") {
		storagePath = "/cache/" + storagePath
	}
	body := map[string]any{
		"sequence_id":          nextSeq(),
		"command":              "project_file",
		"param":                fmt.Sprintf("Metadata/plate_%d.gcode", o.Plate),
		"project_id":           "0",
		"profile_id":           "0",
		"task_id":              "0",
		"subtask_id":           "0",
		"subtask_name":         strings.TrimSuffix(o.Filename, ".3mf"),
		"file":                 "",
		"url":                  "ftp://" + storagePath,
		"md5":                  "",
		"timelapse":            o.Timelapse,
		"bed_type":             "auto",
		"bed_levelling":        o.BedLeveling,
		"flow_cali":            o.FlowCalibration,
		"vibration_cali":       o.VibrationCal,
		"layer_inspect":        o.LayerInspect,
		"ams_mapping":          o.AMSMapping,
		"use_ams":              o.UseAMS,
	}
	return json.Marshal(map[string]any{"print": body})
}

func toIntAny(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case json.Number:
		i, _ := x.Int64()
		return int(i)
	}
	return 0
}

func clampPercentToByte(p int) int {
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	return (p * 255) / 100
}
