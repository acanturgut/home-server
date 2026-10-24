package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Heartbeat is sent to the server every interval.
type Heartbeat struct {
	NodeID      string  `json:"node_id"`
	Hostname    string  `json:"hostname"`
	OS          string  `json:"os"`
	Arch        string  `json:"arch"`
	CPUModel    string  `json:"cpu_model"`
	CPUCores    int     `json:"cpu_cores"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemTotalGB  float64 `json:"mem_total_gb"`
	MemUsedGB   float64 `json:"mem_used_gb"`
	MemPct      float64 `json:"mem_pct"`
	DiskTotalGB float64 `json:"disk_total_gb"`
	DiskUsedGB  float64 `json:"disk_used_gb"`
	DiskPct     float64 `json:"disk_pct"`
	CPUTemp     int     `json:"cpu_temp,omitempty"`
	GPUName     string  `json:"gpu_name,omitempty"`
	GPUUsage    int     `json:"gpu_usage,omitempty"`
	GPUMemTotal int     `json:"gpu_mem_total_mb,omitempty"`
	GPUMemUsed  int     `json:"gpu_mem_used_mb,omitempty"`
	GPUTemp     int     `json:"gpu_temp,omitempty"`
	NVMeTemp    int     `json:"nvme_temp,omitempty"`
	CPUWatts    float64 `json:"cpu_watts,omitempty"`
	GPUWatts    float64 `json:"gpu_watts,omitempty"`
	UptimeSecs  int64   `json:"uptime_secs"`
	// Logs are system warnings and errors since the previous heartbeat.
	Logs []string `json:"logs,omitempty"`
}

// HeartbeatResponse contains commands from the server.
type HeartbeatResponse struct {
	Commands []string `json:"commands"`
}

// Default server URL — set at build time via -ldflags "-X main.defaultServer=..."
var defaultServer = "http://192.168.50.199:8080"

func main() {
	var (
		serverURL string
		nodeID    string
		interval  time.Duration
		uninstall bool
	)

	flag.StringVar(&serverURL, "server", "", "Server URL (overrides default)")
	flag.StringVar(&nodeID, "id", "", "Node ID (defaults to hostname)")
	flag.DurationVar(&interval, "interval", 10*time.Second, "Heartbeat interval")
	flag.BoolVar(&uninstall, "uninstall", false, "Remove from startup and exit")
	flag.Parse()

	// Handle uninstall
	if uninstall {
		if err := uninstallAgent(); err != nil {
			log.Fatalf("uninstall failed: %v", err)
		}
		fmt.Println("✓ Home Agent removed from startup.")
		return
	}

	// Resolve config: flags > env > config file > defaults
	if serverURL == "" {
		serverURL = os.Getenv("SERVER_URL")
	}
	if nodeID == "" {
		nodeID = os.Getenv("NODE_ID")
	}
	if serverURL == "" || nodeID == "" {
		cfgServer, cfgNode := loadConfig()
		if serverURL == "" {
			serverURL = cfgServer
		}
		if nodeID == "" {
			nodeID = cfgNode
		}
	}
	if serverURL == "" {
		serverURL = defaultServer
	}
	if nodeID == "" {
		nodeID = deriveNodeID()
	}

	hostname, _ := os.Hostname()

	// Auto-install on first run (Windows: copy to %APPDATA%, add to registry Run)
	if runtime.GOOS == "windows" && !isInstalledCopy() {
		fmt.Println("╔══════════════════════════════════════╗")
		fmt.Println("║       Home Agent — First Run         ║")
		fmt.Println("╚══════════════════════════════════════╝")
		fmt.Println()
		fmt.Printf("  Node ID   : %s\n", nodeID)
		fmt.Printf("  Hostname  : %s\n", hostname)
		fmt.Printf("  Server    : %s\n", serverURL)
		fmt.Println()
		fmt.Println("→ Installing to %APPDATA%\\home-agent\\...")
		if err := installAgent(serverURL, nodeID); err != nil {
			fmt.Printf("  ⚠ Install warning: %v (continuing anyway)\n", err)
		} else {
			fmt.Println("  ✓ Copied exe to install directory")
			fmt.Println("  ✓ Saved config (server + node ID)")
			fmt.Println("  ✓ Added to Windows startup (Registry)")
		}
		fmt.Println()
		fmt.Println("Done! Agent will start automatically on login.")
		fmt.Println("Sending first heartbeat now...")
		fmt.Println()
	}
	cpuModel := getCPUModel()

	log.Printf("home-agent starting: node=%s server=%s interval=%s", nodeID, serverURL, interval)

	initCPU()

	for {
		hb := Heartbeat{
			NodeID:   nodeID,
			Hostname: hostname,
			OS:       runtime.GOOS,
			Arch:     runtime.GOARCH,
			CPUModel: cpuModel,
			CPUCores: runtime.NumCPU(),
		}

		collectSystemStats(&hb)
		collectGPU(&hb)
		// ponytail: lines from a failed heartbeat are dropped, not retried.
		hb.Logs = collectLogs()

		cmds := sendHeartbeat(serverURL, hb)
		for _, cmd := range cmds {
			executeCommand(cmd)
		}

		time.Sleep(interval)
	}
}

func sendHeartbeat(serverURL string, hb Heartbeat) []string {
	data, _ := json.Marshal(hb)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(serverURL+"/api/agent/heartbeat", "application/json", bytes.NewReader(data))
	if err != nil {
		log.Printf("heartbeat failed: %v", err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		log.Printf("heartbeat: server returned %d: %s", resp.StatusCode, string(body))
		return nil
	}

	var result HeartbeatResponse
	json.Unmarshal(body, &result)

	log.Printf("heartbeat ok: cpu=%.0f%% mem=%.1f/%.1fGB disk=%.0f%% gpu=%s temp_cpu=%d°C temp_gpu=%d°C",
		hb.CPUUsage, hb.MemUsedGB, hb.MemTotalGB, hb.DiskPct, hb.GPUName, hb.CPUTemp, hb.GPUTemp)

	if len(result.Commands) > 0 {
		log.Printf("commands received: %v", result.Commands)
	}
	return result.Commands
}

func executeCommand(cmd string) {
	switch cmd {
	case "shutdown":
		log.Println("received shutdown command, shutting down in 5 seconds...")
		if runtime.GOOS == "windows" {
			out, err := exec.Command("shutdown", "/s", "/t", "5").CombinedOutput()
			if err != nil {
				log.Printf("shutdown failed: %v — %s", err, string(out))
			}
		} else {
			out, err := exec.Command("sudo", "shutdown", "-h", "+0").CombinedOutput()
			if err != nil {
				log.Printf("shutdown failed: %v — %s", err, string(out))
			}
		}
	default:
		log.Printf("unknown command: %s", cmd)
	}
}

func collectGPU(hb *Heartbeat) {
	out, err := exec.Command("nvidia-smi",
		"--query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu,power.draw",
		"--format=csv,noheader,nounits").Output()
	if err != nil {
		return
	}
	line := strings.TrimSpace(string(out))
	parts := strings.Split(line, ", ")
	if len(parts) < 5 {
		return
	}
	hb.GPUName = strings.TrimSpace(parts[0])
	hb.GPUUsage, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	hb.GPUMemTotal, _ = strconv.Atoi(strings.TrimSpace(parts[2]))
	hb.GPUMemUsed, _ = strconv.Atoi(strings.TrimSpace(parts[3]))
	hb.GPUTemp, _ = strconv.Atoi(strings.TrimSpace(parts[4]))
	if len(parts) > 5 { // "[N/A]" on GPUs without a power sensor parses as 0
		hb.GPUWatts, _ = strconv.ParseFloat(strings.TrimSpace(parts[5]), 64)
	}
}

// deriveNodeID generates a node ID from the hostname (lowercase, sanitized).
func deriveNodeID() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "node"
	}
	hostname = strings.ToLower(hostname)
	// Keep only alphanumeric and hyphens
	var b strings.Builder
	for _, c := range hostname {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			b.WriteRune(c)
		}
	}
	id := b.String()
	if id == "" {
		id = "node"
	}
	return id
}
