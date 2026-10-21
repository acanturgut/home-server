package homekit

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/brutella/hap"
	"github.com/brutella/hap/accessory"

	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/nodestate"
	"github.com/acanturgut/home-server/wol"
)

type nodeSw struct {
	sw     *accessory.Switch
	nodeID string
	name   string
}

type Bridge struct {
	server   *hap.Server
	switches []nodeSw
	ns       *nodestate.Store
}

func NewBridge(nodes *config.NodeStore, ns *nodestate.Store, dataDir string, pin string) (*Bridge, error) {
	bridge := accessory.NewBridge(accessory.Info{
		Name:         "Home Server",
		Manufacturer: "acanturgut",
		Model:        "RPi5",
	})

	var accessories []*accessory.A
	var switches []nodeSw
	for _, node := range nodes.All() {
		if node.MAC == "" {
			continue
		}
		sw := accessory.NewSwitch(accessory.Info{
			Name:         node.Name,
			Manufacturer: "acanturgut",
			SerialNumber: node.ID,
		})
		mac := node.MAC
		name := node.Name
		nodeID := node.ID

		sw.Switch.On.OnValueRemoteUpdate(func(on bool) {
			if on {
				logger.Info(fmt.Sprintf("homekit: waking %s (%s)", name, mac))
				if err := wol.Wake(mac); err != nil {
					logger.Error(fmt.Sprintf("homekit: wake %s failed: %v", name, err))
				}
			} else {
				logger.Info(fmt.Sprintf("homekit: requesting shutdown of %s", name))
				ns.Enqueue(nodeID, "shutdown")
			}
		})
		accessories = append(accessories, sw.A)
		switches = append(switches, nodeSw{
			sw:     sw,
			nodeID: nodeID,
			name:   name,
		})
	}

	storePath := dataDir + "/homekit"
	os.MkdirAll(storePath, 0755)

	store := hap.NewFsStore(storePath)
	server, err := hap.NewServer(store, bridge.A, accessories...)
	if err != nil {
		return nil, fmt.Errorf("homekit server: %w", err)
	}

	server.Pin = pin
	server.Addr = ":51826"
	server.SetupId = "HMSR"

	return &Bridge{server: server, switches: switches, ns: ns}, nil
}

func (b *Bridge) Start(ctx context.Context) error {
	logger.Info("homekit: bridge starting on :51826")

	// Background goroutine: sync switch state with actual node online status
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				for _, nsw := range b.switches {
					online := b.ns.IsOnline(nsw.nodeID)
					current := nsw.sw.Switch.On.Value()
					if online != current {
						logger.Info(fmt.Sprintf("homekit: %s is now %s", nsw.name, map[bool]string{true: "ON", false: "OFF"}[online]))
						nsw.sw.Switch.On.SetValue(online)
					}
				}
			}
		}
	}()

	return b.server.ListenAndServe(ctx)
}

// SetupURI generates the HomeKit X-HM:// URI for QR code pairing.
// Category 2 = Bridge, Flags 2 = IP transport.
func SetupURI(pin string) string {
	pinStr := strings.ReplaceAll(pin, "-", "")
	pinNum, _ := strconv.ParseUint(pinStr, 10, 32)

	const category = 2 // Bridge
	const flags = 2    // IP

	var payload uint64
	payload |= uint64(category&0xFF) << 31
	payload |= uint64(flags&0xF) << 27
	payload |= pinNum & 0x7FFFFFF

	encoded := strings.ToUpper(strconv.FormatUint(payload, 36))
	for len(encoded) < 9 {
		encoded = "0" + encoded
	}

	return "X-HM://00" + encoded
}
