package bambu

import (
	"context"
	"sync"
)

// Manager owns one mqttClient + cameraProxy per configured printer and
// reconciles them with the persisted Store. It's safe to call any of the
// public methods from HTTP handlers concurrently.
type Manager struct {
	store *Store
	ctx   context.Context

	mu     sync.RWMutex
	boxes  map[string]*statusBox
	mqtts  map[string]*mqttClient
	cams   map[string]*cameraProxy
}

func NewManager(store *Store) *Manager {
	return &Manager{
		store: store,
		boxes: map[string]*statusBox{},
		mqtts: map[string]*mqttClient{},
		cams:  map[string]*cameraProxy{},
	}
}

// Run brings up MQTT clients for every printer in the store. The camera
// proxies are created lazily on first /camera request, but they're
// pre-allocated so the handler can find them by ID.
func (m *Manager) Run(ctx context.Context) {
	m.ctx = ctx
	for _, p := range m.store.List() {
		m.spawnLocked(p)
	}
}

// Add registers + starts a new printer.
func (m *Manager) Add(p Printer) (Printer, error) {
	saved, err := m.store.Add(p)
	if err != nil {
		return Printer{}, err
	}
	m.mu.Lock()
	m.spawnLocked(saved)
	m.mu.Unlock()
	return saved, nil
}

// Update edits an existing printer. We tear down + restart the MQTT and
// camera connections to pick up new credentials/host.
func (m *Manager) Update(id string, in Printer) (Printer, error) {
	updated, err := m.store.Update(id, in)
	if err != nil {
		return Printer{}, err
	}
	m.mu.Lock()
	m.tearDownLocked(id)
	m.spawnLocked(updated)
	m.mu.Unlock()
	return updated, nil
}

// Delete removes the printer and stops its connections.
func (m *Manager) Delete(id string) error {
	if err := m.store.Delete(id); err != nil {
		return err
	}
	m.mu.Lock()
	m.tearDownLocked(id)
	m.mu.Unlock()
	return nil
}

func (m *Manager) List() []Printer { return m.store.List() }

func (m *Manager) Get(id string) (Printer, bool) { return m.store.Get(id) }

// Status returns the latest distilled status for one printer.
func (m *Manager) Status(id string) (Status, bool) {
	m.mu.RLock()
	box, ok := m.boxes[id]
	m.mu.RUnlock()
	if !ok {
		return Status{}, false
	}
	return box.get(), true
}

// Camera returns the cameraProxy for a printer, creating it on demand.
func (m *Manager) Camera(id string) (*cameraProxy, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.cams[id]; ok {
		return c, true
	}
	p, ok := m.store.Get(id)
	if !ok {
		return nil, false
	}
	c := newCameraProxy(p)
	m.cams[id] = c
	return c, true
}

// spawnLocked sets up the in-memory state for a printer. Must be called
// with m.mu held (or before Run finishes its initial pass).
func (m *Manager) spawnLocked(p Printer) {
	box := &statusBox{}
	m.boxes[p.ID] = box
	cli := newMQTTClient(p, box)
	if m.ctx != nil {
		cli.Start(m.ctx)
	}
	m.mqtts[p.ID] = cli
	m.cams[p.ID] = newCameraProxy(p)
}

func (m *Manager) tearDownLocked(id string) {
	if cli := m.mqtts[id]; cli != nil {
		cli.Stop()
	}
	if cam := m.cams[id]; cam != nil {
		cam.Stop()
	}
	delete(m.mqtts, id)
	delete(m.cams, id)
	delete(m.boxes, id)
}
