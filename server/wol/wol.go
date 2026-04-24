package wol

import (
	"encoding/hex"
	"fmt"
	"net"
	"strings"
)

// Wake sends a Wake-on-LAN magic packet to the given MAC address.
// The magic packet is broadcast on UDP port 9.
func Wake(macAddr string) error {
	mac, err := parseMAC(macAddr)
	if err != nil {
		return fmt.Errorf("invalid MAC address %q: %w", macAddr, err)
	}

	// Magic packet: 6 bytes of 0xFF + MAC repeated 16 times = 102 bytes
	var packet [102]byte
	for i := 0; i < 6; i++ {
		packet[i] = 0xFF
	}
	for i := 0; i < 16; i++ {
		copy(packet[6+i*6:], mac)
	}

	conn, err := net.DialUDP("udp4", nil, &net.UDPAddr{
		IP:   net.IPv4bcast,
		Port: 9,
	})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	_, err = conn.Write(packet[:])
	if err != nil {
		return fmt.Errorf("send: %w", err)
	}

	return nil
}

func parseMAC(s string) ([]byte, error) {
	s = strings.ReplaceAll(s, ":", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.TrimSpace(s)

	if len(s) != 12 {
		return nil, fmt.Errorf("expected 12 hex chars, got %d", len(s))
	}

	return hex.DecodeString(s)
}
