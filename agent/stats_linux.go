//go:build linux

package main

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var prevIdle, prevTotal uint64

func initCPU() {
	prevIdle, prevTotal = readCPUTimes()
	time.Sleep(200 * time.Millisecond)
}

func readCPUTimes() (idle, total uint64) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return
	}
	line := strings.SplitN(string(data), "\n", 2)[0]
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return
	}
	for i, f := range fields[1:] {
		v, _ := strconv.ParseUint(f, 10, 64)
		total += v
		if i == 3 { // idle is the 4th field
			idle = v
		}
	}
	return
}

func cpuUsage() float64 {
	idle, total := readCPUTimes()
	idleD := idle - prevIdle
	totalD := total - prevTotal
	prevIdle = idle
	prevTotal = total
	if totalD == 0 {
		return 0
	}
	return float64(totalD-idleD) / float64(totalD) * 100
}

func getCPUModel() string {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return runtime.GOARCH
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return runtime.GOARCH
}

func collectSystemStats(hb *Heartbeat) {
	// CPU
	hb.CPUUsage = cpuUsage()

	// Memory from /proc/meminfo
	data, err := os.ReadFile("/proc/meminfo")
	if err == nil {
		var memTotal, memAvail uint64
		for _, line := range strings.Split(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			val, _ := strconv.ParseUint(fields[1], 10, 64)
			switch fields[0] {
			case "MemTotal:":
				memTotal = val
			case "MemAvailable:":
				memAvail = val
			}
		}
		hb.MemTotalGB = float64(memTotal) / (1024 * 1024)
		hb.MemUsedGB = float64(memTotal-memAvail) / (1024 * 1024)
		if memTotal > 0 {
			hb.MemPct = float64(memTotal-memAvail) / float64(memTotal) * 100
		}
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

	// Uptime
	data, err = os.ReadFile("/proc/uptime")
	if err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 1 {
			secs, _ := strconv.ParseFloat(fields[0], 64)
			hb.UptimeSecs = int64(secs)
		}
	}

	// CPU Temp — read from thermal zones
	for i := 0; i < 10; i++ {
		path := fmt.Sprintf("/sys/class/thermal/thermal_zone%d/temp", i)
		raw, err := os.ReadFile(path)
		if err != nil {
			break
		}
		val, _ := strconv.Atoi(strings.TrimSpace(string(raw)))
		temp := val / 1000 // millidegrees to Celsius
		if temp > hb.CPUTemp {
			hb.CPUTemp = temp // take the highest thermal zone
		}
	}
}
