package bambu

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/logger"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// mqttClient maintains a persistent MQTT/TLS connection to one Bambu
// printer and writes the latest decoded status into the supplied statusBox.
//
// Bambu's LAN MQTT broker:
//   tcp://{host}:8883     TLS, self-signed cert
//   user: bblp
//   pass: <access code>
//   topics: device/{sn}/report   (printer → us, JSON status)
//           device/{sn}/request  (us → printer, commands)
type mqttClient struct {
	cfg    Printer
	box    *statusBox
	cli    mqtt.Client
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func newMQTTClient(cfg Printer, box *statusBox) *mqttClient {
	return &mqttClient{cfg: cfg, box: box}
}

// Start connects (asynchronously, with auto-reconnect) and subscribes to
// the printer's report topic. Safe to call once per client lifetime.
func (m *mqttClient) Start(parent context.Context) {
	ctx, cancel := context.WithCancel(parent)
	m.cancel = cancel

	opts := mqtt.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("tls://%s:8883", m.cfg.Host))
	opts.SetClientID(fmt.Sprintf("home-server-%s", m.cfg.ID))
	opts.SetUsername("bblp")
	opts.SetPassword(m.cfg.AccessCode)
	// Bambu printers ship with a self-signed TLS cert — skip verification.
	opts.SetTLSConfig(&tls.Config{InsecureSkipVerify: true})
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(30 * time.Second)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)
	opts.SetCleanSession(true)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetPingTimeout(10 * time.Second)
	opts.SetOrderMatters(false)

	topic := fmt.Sprintf("device/%s/report", m.cfg.Serial)
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		logger.Info("bambu/" + m.cfg.Name + ": MQTT connected, subscribing " + topic)
		m.box.update(func(s *Status) {
			s.Online = true
			s.LastError = ""
		})
		if t := c.Subscribe(topic, 0, m.onMessage); t.Wait() && t.Error() != nil {
			logger.Error("bambu/" + m.cfg.Name + ": subscribe failed: " + t.Error().Error())
		}
		// Ask the printer to push a full state snapshot now (otherwise we
		// just see deltas as they happen). The "pushing.start" command is
		// what Bambu Studio sends on every connect.
		req := fmt.Sprintf(
			`{"pushing":{"sequence_id":"0","command":"pushall","version":1,"push_target":1}}`,
		)
		c.Publish(fmt.Sprintf("device/%s/request", m.cfg.Serial), 0, false, req)
	})
	opts.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		logger.Error("bambu/" + m.cfg.Name + ": MQTT lost: " + err.Error())
		m.box.update(func(s *Status) {
			s.Online = false
			s.LastError = "connection lost: " + err.Error()
		})
	})

	m.cli = mqtt.NewClient(opts)
	t := m.cli.Connect()

	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		<-ctx.Done()
		if m.cli.IsConnected() {
			m.cli.Disconnect(250)
		}
		_ = t // keep reference; auto-reconnect is in-process
	}()
}

// Stop tears down the connection. Safe to call multiple times.
func (m *mqttClient) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
	m.wg.Wait()
}

// Publish sends a JSON command on the printer's request topic. Returns an
// error if MQTT is not currently connected (the caller can decide whether
// to retry; we deliberately do NOT queue commands so a stale "pause"
// doesn't fire when the printer comes back online minutes later).
func (m *mqttClient) Publish(payload []byte) error {
	if m.cli == nil || !m.cli.IsConnected() {
		return fmt.Errorf("printer offline")
	}
	topic := fmt.Sprintf("device/%s/request", m.cfg.Serial)
	t := m.cli.Publish(topic, 0, false, payload)
	if !t.WaitTimeout(5 * time.Second) {
		return fmt.Errorf("publish timeout")
	}
	if err := t.Error(); err != nil {
		return fmt.Errorf("publish: %w", err)
	}
	logger.Info("bambu/" + m.cfg.Name + ": → " + string(payload))
	return nil
}

// onMessage decodes the Bambu report envelope into our flat Status struct.
func (m *mqttClient) onMessage(_ mqtt.Client, msg mqtt.Message) {
	var env struct {
		Print map[string]any `json:"print"`
	}
	if err := json.Unmarshal(msg.Payload(), &env); err != nil {
		return
	}
	if env.Print == nil {
		return
	}
	m.box.update(func(s *Status) {
		s.Online = true
		s.UpdatedAt = time.Now()
		s.LastError = ""
		mergePrint(s, env.Print)
	})
}

