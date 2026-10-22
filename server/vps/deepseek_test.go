package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func deepseekTestApp(t *testing.T) *app {
	t.Helper()
	a := testApp(t)
	a.provider = "deepseek"
	a.endpoint = "https://api.deepseek.com/chat/completions"
	a.model = "deepseek-flash"
	a.apiKey = "unit-test-deepseek-secret"
	return a
}

func deepseekTestResult() map[string]any {
	return map[string]any{
		"title": "解方程", "subject": "数学", "stem": "2x+3=11，求x",
		"answer": "x=4", "analysis": "两边减3得2x=8，再除以2得x=4。",
		"tags": []string{"一元一次方程"}, "difficulty": "基础",
	}
}

func deepseekTestInput() map[string]any {
	return map[string]any{"stem": "2x+3=11，求x", "images": []string{}, "tags": []string{}}
}

func deepseekJSONResponse(output map[string]any) *http.Response {
	body := mustJSON(map[string]any{"choices": []any{map[string]any{
		"finish_reason": "stop", "message": map[string]any{"content": mustJSON(output)},
	}}})
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"application/json"}}}
}

func deepseekCall(t *testing.T, a *app, cookie *http.Cookie, accept, origin string, input map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "http://study.test/api/question-generate", bytes.NewBufferString(mustJSON(input)))
	r.Header.Set("Content-Type", "application/json")
	if accept != "" {
		r.Header.Set("Accept", accept)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}

func deepseekStream(chunks []string, finishReason string, terminated bool) *http.Response {
	var body strings.Builder
	for _, chunk := range chunks {
		body.WriteString("data: " + mustJSON(map[string]any{"choices": []any{map[string]any{
			"delta": map[string]any{"content": chunk},
		}}}) + "\r\n\r\n")
	}
	if finishReason != "" {
		body.WriteString("data: " + mustJSON(map[string]any{"choices": []any{map[string]any{
			"delta": map[string]any{}, "finish_reason": finishReason,
		}}}) + "\r\n\r\n")
	}
	if terminated {
		body.WriteString("data: [DONE]\r\n\r\n")
	}
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body.String())), Header: http.Header{"Content-Type": {"text/event-stream; charset=utf-8"}}}
}

type deepseekEvent struct {
	name string
	data map[string]any
}

func deepseekReadEvents(t *testing.T, w *httptest.ResponseRecorder) []deepseekEvent {
	t.Helper()
	if !strings.HasPrefix(w.Header().Get("Content-Type"), "text/event-stream") {
		t.Fatalf("expected SSE response, got status %d and content type %q", w.Code, w.Header().Get("Content-Type"))
	}
	var events []deepseekEvent
	for _, block := range strings.Split(strings.ReplaceAll(w.Body.String(), "\r\n", "\n"), "\n\n") {
		if strings.TrimSpace(block) == "" {
			continue
		}
		var name string
		var data []string
		for _, line := range strings.Split(block, "\n") {
			if strings.HasPrefix(line, "event:") {
				name = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			} else if strings.HasPrefix(line, "data:") {
				data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
			}
		}
		if name == "" || len(data) == 0 {
			t.Fatalf("invalid SSE frame or ordinary JSON appended to stream: %q", block)
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(strings.Join(data, "\n")), &payload); err != nil {
			t.Fatalf("invalid JSON in SSE %s: %v", name, err)
		}
		events = append(events, deepseekEvent{name, payload})
	}
	return events
}

func TestDeepSeekProviderConfiguration(t *testing.T) {
	t.Setenv("SHITI_AI_PROVIDER", "deepseek")
	t.Setenv("DEEPSEEK_API_KEY", "configuration-test-key")
	t.Setenv("DEEPSEEK_MODEL", "")
	t.Setenv("MIMO_API_KEY", "unused-mimo-test-key")
	a := testApp(t)
	if a.provider != "deepseek" || a.endpoint != "https://api.deepseek.com/chat/completions" || a.model != "deepseek-flash" || a.apiKey != "configuration-test-key" {
		t.Fatal("explicit DeepSeek configuration was not selected correctly")
	}
}

func TestDeepSeekRequestAndJSONCompatibility(t *testing.T) {
	for _, accept := range []string{"application/json", "text/event-stream"} {
		t.Run(accept, func(t *testing.T) {
			a := deepseekTestApp(t)
			owner := signIn(t, a, "deepseek-json")
			calls := 0
			image := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII="
			a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.URL.String() != a.endpoint || r.Method != "POST" || r.Header.Get("Authorization") != "Bearer "+a.apiKey || r.Header.Get("api-key") != "" {
					t.Fatal("incorrect DeepSeek endpoint or authentication")
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["model"] != "deepseek-flash" || body["max_tokens"] != float64(6144) || body["max_completion_tokens"] != nil || body["stream"] != (accept == "text/event-stream") {
					t.Fatal("incorrect DeepSeek model, token limit, or streaming mode")
				}
				messages, ok := body["messages"].([]any)
				if !ok || len(messages) != 2 || !strings.Contains(mustJSON(messages[1]), image) {
					t.Fatal("question image was not included in the model request")
				}
				return deepseekJSONResponse(deepseekTestResult()), nil
			})}
			input := deepseekTestInput()
			input["images"] = []string{image}
			w := deepseekCall(t, a, owner, accept, "http://study.test", input)
			if w.Code != 200 || calls != 1 {
				t.Fatalf("JSON compatibility failed: status %d, calls %d", w.Code, calls)
			}
			if !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
				t.Fatal("a non-streaming upstream response should retain JSON compatibility")
			}
			var output map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &output); err != nil || output["answer"] != "x=4" || output["stem"] != deepseekTestResult()["stem"] {
				t.Fatal("unexpected JSON generation response")
			}
		})
	}
}

