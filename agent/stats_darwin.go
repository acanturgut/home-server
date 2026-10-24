//go:build darwin

package main

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

func initCPU() {}

func getCPUModel() string {
	out, err := exec.Command("sysctl", "-n", "machdep.cpu.brand_string").Output()
	if err != nil {
		return runtime.GOARCH
	}
	return strings.TrimSpace(string(out))
}

func collectSystemStats(hb *Heartbeat) {
	// CPU — rough approximation via sysctl
	out, err := exec.Command("sysctl", "-n", "vm.loadavg").Output()
	if err == nil {
		fields := strings.Fields(strings.Trim(string(out), "{ }"))
		if len(fields) >= 1 {
			load1, _ := strconv.ParseFloat(fields[0], 64)
			hb.CPUUsage = load1 / float64(runtime.NumCPU()) * 100
			if hb.CPUUsage > 100 {
				hb.CPUUsage = 100
			}
		}
	}

	// Memory
	out, err = exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err == nil {
		total, _ := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		hb.MemTotalGB = float64(total) / (1024 * 1024 * 1024)
	}

	// Disk
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		total := stat.Blocks * uint64(stat.Bsize)
		free := stat.Bfree * uint64(stat.Bsize)
		hb.DiskTotalGB = float64(total) / (1024 * 1024 * 1024)
		hb.DiskUsedGB = float64(total-free) / (1024 * 1024 * 1024)
		if total > 0 {
			hb.DiskPct = float64(total-free) / float64(total) * 100
		}
	}
}

// collectLogs is Linux-only (journald).
func collectLogs() []string { return nil }
