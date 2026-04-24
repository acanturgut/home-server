//go:build windows

package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

const (
	regKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
	regName    = "HomeAgent"
)

var (
	advapi32            = syscall.NewLazyDLL("advapi32.dll")
	procRegOpenKeyEx    = advapi32.NewProc("RegOpenKeyExW")
	procRegSetValueEx   = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValue  = advapi32.NewProc("RegDeleteValueW")
	procRegCloseKey     = advapi32.NewProc("RegCloseKey")
	procRegQueryValueEx = advapi32.NewProc("RegQueryValueExW")
)

const (
	hkeyCurrentUser = 0x80000001
	keyWrite        = 0x20006
	keyRead         = 0x20019
	regSZ           = 1
)

func installDir() string {
	appdata := os.Getenv("APPDATA")
	if appdata == "" {
		appdata = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appdata, "home-agent")
}

func installedExePath() string {
	return filepath.Join(installDir(), "home-agent.exe")
}

// isInstalledCopy returns true if the running exe is already in the install directory.
func isInstalledCopy() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	exe, _ = filepath.Abs(exe)
	target, _ := filepath.Abs(installedExePath())
	return strings.EqualFold(exe, target)
}

// installAgent copies the exe to %APPDATA%\home-agent\ and adds a registry Run key.
func installAgent(serverURL, nodeID string) error {
	dir := installDir()
	os.MkdirAll(dir, 0755)
	target := installedExePath()

	// Copy current exe to install dir (skip if already there)
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	exe, _ = filepath.Abs(exe)
	if !strings.EqualFold(exe, target) {
		src, err := os.Open(exe)
		if err != nil {
			return fmt.Errorf("open source: %w", err)
		}
		defer src.Close()

		dst, err := os.Create(target)
		if err != nil {
			return fmt.Errorf("create target: %w", err)
		}
		defer dst.Close()

		if _, err := io.Copy(dst, src); err != nil {
			return fmt.Errorf("copy: %w", err)
		}
	}

	// Write config file next to exe
	configPath := filepath.Join(dir, "config.txt")
	config := fmt.Sprintf("SERVER_URL=%s\nNODE_ID=%s\n", serverURL, nodeID)
	if err := os.WriteFile(configPath, []byte(config), 0644); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	// Add to registry: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
	regValue := fmt.Sprintf(`"%s" -server "%s" -id "%s"`, target, serverURL, nodeID)
	if err := regSetRunValue(regValue); err != nil {
		return fmt.Errorf("registry: %w", err)
	}

	log.Printf("installed to %s", target)
	log.Printf("added to startup (registry Run key)")
	return nil
}

// uninstallAgent removes the registry key and config. Does not delete exe (may be running).
func uninstallAgent() error {
	if err := regDeleteRunValue(); err != nil {
		log.Printf("warning: could not remove registry key: %v", err)
	} else {
		log.Println("removed from startup")
	}
	configPath := filepath.Join(installDir(), "config.txt")
	os.Remove(configPath)
	return nil
}

// loadConfig reads server URL and node ID from config.txt next to the exe.
func loadConfig() (serverURL, nodeID string) {
	exe, err := os.Executable()
	if err != nil {
		return "", ""
	}
	configPath := filepath.Join(filepath.Dir(exe), "config.txt")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return "", ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "SERVER_URL=") {
			serverURL = strings.TrimPrefix(line, "SERVER_URL=")
		} else if strings.HasPrefix(line, "NODE_ID=") {
			nodeID = strings.TrimPrefix(line, "NODE_ID=")
		}
	}
	return
}

func regSetRunValue(value string) error {
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	valName, _ := syscall.UTF16PtrFromString(regName)
	valData, _ := syscall.UTF16FromString(value)

	var hKey uintptr
	ret, _, _ := procRegOpenKeyEx.Call(
		hkeyCurrentUser,
		uintptr(unsafe.Pointer(keyPath)),
		0,
		keyWrite,
		uintptr(unsafe.Pointer(&hKey)),
	)
	if ret != 0 {
		return fmt.Errorf("RegOpenKeyEx failed: %d", ret)
	}
	defer procRegCloseKey.Call(hKey)

	dataBytes := (*[1 << 20]byte)(unsafe.Pointer(&valData[0]))[: len(valData)*2 : len(valData)*2]
	ret, _, _ = procRegSetValueEx.Call(
		hKey,
		uintptr(unsafe.Pointer(valName)),
		0,
		regSZ,
		uintptr(unsafe.Pointer(&dataBytes[0])),
		uintptr(len(dataBytes)),
	)
	if ret != 0 {
		return fmt.Errorf("RegSetValueEx failed: %d", ret)
	}
	return nil
}

func regDeleteRunValue() error {
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	valName, _ := syscall.UTF16PtrFromString(regName)

	var hKey uintptr
	ret, _, _ := procRegOpenKeyEx.Call(
		hkeyCurrentUser,
		uintptr(unsafe.Pointer(keyPath)),
		0,
		keyWrite,
		uintptr(unsafe.Pointer(&hKey)),
	)
	if ret != 0 {
		return fmt.Errorf("RegOpenKeyEx failed: %d", ret)
	}
	defer procRegCloseKey.Call(hKey)

	ret, _, _ = procRegDeleteValue.Call(
		hKey,
		uintptr(unsafe.Pointer(valName)),
	)
	if ret != 0 {
		return fmt.Errorf("RegDeleteValue failed: %d", ret)
	}
	return nil
}