func TestDeepSeekSSESuccess(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "deepseek-stream")
	content := mustJSON(deepseekTestResult())
	cut := strings.Index(content, `"stem"`) + len(`"stem":`)
	chunks := []string{content[:cut], content[cut : cut+1], content[cut+1:]}
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["stream"] != true {
			t.Fatal("streaming request was not forwarded upstream")
		}
		return deepseekStream(chunks, "stop", true), nil
	})}
	w := deepseekCall(t, a, owner, "text/event-stream", "http://study.test", deepseekTestInput())
	events := deepseekReadEvents(t, w)
	if !w.Flushed || w.Header().Get("X-Accel-Buffering") != "no" || w.Code != 200 {
		t.Fatal("SSE response was not flushed or buffering was not disabled")
	}
	if len(events) < 3 || events[0].name != "open" || events[0].data["ok"] != true || events[len(events)-1].name != "done" {
		t.Fatal("missing SSE open/delta/done sequence")
	}
	var combined strings.Builder
	for _, event := range events[1 : len(events)-1] {
		if event.name != "delta" {
			t.Fatalf("unexpected event %q in successful stream", event.name)
		}
		text, ok := event.data["text"].(string)
		if !ok {
			t.Fatal("delta.text must be a string")
		}
		combined.WriteString(text)
	}
	if combined.String() != content || events[len(events)-1].data["answer"] != "x=4" || events[len(events)-1].data["stem"] != deepseekTestResult()["stem"] {
		t.Fatal("incremental content or unwrapped done payload was incorrect")
	}
}

func TestDeepSeekSSERejectsIncompleteAndInvalidResults(t *testing.T) {
	for _, name := range []string{"missing-done", "missing-stop", "length", "truncated-json", "invalid-field", "contradiction"} {
		t.Run(name, func(t *testing.T) {
			a := deepseekTestApp(t)
			owner := signIn(t, a, "deepseek-invalid")
			output := deepseekTestResult()
			if name == "invalid-field" {
				output["difficulty"] = "未知"
			}
			if name == "contradiction" {
				output["answer"] = "C"
				output["analysis"] = "计算得-1。\n【最终答案】B\n【检查】选项B对应-1。"
			}
			content, reason, terminated := mustJSON(output), "stop", true
			switch name {
			case "missing-done":
				terminated = false
			case "missing-stop":
				reason = ""
			case "length":
				reason = "length"
			case "truncated-json":
				content = content[:len(content)-1]
			}
			a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				return deepseekStream([]string{content}, reason, terminated), nil
			})}
			w := deepseekCall(t, a, owner, "text/event-stream", "http://study.test", deepseekTestInput())
			events := deepseekReadEvents(t, w)
			if len(events) < 2 || events[len(events)-1].name != "error" {
				t.Fatal("invalid generation did not terminate with an error event")
			}
			for _, event := range events {
				if event.name == "done" {
					t.Fatal("invalid generation emitted a successful result")
				}
			}
			errorValue, ok := events[len(events)-1].data["error"].(map[string]any)
			if !ok || errorValue["code"] == "" || errorValue["message"] == "" {
				t.Fatal("error event must provide a safe code and message")
			}
		})
	}
}

func TestDeepSeekStreamRejectionFallsBackOnlyOnce(t *testing.T) {
	for _, status := range []int{400, 415, 422, 429} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			a := deepseekTestApp(t)
			owner := signIn(t, a, "deepseek-fallback")
			calls := 0
			a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["stream"] != (calls == 1) {
					t.Fatal("fallback did not disable upstream streaming")
				}
				if calls == 1 {
					return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"test rejection"}}`)), Header: http.Header{"Content-Type": {"application/json"}}}, nil
				}
				if calls > 2 {
					t.Fatal("streaming fallback retried more than once")
				}
				return deepseekJSONResponse(deepseekTestResult()), nil
			})}
			w := deepseekCall(t, a, owner, "text/event-stream", "http://study.test", deepseekTestInput())
			if status == 429 {
				if calls != 1 || !strings.Contains(w.Body.String(), "AI_RATE_LIMITED") || strings.Contains(w.Body.String(), "event: done") {
					t.Fatal("rate limited requests must fail without retry or successful completion")
				}
			} else if calls != 2 || w.Code != 200 || !strings.Contains(w.Body.String(), "x=4") {
				t.Fatalf("stream rejection fallback failed: status %d, calls %d", w.Code, calls)
			}
			var usage int
			if err := a.db.QueryRow("SELECT COALESCE(SUM(count),0) FROM ai_usage").Scan(&usage); err != nil || usage != 1 {
				t.Fatal("one user request must consume one quota unit, including fallback")
			}
		})
	}
}

func TestDeepSeekAuthenticationPrecedesStreaming(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "deepseek-auth")
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		return deepseekJSONResponse(deepseekTestResult()), nil
	})}
	for _, row := range []struct {
		name   string
		cookie *http.Cookie
		origin string
		status int
	}{
		{"unauthenticated", nil, "http://study.test", 401},
		{"foreign-origin", owner, "https://evil.test", 403},
	} {
		t.Run(row.name, func(t *testing.T) {
			w := deepseekCall(t, a, row.cookie, "text/event-stream", row.origin, deepseekTestInput())
			if w.Code != row.status || calls != 0 || strings.HasPrefix(w.Header().Get("Content-Type"), "text/event-stream") {
				t.Fatal("authentication and origin checks must reject requests before opening SSE or calling the model")
			}
		})
	}
}
