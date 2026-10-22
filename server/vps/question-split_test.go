package main

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const splitTestImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII="

func splitTestResult() map[string]any {
	return map[string]any{"questions": []any{
		map[string]any{"title": " 1. 解方程 ", "stem": " 1. 解方程：2x+3=11。 ", "subject": "数学", "analysis": "不应返回的解析"},
		map[string]any{"title": "2. 求面积", "stem": "2. 长方形长4厘米、宽3厘米，求面积。"},
	}}
}

func splitTestRawResponse(content, finishReason string) *http.Response {
	body := mustJSON(map[string]any{"choices": []any{map[string]any{
		"finish_reason": finishReason, "message": map[string]any{"content": content},
	}}})
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"application/json"}}}
}

func TestQuestionSplitAuthenticationAndOrigin(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "split-auth")
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		return deepseekJSONResponse(splitTestResult()), nil
	})}
	for _, row := range []struct {
		name   string
		cookie *http.Cookie
		origin string
		status int
	}{
		{"unauthenticated", nil, "http://study.test", http.StatusUnauthorized},
		{"foreign-origin", owner, "https://evil.test", http.StatusForbidden},
	} {
		t.Run(row.name, func(t *testing.T) {
			w := call(t, a, "POST", "/api/question-split", map[string]string{"image": splitTestImage}, row.cookie, row.origin)
			if w.Code != row.status || calls != 0 || len(a.aiSlots) != 0 {
				t.Fatalf("access must be rejected before reserving a slot or calling the model: status %d, calls %d", w.Code, calls)
			}
		})
	}
}

func TestQuestionSplitRejectsInvalidImagesBeforeModel(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "split-images")
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		return deepseekJSONResponse(splitTestResult()), nil
	})}
	for _, row := range []struct{ name, image string }{
		{"missing", ""},
		{"remote-url", "https://example.test/exam.png"},
		{"unsupported-mime", "data:image/svg+xml;base64,PHN2Zy8+"},
		{"invalid-base64", "data:image/png;base64,%%%"},
		{"empty-bytes", "data:image/png;base64,"},
		{"non-image-bytes", "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("not a picture"))},
		{"mime-mismatch", strings.Replace(splitTestImage, "image/png", "image/jpeg", 1)},
		{"oversized-image", "data:image/png;base64," + base64.StdEncoding.EncodeToString(make([]byte, mediaLimit+1))},
	} {
		t.Run(row.name, func(t *testing.T) {
			w := call(t, a, "POST", "/api/question-split", map[string]string{"image": row.image}, owner, "http://study.test")
			if w.Code < 400 || w.Code >= 500 || calls != 0 || len(a.aiSlots) != 0 {
				t.Fatalf("invalid image must fail without model calls: status %d, calls %d", w.Code, calls)
			}
		})
	}
	var usage int
	if err := a.db.QueryRow("SELECT COALESCE(SUM(count),0) FROM ai_usage").Scan(&usage); err != nil || usage != 0 {
		t.Fatal("invalid images must not consume AI quota", err, usage)
	}
}

