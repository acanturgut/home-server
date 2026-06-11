package api

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

// Dashboard overview = location, public IP, weather, host LAN IP. Cached for
// 10 min so we don't hammer external APIs on every dashboard tick.
type overviewCache struct {
	mu       sync.RWMutex
	cached   time.Time
	overview map[string]any
}

var ovr = &overviewCache{}

const overviewTTL = 10 * time.Minute

// GET /api/dashboard/overview
func (h *Handler) DashboardOverview(w http.ResponseWriter, r *http.Request) {
	ovr.mu.RLock()
	fresh := !ovr.cached.IsZero() && time.Since(ovr.cached) < overviewTTL
	cached := ovr.overview
	ovr.mu.RUnlock()
	if fresh && cached != nil {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	out := buildOverview(r.Context())
	ovr.mu.Lock()
	ovr.overview = out
	ovr.cached = time.Now()
	ovr.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func buildOverview(ctx context.Context) map[string]any {
	hn, _ := os.Hostname()
	out := map[string]any{
		"hostname":  hn,
		"local_ip":  localIP(),
		"public_ip": "",
		"location":  nil,
		"weather":   nil,
		"updated":   time.Now().Format(time.RFC3339),
	}

	pubIP, geo := publicIPAndGeo(ctx)
	if pubIP != "" {
		out["public_ip"] = pubIP
	}
	if geo != nil {
		out["location"] = geo
		if lat, ok := geo["lat"].(float64); ok {
			if lon, ok2 := geo["lon"].(float64); ok2 {
				if w := fetchWeather(ctx, lat, lon); w != nil {
					out["weather"] = w
				}
			}
		}
	}
	return out
}

func localIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return a.IP.String()
	}
	return ""
}

// publicIPAndGeo fetches the host's public IP and approximate location
// using ip-api.com (free, no key, 45 req/min) — returns both in one call.
func publicIPAndGeo(ctx context.Context) (string, map[string]any) {
	cctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet,
		"http://ip-api.com/json/?fields=status,query,country,regionName,city,lat,lon,timezone,isp", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var data struct {
		Status     string  `json:"status"`
		Query      string  `json:"query"`
		Country    string  `json:"country"`
		RegionName string  `json:"regionName"`
		City       string  `json:"city"`
		Lat        float64 `json:"lat"`
		Lon        float64 `json:"lon"`
		Timezone   string  `json:"timezone"`
		ISP        string  `json:"isp"`
	}
	if err := json.Unmarshal(body, &data); err != nil || data.Status != "success" {
		return "", nil
	}
	return data.Query, map[string]any{
		"city":     data.City,
		"region":   data.RegionName,
		"country":  data.Country,
		"lat":      data.Lat,
		"lon":      data.Lon,
		"timezone": data.Timezone,
		"isp":      data.ISP,
	}
}

// fetchWeather queries open-meteo (free, no key) for the current weather at
// the given coordinates.
func fetchWeather(ctx context.Context, lat, lon float64) map[string]any {
	cctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	url := "https://api.open-meteo.com/v1/forecast?current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&forecast_days=1&timezone=auto" +
		"&latitude=" + strconv.FormatFloat(lat, 'f', 4, 64) +
		"&longitude=" + strconv.FormatFloat(lon, 'f', 4, 64)
	req, _ := http.NewRequestWithContext(cctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var data struct {
		Current struct {
			Temp        float64 `json:"temperature_2m"`
			Humidity    float64 `json:"relative_humidity_2m"`
			Feels       float64 `json:"apparent_temperature"`
			IsDay       int     `json:"is_day"`
			WeatherCode int     `json:"weather_code"`
			Wind        float64 `json:"wind_speed_10m"`
		} `json:"current"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil
	}
	return map[string]any{
		"temp":        data.Current.Temp,
		"feels_like":  data.Current.Feels,
		"humidity":    data.Current.Humidity,
		"wind":        data.Current.Wind,
		"is_day":      data.Current.IsDay == 1,
		"code":        data.Current.WeatherCode,
		"description": weatherCodeLabel(data.Current.WeatherCode),
	}
}

// GET /api/dashboard/cluster — aggregated GPU / RAM / temp from cluster nodes
// (used by the bottom status bar).
func (h *Handler) DashboardCluster(w http.ResponseWriter, r *http.Request) {
	stats := h.ns.All()
	online := 0
	cpuSum := 0.0
	cpuTempSum := 0.0
	cpuTempCount := 0
	gpuSum := 0
	gpuCount := 0
	gpuTempSum := 0
	gpuTempCount := 0
	memUsedGB := 0.0
	memTotalGB := 0.0
	vramUsedMB := 0
	vramTotalMB := 0
	now := time.Now()
	for _, s := range stats {
		if now.Sub(s.LastSeen) > 60*time.Second {
			continue
		}
		online++
		cpuSum += s.CPUUsage
		if s.CPUTemp > 0 {
			cpuTempSum += float64(s.CPUTemp)
			cpuTempCount++
		}
		memUsedGB += s.MemUsedGB
		memTotalGB += s.MemTotalGB
		if s.GPUUsage > 0 || s.GPUMemTotal > 0 {
			gpuCount++
			gpuSum += s.GPUUsage
			vramUsedMB += s.GPUMemUsed
			vramTotalMB += s.GPUMemTotal
			if s.GPUTemp > 0 {
				gpuTempSum += s.GPUTemp
				gpuTempCount++
			}
		}
	}
	avg := func(sum float64, n int) float64 {
		if n == 0 {
			return 0
		}
		return sum / float64(n)
	}
	avgI := func(sum, n int) float64 {
		if n == 0 {
			return 0
		}
		return float64(sum) / float64(n)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"nodes_online":  online,
		"nodes_total":   len(stats),
		"cpu_avg":       avg(cpuSum, online),
		"cpu_temp_avg":  avg(cpuTempSum, cpuTempCount),
		"mem_used_gb":   memUsedGB,
		"mem_total_gb":  memTotalGB,
		"gpu_count":     gpuCount,
		"gpu_avg":       avgI(gpuSum, gpuCount),
		"gpu_temp_avg":  avgI(gpuTempSum, gpuTempCount),
		"vram_used_mb":  vramUsedMB,
		"vram_total_mb": vramTotalMB,
	})
}

// weatherCodeLabel maps WMO weather codes (open-meteo) to short labels.
func weatherCodeLabel(code int) string {
	switch code {
	case 0:
		return "Clear"
	case 1:
		return "Mostly clear"
	case 2:
		return "Partly cloudy"
	case 3:
		return "Overcast"
	case 45, 48:
		return "Fog"
	case 51, 53, 55:
		return "Drizzle"
	case 56, 57:
		return "Freezing drizzle"
	case 61, 63, 65:
		return "Rain"
	case 66, 67:
		return "Freezing rain"
	case 71, 73, 75:
		return "Snow"
	case 77:
		return "Snow grains"
	case 80, 81, 82:
		return "Rain showers"
	case 85, 86:
		return "Snow showers"
	case 95:
		return "Thunderstorm"
	case 96, 99:
		return "Thunder + hail"
	default:
		return "Unknown"
	}
}
