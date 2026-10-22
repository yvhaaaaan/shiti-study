package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func (a *app) requestAI(ctx context.Context, body map[string]any) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, "POST", a.endpoint, strings.NewReader(mustJSON(body)))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	if a.provider == "deepseek" {
		request.Header.Set("Authorization", "Bearer "+a.apiKey)
	} else {
		request.Header.Set("api-key", a.apiKey)
	}
	return a.client.Do(request)
}

// Only validated final results are committed. Deltas let H5 show the stem while
// the explanation is still arriving, and remain provisional until done.
func (a *app) streamAI(w http.ResponseWriter, response *http.Response) error {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	send := func(event string, data any) error {
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, mustJSON(data)); err != nil {
			return err
		}
		return http.NewResponseController(w).Flush()
	}
	reject := func(err error) {
		var item *apiError
		if !errors.As(err, &item) {
			item = &apiError{502, "INVALID_AI_RESPONSE", "智能整理中断或未返回完整解答，原题仍保留，请重试。"}
		}
		_ = send("error", map[string]any{"error": map[string]string{"code": item.Code, "message": item.Message}})
	}
	if err := send("open", map[string]bool{"ok": true}); err != nil {
		return nil
	}
	scanner := bufio.NewScanner(io.LimitReader(response.Body, 2*1024*1024+1))
	scanner.Buffer(make([]byte, 4096), 512*1024)
	var content strings.Builder
	var data []string
	finishReason := ""
	finished := false
	consume := func() error {
		if len(data) == 0 {
			return nil
		}
		value := strings.Join(data, "\n")
		data = nil
		if value == "[DONE]" {
			finished = true
			return nil
		}
		var chunk struct {
			Error   json.RawMessage `json:"error"`
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(value), &chunk); err != nil {
			return err
		}
		if len(chunk.Error) > 0 && string(chunk.Error) != "null" {
			return errors.New("upstream stream error")
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				if content.Len()+len(choice.Delta.Content) > 256*1024 {
					return errors.New("AI output too large")
				}
				content.WriteString(choice.Delta.Content)
				if err := send("delta", map[string]string{"text": choice.Delta.Content}); err != nil {
					return err
				}
			}
			if choice.FinishReason != "" {
				finishReason = choice.FinishReason
			}
		}
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if err := consume(); err != nil {
				reject(err)
				return nil
			}
			if finished {
				break
			}
		} else if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if err := scanner.Err(); err != nil {
		reject(err)
		return nil
	}
	if err := consume(); err != nil || !finished || finishReason != "stop" {
		reject(errors.New("incomplete AI stream"))
		return nil
	}
	clean, err := validateAIContent(content.String())
	if err != nil {
		reject(err)
		return nil
	}
	_ = send("done", clean)
	return nil
}
