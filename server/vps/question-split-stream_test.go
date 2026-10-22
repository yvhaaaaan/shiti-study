package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSplitProgressHandlesEveryByteBoundary(t *testing.T) {
	questions := []splitQuestion{{Title: `1. 花括号{与引号"}`, Stem: "题干包含数组[1,2]、转义\\和换行\n，求x。"}, {Title: "2. 面积", Stem: "长8厘米宽5厘米，求面积。"}}
	content := mustJSON(map[string]any{"note": `a quoted "questions" is not an array`, "questions": questions})
	progress := &splitProgress{}
	var received []splitQuestion
	for i := 1; i <= len(content); i++ {
		if err := progress.append(content[:i], func(index int, q splitQuestion) error {
			if index != len(received) {
				t.Fatal("duplicate or out of order")
			}
			received = append(received, q)
			return nil
		}); err != nil {
			t.Fatalf("at byte %d: %v", i, err)
		}
	}
	if len(received) != 2 || received[0] != questions[0] || received[1] != questions[1] {
		t.Fatal("split parser altered complete questions")
	}
}

func splitChunk(content, reason string) string {
	return "data: " + mustJSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": content}, "finish_reason": reason}}}) + "\n\n"
}

func readSplitEvent(t *testing.T, reader *bufio.Reader) (string, map[string]any) {
	t.Helper()
	event := ""
	var data map[string]any
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatal("stream closed before event", err)
		}
		line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		}
		if strings.HasPrefix(line, "data:") {
			if err = json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &data); err != nil {
				t.Fatal(err)
			}
		}
		if line == "" && data != nil {
			return event, data
		}
	}
}

func TestSplitStreamsQuestionBeforeUpstreamCompletes(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "split-stream")
	pipe, writer := io.Pipe()
	defer writer.Close()
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["stream"] != true {
			t.Error("upstream stream not enabled")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"text/event-stream"}}, Body: pipe}, nil
	})}
	server := httptest.NewServer(a)
	defer server.Close()
	request, _ := http.NewRequest("POST", server.URL+"/api/question-split", strings.NewReader(mustJSON(map[string]string{"image": splitTestImage})))
	request.AddCookie(owner)
	request.Header.Set("Accept", "text/event-stream")
	request.Header.Set("Origin", server.URL)
	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	if event, _ := readSplitEvent(t, reader); event != "open" {
		t.Fatal(event)
	}
	first := splitQuestion{Title: "1. 方程", Stem: "2x+3=11，求x。"}
	second := splitQuestion{Title: "2. 面积", Stem: "长8宽5，求面积。"}
	if _, err = fmt.Fprint(writer, splitChunk(`{"questions":[`+mustJSON(first), "")); err != nil {
		t.Fatal(err)
	}
	event, data := readSplitEvent(t, reader)
	if event != "question" || data["index"] != float64(0) || data["question"].(map[string]any)["stem"] != first.Stem {
		t.Fatal(event, data)
	}
	// The second question and [DONE] have not been written yet. Reaching this
	// assertion proves the first complete question crossed both HTTP streams.
	if _, err = fmt.Fprint(writer, splitChunk(","+mustJSON(second)+"]}", "stop")+"data: [DONE]\n\n"); err != nil {
		t.Fatal(err)
	}
	_ = writer.Close()
	if event, _ = readSplitEvent(t, reader); event != "question" {
		t.Fatal(event)
	}
	if event, data = readSplitEvent(t, reader); event != "done" || len(data["questions"].([]any)) != 2 {
		t.Fatal(event, data)
	}
}

func TestSplitStreamRejectsIncompleteAndInvalidFinalResults(t *testing.T) {
	valid := mustJSON(map[string]any{"questions": []splitQuestion{{Title: "1. 方程", Stem: "2x+3=11，求x。"}}})
	for _, row := range []struct {
		name, content, reason string
		terminated            bool
	}{
		{"missing-done", valid, "stop", false},
		{"truncated", valid[:len(valid)-3], "stop", true},
		{"token-limit", valid, "length", true},
		{"model-error", `{"error":"unreadable"}`, "stop", true},
		{"invalid-question", `{"questions":[{"title":"1","stem":""}]}`, "stop", true},
		{"changed-final-list", `{"questions":[{"title":"1","stem":"first"}],"questions":[{"title":"1","stem":"changed"}]}`, "stop", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			response := deepseekStream([]string{row.content}, row.reason, row.terminated)
			defer response.Body.Close()
			if err := streamSplitQuestions(w, response); err != nil {
				t.Fatal("stream error must not append JSON", err)
			}
			if !strings.Contains(w.Body.String(), "event: error\n") || strings.Contains(w.Body.String(), "event: done\n") {
				t.Fatal(w.Body.String())
			}
		})
	}
}

func TestSplitStreamFallbackIsSingleAndDoesNotDoubleCharge(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "split-fallback")
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if calls == 1 {
			if body["stream"] != true {
				t.Error("first request should stream")
			}
			return &http.Response{StatusCode: 400, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("unsupported"))}, nil
		}
		if body["stream"] != false {
			t.Error("fallback should be buffered")
		}
		return splitTestRawResponse(mustJSON(splitTestResult()), "stop"), nil
	})}
	r := httptest.NewRequest("POST", "http://study.test/api/question-split", strings.NewReader(mustJSON(map[string]string{"image": splitTestImage})))
	r.AddCookie(owner)
	r.Header.Set("Origin", "http://study.test")
	r.Header.Set("Accept", "text/event-stream")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	if w.Code != 200 || calls != 2 || !strings.Contains(w.Header().Get("Content-Type"), "application/json") {
		t.Fatal(w.Code, calls, w.Body.String())
	}
	var count int
	if err := a.db.QueryRow("SELECT SUM(count) FROM ai_usage").Scan(&count); err != nil || count != 1 {
		t.Fatal("fallback consumed more than one allowance", count, err)
	}
}
