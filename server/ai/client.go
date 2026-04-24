package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	req.Stream = false
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

// LoadModel loads a model in LM Studio using the /v1/models/load endpoint.
// Falls back to /lmstudio/v1/models/load if the first fails.
func (c *Client) LoadModel(ctx context.Context, host, model string) error {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	payload, _ := json.Marshal(map[string]string{"model": model})

	// Try the lmstudio-specific endpoint first
	for _, path := range []string{"/lmstudio/v1/models/load", "/v1/models/load"} {
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
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			return nil
		}
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

// GetModelInfo fetches details about loaded models from LM Studio.
func (c *Client) GetModelInfo(ctx context.Context, host string) ([]ModelInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", host+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get model info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("model info endpoint returned %d", resp.StatusCode)
	}

	var result struct {
		Data []ModelInfo `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

// ModelInfo describes a loaded model in LM Studio.
type ModelInfo struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	OwnedBy string `json:"owned_by"`
}

// ── Claude (Anthropic) ──────────────────────────────────

type ClaudeRequest struct {
	Model     string    `json:"model"`
	MaxTokens int       `json:"max_tokens"`
	System    string    `json:"system,omitempty"`
	Messages  []Message `json:"messages"`
}

type ClaudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Model string `json:"model"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// CallClaude calls the Anthropic Messages API.
// apiKey should come from the ANTHROPIC_API_KEY env var.
func (c *Client) CallClaude(ctx context.Context, apiKey string, req ClaudeRequest) (*ClaudeResponse, error) {
	if req.MaxTokens == 0 {
		req.MaxTokens = 8192
	}
	if req.Model == "" {
		req.Model = "claude-sonnet-4-20250514"
	}

	// Convert to Anthropic format: system goes in top-level, messages only user/assistant
	payload := map[string]any{
		"model":      req.Model,
		"max_tokens": req.MaxTokens,
		"messages":   req.Messages,
	}
	if req.System != "" {
		payload["system"] = req.System
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("claude error %d: %s", resp.StatusCode, string(b))
	}

	var result ClaudeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ClaudeText is a convenience to extract the text from a ClaudeResponse.
func (r *ClaudeResponse) Text() string {
	for _, c := range r.Content {
		if c.Type == "text" {
			return c.Text
		}
	}
	return ""
}
