package api

import (
	"encoding/json"
	"io"
	"net/http"
	"path"

	"github.com/acanturgut/home-server/bambu"
)

// SetBambu wires the bambu manager. Without it the printer endpoints
// return 503 / empty list.
func (h *Handler) SetBambu(m *bambu.Manager) { h.bambu = m }

// GET /api/bambu/printers
func (h *Handler) ListBambuPrinters(w http.ResponseWriter, _ *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusOK, []bambu.Printer{})
		return
	}
	writeJSON(w, http.StatusOK, h.bambu.List())
}

// POST /api/bambu/printers
func (h *Handler) AddBambuPrinter(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	var in bambu.Printer
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	saved, err := h.bambu.Add(in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

// PUT /api/bambu/printers/{id}
func (h *Handler) UpdateBambuPrinter(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	id := r.PathValue("id")
	var in bambu.Printer
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	saved, err := h.bambu.Update(id, in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// DELETE /api/bambu/printers/{id}
func (h *Handler) DeleteBambuPrinter(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	id := r.PathValue("id")
	if err := h.bambu.Delete(id); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/bambu/printers/{id}/status
func (h *Handler) BambuPrinterStatus(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	id := r.PathValue("id")
	st, ok := h.bambu.Status(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "printer not found"})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// GET /api/bambu/printers/{id}/camera — multipart MJPEG stream.
func (h *Handler) BambuPrinterCamera(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		http.Error(w, "bambu disabled", http.StatusServiceUnavailable)
		return
	}
	id := r.PathValue("id")
	cam, ok := h.bambu.Camera(id)
	if !ok {
		http.Error(w, "printer not found", http.StatusNotFound)
		return
	}
	cam.ServeMJPEG(w, r)
}

// GET /api/bambu/printers/{id}/snapshot — single JPEG still.
func (h *Handler) BambuPrinterSnapshot(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		http.Error(w, "bambu disabled", http.StatusServiceUnavailable)
		return
	}
	id := r.PathValue("id")
	cam, ok := h.bambu.Camera(id)
	if !ok {
		http.Error(w, "printer not found", http.StatusNotFound)
		return
	}
	cam.ServeSnapshot(w, r)
}

// POST /api/bambu/printers/{id}/command
// Body: {"action": "pause|resume|stop|light|speed|nozzle_temp|bed_temp|fan|aux_fan|chamber_fan|home|unload_filament", "args": {...}}
func (h *Handler) BambuCommand(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	var in struct {
		Action string         `json:"action"`
		Args   map[string]any `json:"args"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.bambu.Command(r.PathValue("id"), in.Action, in.Args); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/bambu/printers/{id}/files — list /cache, /timelapse, /model.
func (h *Handler) BambuListFiles(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	files, err := h.bambu.ListFiles(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, files)
}

// POST /api/bambu/printers/{id}/upload — multipart form, field "file".
// Returns {"path": "/cache/foo.3mf"}.
func (h *Handler) BambuUpload(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	// 256MB cap; A1's storage is small and 3MFs are normally < 50MB.
	r.Body = http.MaxBytesReader(w, r.Body, 256<<20)
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid multipart: " + err.Error()})
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "file field required"})
		return
	}
	defer file.Close()
	name := path.Base(hdr.Filename)
	if name == "" || name == "." {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid filename"})
		return
	}
	dest, err := h.bambu.UploadFile(r.PathValue("id"), name, file)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"path": dest, "name": name})
}

// POST /api/bambu/printers/{id}/print — start a print of an already-uploaded file.
func (h *Handler) BambuPrint(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	var in bambu.PrintRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.bambu.PrintProjectFile(r.PathValue("id"), in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/bambu/printers/{id}/files/download?path=/timelapse/foo.mp4
func (h *Handler) BambuDownload(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		http.Error(w, "bambu disabled", http.StatusServiceUnavailable)
		return
	}
	p := r.URL.Query().Get("path")
	if p == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	rc, err := h.bambu.DownloadFile(r.PathValue("id"), p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Disposition", `attachment; filename="`+path.Base(p)+`"`)
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(w, rc)
}

// DELETE /api/bambu/printers/{id}/files?path=/cache/foo.3mf
func (h *Handler) BambuDeleteFile(w http.ResponseWriter, r *http.Request) {
	if h.bambu == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "bambu disabled"})
		return
	}
	p := r.URL.Query().Get("path")
	if p == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "path required"})
		return
	}
	if err := h.bambu.DeleteFile(r.PathValue("id"), p); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
