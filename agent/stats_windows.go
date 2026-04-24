//go:build windows

package main

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procGetSystemTimes = kernel32.NewProc("GetSystemTimes")
	procGlobalMemory   = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64 = kernel32.NewProc("GetTickCount64")
	procGetDiskFree    = kernel32.NewProc("GetDiskFreeSpaceExW")
)

type fileTime struct {
	LowDateTime  uint32
	HighDateTime uint32
}

func ftToU64(ft fileTime) uint64 {
	return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
}

type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var prevIdle, prevKernel, prevUser uint64

func initCPU() {
	var idle, kern, user fileTime
	procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kern)),
		uintptr(unsafe.Pointer(&user)),
	)
	prevIdle = ftToU64(idle)
	prevKernel = ftToU64(kern)
	prevUser = ftToU64(user)
	time.Sleep(200 * time.Millisecond)
}

func cpuUsage() float64 {
	var idle, kern, user fileTime
	procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kern)),
		uintptr(unsafe.Pointer(&user)),
	)
	idleD := ftToU64(idle) - prevIdle
	kernelD := ftToU64(kern) - prevKernel
	userD := ftToU64(user) - prevUser

	prevIdle = ftToU64(idle)
	prevKernel = ftToU64(kern)
	prevUser = ftToU64(user)

	total := kernelD + userD
	if total == 0 {
		return 0
	}
	return float64(total-idleD) / float64(total) * 100
}

func getCPUModel() string {
	out, err := exec.Command("wmic", "cpu", "get", "name", "/value").Output()
	if err != nil {
		return runtime.GOARCH
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Name=") {
			return strings.TrimPrefix(line, "Name=")
		}
	}
	return runtime.GOARCH
}

func collectSystemStats(hb *Heartbeat) {
	// CPU
	hb.CPUUsage = cpuUsage()

	// Memory
	var mem memoryStatusEx
	mem.Length = uint32(unsafe.Sizeof(mem))
	procGlobalMemory.Call(uintptr(unsafe.Pointer(&mem)))
	hb.MemTotalGB = float64(mem.TotalPhys) / (1024 * 1024 * 1024)
	hb.MemUsedGB = float64(mem.TotalPhys-mem.AvailPhys) / (1024 * 1024 * 1024)
	hb.MemPct = float64(mem.MemoryLoad)

	// Disk (C:\)
	pathPtr, _ := syscall.UTF16PtrFromString("C:\\")
	var free, total, totalFree uint64
	procGetDiskFree.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&free)),
		uintptr(unsafe.Pointer(&total)),
		uintptr(unsafe.Pointer(&totalFree)),
	)
	hb.DiskTotalGB = float64(total) / (1024 * 1024 * 1024)
	hb.DiskUsedGB = float64(total-totalFree) / (1024 * 1024 * 1024)
	if total > 0 {
		hb.DiskPct = float64(total-totalFree) / float64(total) * 100
	}

	// Uptime
	ret, _, _ := procGetTickCount64.Call()
	hb.UptimeSecs = int64(ret) / 1000

	// CPU Temp — try multiple methods (best-effort)
	// Method 1: WMI ThermalZone (requires admin)
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		`(Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentTemperature`).Output()
	if err == nil {
		val := strings.TrimSpace(string(out))
		if t, e := strconv.Atoi(val); e == nil && t > 0 {
			hb.CPUTemp = (t - 2732) / 10
			return
		}
	}
	// Method 2: OpenHardwareMonitor WMI (if OHM/LibreHardwareMonitor is running)
	out, err = exec.Command("powershell", "-NoProfile", "-Command",
		`(Get-CimInstance -Namespace root/OpenHardwareMonitor -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq 'Temperature' -and $_.Name -like '*CPU*'} | Select-Object -First 1).Value`).Output()
	if err == nil {
		val := strings.TrimSpace(string(out))
		if t, e := strconv.Atoi(val); e == nil && t > 0 {
			hb.CPUTemp = t
			return
		}
	}
	// Method 3: LibreHardwareMonitor WMI
	out, err = exec.Command("powershell", "-NoProfile", "-Command",
		`(Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq 'Temperature' -and $_.Name -like '*CPU*'} | Select-Object -First 1).Value`).Output()
	if err == nil {
		val := strings.TrimSpace(string(out))
		if t, e := strconv.Atoi(val); e == nil && t > 0 {
			hb.CPUTemp = t
		}
	}
}