// mergePrint folds Bambu's "print" object into our Status. We only touch
// fields the printer actually included in this delta — everything else
// keeps its previous value.
func mergePrint(s *Status, p map[string]any) {
	if v, ok := p["gcode_state"].(string); ok {
		s.State = v
	}
	if v, ok := p["stg_cur"]; ok {
		s.StageDescription = stageName(toInt(v))
	}
	if v, ok := p["mc_print_stage"]; ok && s.StageDescription == "" {
		s.StageDescription = stageName(toInt(v))
	}
	if v, ok := p["gcode_file"].(string); ok {
		s.GcodeFile = v
	}
	if v, ok := p["subtask_name"].(string); ok {
		s.Subtask = v
	}
	if v, ok := p["mc_percent"]; ok {
		s.Progress = toInt(v)
	}
	if v, ok := p["layer_num"]; ok {
		s.LayerNum = toInt(v)
	}
	if v, ok := p["total_layer_num"]; ok {
		s.TotalLayers = toInt(v)
	}
	if v, ok := p["mc_remaining_time"]; ok {
		s.RemainingMin = toInt(v)
	}
	if v, ok := p["nozzle_target_temper"]; ok {
		s.NozzleTarget = toFloat(v)
	}
	if v, ok := p["nozzle_temper"]; ok {
		s.NozzleTemper = toFloat(v)
	}
	if v, ok := p["bed_target_temper"]; ok {
		s.BedTarget = toFloat(v)
	}
	if v, ok := p["bed_temper"]; ok {
		s.BedTemper = toFloat(v)
	}
	if v, ok := p["chamber_temper"]; ok {
		s.ChamberTemper = toFloat(v)
	}
	if v, ok := p["wifi_signal"].(string); ok {
		s.WifiSignal = v
	}
	if v, ok := p["cooling_fan_speed"]; ok {
		s.FanCool = fanPct(v)
	}
	if v, ok := p["big_fan1_speed"]; ok {
		s.FanAux = fanPct(v)
	}
	if v, ok := p["big_fan2_speed"]; ok {
		s.FanChamber = fanPct(v)
	}
	if v, ok := p["nozzle_type"].(string); ok {
		s.NozzleType = v
	}
	if lights, ok := p["lights_report"].([]any); ok {
		for _, raw := range lights {
			if entry, ok := raw.(map[string]any); ok {
				if node, _ := entry["node"].(string); node == "chamber_light" {
					mode, _ := entry["mode"].(string)
					s.LightOn = strings.EqualFold(mode, "on")
				}
			}
		}
	}
	if hms, ok := p["hms"].([]any); ok {
		s.HMS = s.HMS[:0]
		for _, e := range hms {
			if entry, ok := e.(map[string]any); ok {
				code := fmt.Sprintf("%v_%v_%v_%v",
					entry["attr"], entry["code"], entry["msg"], entry["uid"])
				code = strings.TrimSpace(code)
				if code != "_____" && code != "" {
					s.HMS = append(s.HMS, code)
				}
			}
		}
	}
	if ams, ok := p["ams"].(map[string]any); ok {
		if amsList, ok := ams["ams"].([]any); ok && len(amsList) > 0 {
			if first, ok := amsList[0].(map[string]any); ok {
				if trays, ok := first["tray"].([]any); ok {
					out := make([]AMSTray, 0, len(trays))
					for _, raw := range trays {
						tr, ok := raw.(map[string]any)
						if !ok {
							continue
						}
						t := AMSTray{ID: toInt(tr["id"])}
						if v, ok := tr["tray_type"].(string); ok {
							t.Name = v
						}
						if v, ok := tr["tray_sub_brands"].(string); ok && v != "" {
							t.Name = v
						}
						if v, ok := tr["tray_color"].(string); ok && len(v) >= 6 {
							t.Color = strings.ToUpper(v[:6])
						}
						out = append(out, t)
					}
					s.AMSTrays = out
				}
			}
		}
	}
}

// stageName maps Bambu's numeric stage codes to a short label. The full
// list is huge (50+ codes) but these cover what users actually see day-to-day.
func stageName(code int) string {
	switch code {
	case -1:
		return ""
	case 0:
		return "Printing"
	case 1:
		return "Auto bed leveling"
	case 2:
		return "Heatbed preheating"
	case 3:
		return "Sweeping XY mech mode"
	case 4:
		return "Changing filament"
	case 5:
		return "M400 pause"
	case 6:
		return "Paused (filament runout)"
	case 7:
		return "Heating hotend"
	case 8:
		return "Calibrating extrusion"
	case 9:
		return "Scanning bed surface"
	case 10:
		return "Inspecting first layer"
	case 11:
		return "Identifying build plate"
	case 12:
		return "Calibrating Micro Lidar"
	case 13:
		return "Homing toolhead"
	case 14:
		return "Cleaning nozzle tip"
	case 15:
		return "Checking extruder temperature"
	case 16:
		return "Paused (user)"
	case 17:
		return "Paused (front cover falling)"
	case 18:
		return "Calibrating Micro Lidar"
	case 19:
		return "Calibrating extrusion flow"
	case 20:
		return "Paused (nozzle temperature too high)"
	case 21:
		return "Paused (heatbed temperature too high)"
	case 22:
		return "Filament unloading"
	case 23:
		return "Skip step pause"
	case 24:
		return "Filament loading"
	case 25:
		return "Motor noise calibration"
	case 26:
		return "Paused (AMS lost)"
	case 27:
		return "Paused (low fan speed)"
	case 28:
		return "Paused (chamber temperature)"
	case 29:
		return "Cooling chamber"
	case 30:
		return "Paused (user gcode)"
	}
	return fmt.Sprintf("Stage %d", code)
}

// Bambu reports fan speeds as 0–15 strings. Convert to 0–100%.
func fanPct(v any) int {
	f := toFloat(v)
	if f <= 0 {
		return 0
	}
	pct := int(f * 100 / 15)
	if pct > 100 {
		pct = 100
	}
	return pct
}

func toInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	case string:
		var i int
		fmt.Sscanf(x, "%d", &i)
		return i
	}
	return 0
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		var f float64
		fmt.Sscanf(x, "%f", &f)
		return f
	}
	return 0
}