func TestQuestionSplitDeepSeekRequestAndExtractedQuestions(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "split-success")
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "POST" || r.URL.String() != a.endpoint || r.Header.Get("Authorization") != "Bearer "+a.apiKey || r.Header.Get("api-key") != "" {
			t.Fatal("split request used an incorrect DeepSeek endpoint or credential header")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["model"] != "deepseek-flash" || body["max_tokens"] != float64(8192) || body["max_completion_tokens"] != nil || body["stream"] != false {
			t.Fatal("split request must use configured model, 8192 max_tokens, and JSON mode without streaming")
		}
		if mustJSON(body["response_format"]) != `{"type":"json_object"}` || mustJSON(body["thinking"]) != `{"type":"disabled"}` {
			t.Fatal("split request must disable thinking and require a JSON object")
		}
		messages, ok := body["messages"].([]any)
		if !ok || len(messages) != 2 {
			t.Fatal("split request must provide system instructions and the user image")
		}
		system, ok := messages[0].(map[string]any)
		if !ok || system["role"] != "system" || !strings.Contains(mustJSON(system["content"]), "不分类") || !strings.Contains(mustJSON(system["content"]), "不生成解析") {
			t.Fatal("split instructions must request extraction without classification or analysis")
		}
		message, ok := messages[1].(map[string]any)
		if !ok || message["role"] != "user" {
			t.Fatal("missing user image message")
		}
		content, ok := message["content"].([]any)
		if !ok || len(content) != 2 {
			t.Fatal("missing multimodal text or image")
		}
		image, ok := content[1].(map[string]any)
		if !ok || image["type"] != "image_url" || mustJSON(image["image_url"]) != mustJSON(map[string]string{"url": splitTestImage}) {
			t.Fatal("the original PNG data URL was not preserved")
		}
		return deepseekJSONResponse(splitTestResult()), nil
	})}
	w := call(t, a, "POST", "/api/question-split", map[string]string{"image": splitTestImage}, owner, "http://study.test")
	if w.Code != http.StatusOK || calls != 1 || len(a.aiSlots) != 0 {
		t.Fatalf("split failed or leaked an AI slot: status %d, calls %d, response %s", w.Code, calls, w.Body.String())
	}
	var result struct {
		Questions []map[string]any `json:"questions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result.Questions) != 2 {
		t.Fatal("expected two separately extracted questions", err)
	}
	for _, question := range result.Questions {
		if len(question) != 2 || question["title"] == "" || question["stem"] == "" || question["subject"] != nil || question["analysis"] != nil || question["classification"] != nil {
			t.Fatal("split responses must contain only title and stem for each question")
		}
	}
	if result.Questions[0]["title"] != "1. 解方程" || result.Questions[0]["stem"] != "1. 解方程：2x+3=11。" || result.Questions[1]["title"] != "2. 求面积" {
		t.Fatal("split response lost reading order or did not trim surrounding whitespace")
	}
	var usage int
	if err := a.db.QueryRow("SELECT COALESCE(SUM(count),0) FROM ai_usage").Scan(&usage); err != nil || usage != 1 {
		t.Fatal("one split request should consume exactly one quota unit", err, usage)
	}
}

func TestQuestionSplitRejectsUnreadableAndIncompleteResults(t *testing.T) {
	tooMany := make([]any, 21)
	for index := range tooMany {
		tooMany[index] = map[string]string{"title": "题目", "stem": "解方程。"}
	}
	for _, row := range []struct {
		name, content, finishReason string
		status                      int
		code                        string
	}{
		{"unreadable", `{"error":"unreadable"}`, "stop", 422, "PAGE_NEEDS_REVIEW"},
		{"not-a-question", `{"error":"not_a_question"}`, "stop", 422, "PAGE_NEEDS_REVIEW"},
		{"reported-too-many", `{"error":"too_many_questions"}`, "stop", 422, "PAGE_NEEDS_REVIEW"},
		{"empty-list", `{"questions":[]}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"missing-list", `{}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"too-many-questions", mustJSON(map[string]any{"questions": tooMany}), "stop", 502, "INVALID_AI_RESPONSE"},
		{"empty-title", `{"questions":[{"title":"  ","stem":"题干"}]}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"missing-stem", `{"questions":[{"title":"题目"}]}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"invalid-field-type", `{"questions":[{"title":42,"stem":"题干"}]}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"long-title", mustJSON(map[string]any{"questions": []any{map[string]string{"title": strings.Repeat("题", 61), "stem": "题干"}}}), "stop", 502, "INVALID_AI_RESPONSE"},
		{"long-stem", mustJSON(map[string]any{"questions": []any{map[string]string{"title": "题目", "stem": strings.Repeat("题", 5001)}}}), "stop", 502, "INVALID_AI_RESPONSE"},
		{"truncated-json", `{"questions":[{"title":"题目","stem":"题干"}`, "stop", 502, "INVALID_AI_RESPONSE"},
		{"truncated-finish-reason", mustJSON(splitTestResult()), "length", 502, "INVALID_AI_RESPONSE"},
		{"missing-finish-reason", mustJSON(splitTestResult()), "", 502, "INVALID_AI_RESPONSE"},
	} {
		t.Run(row.name, func(t *testing.T) {
			a := deepseekTestApp(t)
			owner := signIn(t, a, "split-invalid")
			calls := 0
			a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				if calls == 1 {
					return splitTestRawResponse(row.content, row.finishReason), nil
				}
				return deepseekJSONResponse(splitTestResult()), nil
			})}
			w := call(t, a, "POST", "/api/question-split", map[string]string{"image": splitTestImage}, owner, "http://study.test")
			if w.Code != row.status || !strings.Contains(w.Body.String(), row.code) || strings.Contains(w.Body.String(), `"questions"`) || calls != 1 || len(a.aiSlots) != 0 {
				t.Fatalf("invalid result was accepted or leaked a slot: status %d, response %s, calls %d", w.Code, w.Body.String(), calls)
			}
			w = call(t, a, "POST", "/api/question-split", map[string]string{"image": splitTestImage}, owner, "http://study.test")
			if w.Code != http.StatusOK || calls != 2 || len(a.aiSlots) != 0 {
				t.Fatalf("a failed split prevented the next attempt: status %d, calls %d", w.Code, calls)
			}
		})
	}
}

