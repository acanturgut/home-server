package homedns

// Public Server methods that proxy to the internal blocklist. Kept separate
// from server.go so the blocklist subsystem stays self-contained.

// BlocklistStatus returns a UI snapshot of the ad-blocker.
func (s *Server) BlocklistStatus() BlocklistStatus { return s.blocklist.status() }

// BlocklistSetEnabled toggles the entire ad-blocker on/off.
func (s *Server) BlocklistSetEnabled(v bool) error { return s.blocklist.setEnabled(v) }

// BlocklistAddSource registers a new hosts-format URL.
func (s *Server) BlocklistAddSource(name, url string) error {
	return s.blocklist.addSource(name, url)
}

// BlocklistRemoveSource drops a source by URL.
func (s *Server) BlocklistRemoveSource(url string) error {
	return s.blocklist.removeSource(url)
}

// BlocklistToggleSource enables/disables one source.
func (s *Server) BlocklistToggleSource(url string, enabled bool) error {
	return s.blocklist.toggleSource(url, enabled)
}

// BlocklistRefresh triggers an asynchronous refresh of all sources.
func (s *Server) BlocklistRefresh() {
	go s.blocklist.refresh(context{cancel: s.stop})
}

// BlocklistAddAllow adds a domain (and its subdomains) to the allowlist.
func (s *Server) BlocklistAddAllow(domain string) error {
	return s.blocklist.addAllow(domain)
}

// BlocklistRemoveAllow drops a domain from the allowlist.
func (s *Server) BlocklistRemoveAllow(domain string) error {
	return s.blocklist.removeAllow(domain)
}
