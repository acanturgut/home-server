package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Model       string    `json:"model,omitempty"`
	Stream      bool      `json:"stream"`
	Temperature *float64  `json:"temperature,omitempty"`
}

type ChatResponse struct {
	Model             string  `json:"model"`
	Message           Message `json:"message"`
	Node              string  `json:"node"`
	Tier              string  `json:"tier"`
	Route             string  `json:"route"`
	Reason            string  `json:"reason"`
	ClassifierOutput  string  `json:"classifier_output"`
	ClassifierLatency string  `json:"classifier_latency"`
	Latency           string  `json:"latency"`
	PromptTokens      int     `json:"prompt_tokens,omitempty"`
	CompletionTokens  int     `json:"completion_tokens,omitempty"`
	TotalTokens       int     `json:"total_tokens,omitempty"`
}

type OllamaResponse struct {
	Model   string  `json:"model"`
	Message Message `json:"message"`
}

type LMStudioResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Model string `json:"model"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

type StreamEvent struct {
	Step              string `json:"step"` // classifying, classified, generating, done, error
	Message           string `json:"message,omitempty"`
	Content           string `json:"content,omitempty"`
	Model             string `json:"model,omitempty"`
	Node              string `json:"node,omitempty"`
	Tier              string `json:"tier,omitempty"`
	Route             string `json:"route,omitempty"`
	Reason            string `json:"reason,omitempty"`
	ClassifierOutput  string `json:"classifier_output,omitempty"`
	ClassifierLatency string `json:"classifier_latency,omitempty"`
	Latency           string `json:"latency,omitempty"`
	PromptTokens      int    `json:"prompt_tokens,omitempty"`
	CompletionTokens  int    `json:"completion_tokens,omitempty"`
	TotalTokens       int    `json:"total_tokens,omitempty"`
}

type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{
		http: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (c *Client) CallOllama(ctx context.Context, host string, req ChatRequest) (*OllamaResponse, error) {
	req.Stream = false
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", host+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama error %d: %s", resp.StatusCode, string(b))
	}

	var result OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) CallLMStudio(ctx context.Context, host string, req ChatRequest) (*LMStudioResponse, error) {
	payload := map[string]any{
		"messages": req.Messages,
		"stream":   false,
	}
	if req.Model != "" {
		payload["model"] = req.Model
	}
	if req.Temperature != nil {
		payload["temperature"] = *req.Temperature
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", host+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("lm-studio request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("lm-studio error %d: %s", resp.StatusCode, string(b))
	}

	var result LMStudioResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Ping(ctx context.Context, host, kind string) bool {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	url := host
	if kind == "ollama" {
		url += "/api/tags"
	} else {
		url += "/v1/models"
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// ListModels fetches available models from an LM Studio instance.
func (c *Client) ListModels(ctx context.Context, host string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", host+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to list models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("models endpoint returned %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var models []string
	for _, m := range result.Data {
		models = append(models, m.ID)
	}
	return models, nil
}

// LoadModel loads a model in LM Studio. LM Studio's public REST API does
// not expose an explicit load endpoint — instead, with JIT loading enabled
// (the default) any request that names a model causes the server to load it.
// We trigger a minimal chat-completion request and treat success (or any
// 2xx/4xx response that isn't "model not found") as a load. A short,
// generous timeout covers cold-load latency on large models.
func (c *Client) LoadModel(ctx context.Context, host, model string) error {
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	payload, _ := json.Marshal(map[string]any{
		"model":      model,
		"messages":   []map[string]string{{"role": "user", "content": "."}},
		"max_tokens": 1,
		"stream":     false,
	})

	// Try the LM Studio v0 path first (richer error reporting), then OpenAI-compat.
	var lastErr error
	for _, path := range []string{"/api/v0/chat/completions", "/v1/chat/completions"} {
		req, err := http.NewRequestWithContext(ctx, "POST", host+path, bytes.NewReader(payload))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		// Surface the host's own error message — usually "model not found"
		// or "JIT loading is disabled".
		lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if lastErr != nil {
		return fmt.Errorf("failed to load model %s on %s: %w", model, host, lastErr)
	}
	return fmt.Errorf("failed to load model %s on %s", model, host)
}

// UnloadModel ejects a model from LM Studio using the /v1/models/unload endpoint.
func (c *Client) UnloadModel(ctx context.Context, host, model string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	payload, _ := json.Marshal(map[string]string{"model": model})

	for _, path := range []string{"/lmstudio/v1/models/unload", "/v1/models/unload"} {
		req, err := http.NewRequestWithContext(ctx, "POST", host+path, bytes.NewReader(payload))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.http.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
			return nil
		}
	}
	return fmt.Errorf("failed to unload model %s on %s", model, host)
}

// ModelStatus describes a model's load state on an LM Studio host.
type ModelStatus struct {
	ID     string `json:"id"`
	State  string `json:"state"` // "loaded" or "not-loaded"
	Type   string `json:"type,omitempty"`
	Loaded bool   `json:"loaded"`
}

// ListAllModels returns every model on the LM Studio host along with whether
// it is currently loaded. Uses LM Studio's REST API at /api/v0/models which
// includes a `state` field. Falls back to the OpenAI-compatible /v1/models
// endpoint (which only lists loaded models) if /api/v0/models is unavailable.
func (c *Client) ListAllModels(ctx context.Context, host string) ([]ModelStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", host+"/api/v0/models", nil)
	if err == nil {
		resp, err := c.http.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var result struct {
					Data []struct {
						ID    string `json:"id"`
						State string `json:"state"`
						Type  string `json:"type"`
					} `json:"data"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
					out := make([]ModelStatus, 0, len(result.Data))
					for _, m := range result.Data {
						out = append(out, ModelStatus{
							ID:     m.ID,
							State:  m.State,
							Type:   m.Type,
							Loaded: m.State == "loaded",
						})
					}
					return out, nil
				}
			}
		}
	}

	// Fallback: /v1/models only lists loaded models.
	loaded, err := c.ListModels(ctx, host)
	if err != nil {
		return nil, err
	}
	out := make([]ModelStatus, 0, len(loaded))
	for _, id := range loaded {
		out = append(out, ModelStatus{ID: id, State: "loaded", Loaded: true})
	}
	return out, nil
}
