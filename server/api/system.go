package api

import (
	"bufio"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type systemStats struct {
	Hostname string    `json:"hostname"`
	Uptime   int64     `json:"uptime_seconds"`
	OS       string    `json:"os"`
	Arch     string    `json:"arch"`
	CPU      cpuStats  `json:"cpu"`
	Memory   memStats  `json:"memory"`
	Disk     diskStats `json:"disk"`
}

type cpuStats struct {
	Cores   int     `json:"cores"`
	UsedPct float64 `json:"used_pct"`
}

type memStats struct {
	TotalMB int     `json:"total_mb"`
	UsedMB  int     `json:"used_mb"`
	FreeMB  int     `json:"free_mb"`
	UsedPct float64 `json:"used_pct"`
}

type diskStats struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	UsedPct float64 `json:"used_pct"`
	Path    string  `json:"path"`
}

// GET /api/system
func (h *Handler) System(w http.ResponseWriter, r *http.Request) {
	hostname, _ := os.Hostname()

	stats := systemStats{
		Hostname: hostname,
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		CPU: cpuStats{
			Cores:   runtime.NumCPU(),
			UsedPct: cpuUsage(),
		},
		Memory: memoryUsage(),
		Disk:   diskUsage("/"),
		Uptime: uptimeSeconds(),
	}

	writeJSON(w, http.StatusOK, stats)
}

func cpuUsage() float64 {
	idle0, total0 := cpuSample()
	time.Sleep(200 * time.Millisecond)
	idle1, total1 := cpuSample()

	idleDelta := float64(idle1 - idle0)
	totalDelta := float64(total1 - total0)
	if totalDelta == 0 {
		return 0
	}
	return (1.0 - idleDelta/totalDelta) * 100
}

func cpuSample() (idle, total uint64) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			return 0, 0
		}
		for i := 1; i < len(fields); i++ {
			val, _ := strconv.ParseUint(fields[i], 10, 64)
			total += val
			if i == 4 { // idle is the 4th value
				idle = val
			}
		}
		break
	}
	return
}

func memoryUsage() memStats {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return memStats{}
	}
	defer f.Close()

	vals := map[string]int{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		valStr := strings.TrimSpace(parts[1])
		valStr = strings.TrimSuffix(valStr, " kB")
		valStr = strings.TrimSpace(valStr)
		val, _ := strconv.Atoi(valStr)
		vals[key] = val
	}

	totalKB := vals["MemTotal"]
	availKB := vals["MemAvailable"]
	usedKB := totalKB - availKB

	totalMB := totalKB / 1024
	usedMB := usedKB / 1024
	freeMB := availKB / 1024

	var pct float64
	if totalKB > 0 {
		pct = float64(usedKB) / float64(totalKB) * 100
	}

	return memStats{
		TotalMB: totalMB,
		UsedMB:  usedMB,
		FreeMB:  freeMB,
		UsedPct: pct,
	}
}

func diskUsage(path string) diskStats {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return diskStats{Path: path}
	}

	totalBytes := stat.Blocks * uint64(stat.Bsize)
	freeBytes := stat.Bavail * uint64(stat.Bsize)
	usedBytes := totalBytes - freeBytes

	gb := 1024.0 * 1024.0 * 1024.0
	totalGB := float64(totalBytes) / gb
	usedGB := float64(usedBytes) / gb
	freeGB := float64(freeBytes) / gb

	var pct float64
	if totalBytes > 0 {
		pct = float64(usedBytes) / float64(totalBytes) * 100
	}

	return diskStats{
		TotalGB: round2(totalGB),
		UsedGB:  round2(usedGB),
		FreeGB:  round2(freeGB),
		UsedPct: round2(pct),
		Path:    path,
	}
}

func round2(f float64) float64 {
	return float64(int(f*100)) / 100
}

func uptimeSeconds() int64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return 0
	}
	val, _ := strconv.ParseFloat(fields[0], 64)
	return int64(val)
}
