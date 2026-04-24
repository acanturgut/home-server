//go:build !windows

package main

func isInstalledCopy() bool { return false }

func installAgent(serverURL, nodeID string) error { return nil }

func uninstallAgent() error { return nil }

func loadConfig() (string, string) { return "", "" }