func TestQuestionSplitSharesAndReleasesGenerateSlot(t *testing.T) {
	for _, holdingPath := range []string{"/api/question-split", "/api/question-generate"} {
		t.Run(holdingPath, func(t *testing.T) {
			a := deepseekTestApp(t)
			owner := signIn(t, a, "split-shared-slot")
			started := make(chan struct{})
			proceed := make(chan struct{})
			var unblock sync.Once
			defer unblock.Do(func() { close(proceed) })
			calls := 0
			a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				if calls == 1 {
					close(started)
					<-proceed
				}
				if holdingPath == "/api/question-split" && calls == 1 || holdingPath == "/api/question-generate" && calls == 2 {
					return deepseekJSONResponse(splitTestResult()), nil
				}
				return deepseekJSONResponse(deepseekTestResult()), nil
			})}
			input, waitingPath, waitingInput := any(map[string]string{"image": splitTestImage}), "/api/question-generate", any(deepseekTestInput())
			if holdingPath == "/api/question-generate" {
				input, waitingPath, waitingInput = deepseekTestInput(), "/api/question-split", map[string]string{"image": splitTestImage}
			}
			finished := make(chan *httptest.ResponseRecorder, 1)
			go func() { finished <- call(t, a, "POST", holdingPath, input, owner, "http://study.test") }()
			select {
			case <-started:
			case <-time.After(3 * time.Second):
				t.Fatal("the first request did not reach the mocked model")
			}
			blocked := call(t, a, "POST", waitingPath, waitingInput, owner, "http://study.test")
			if blocked.Code != http.StatusTooManyRequests || !strings.Contains(blocked.Body.String(), "AI_BUSY") {
				t.Fatalf("split and generate must share the same slot: status %d, response %s", blocked.Code, blocked.Body.String())
			}
			unblock.Do(func() { close(proceed) })
			select {
			case response := <-finished:
				if response.Code != http.StatusOK || calls != 1 || len(a.aiSlots) != 0 {
					t.Fatalf("first request failed to release the shared slot: status %d, calls %d", response.Code, calls)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("the first request did not finish after the model was released")
			}
			retry := call(t, a, "POST", waitingPath, waitingInput, owner, "http://study.test")
			if retry.Code != http.StatusOK || calls != 2 || len(a.aiSlots) != 0 {
				t.Fatalf("the other endpoint could not run after release: status %d, calls %d", retry.Code, calls)
			}
			var usage int
			if err := a.db.QueryRow("SELECT COALESCE(SUM(count),0) FROM ai_usage").Scan(&usage); err != nil || usage != 2 {
				t.Fatal("AI_BUSY should not consume quota; only the two executed requests should be counted", err, usage)
			}
		})
	}
}
