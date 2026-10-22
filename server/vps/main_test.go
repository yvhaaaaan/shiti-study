package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testApp(t *testing.T) *app {
	t.Helper()
	t.Setenv("SHITI_ALLOW_HTTP", "1")
	a, err := openApp(t.TempDir(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.db.Close() })
	a.invite = "class-test-invite"
	return a
}
func call(t *testing.T, a *app, method, path string, body any, cookie *http.Cookie, origin string) *httptest.ResponseRecorder {
	t.Helper()
	var raw []byte
	if body != nil {
		if content, ok := body.([]byte); ok {
			raw = content
		} else {
			var err error
			raw, err = json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	r := httptest.NewRequest(method, "http://study.test"+path, bytes.NewReader(raw))
	if cookie != nil {
		r.AddCookie(cookie)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func signIn(t *testing.T, a *app, name string) *http.Cookie {
	t.Helper()
	if _, err := a.createUser(name, "Test-Account-Password"); err != nil {
		t.Fatal(err)
	}
	w := call(t, a, "POST", "/api/login", map[string]string{"username": name, "password": "Test-Account-Password"}, nil, "http://study.test")
	if w.Code != 200 {
		t.Fatalf("login %d: %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal("missing protected session cookie")
	}
	return cookies[0]
}
func stateData(images []string) map[string]any {
	return map[string]any{"version": 1, "questions": []any{map[string]any{"id": "q-1", "title": "测试", "stem": "2x+3=11", "images": images}}, "notes": []any{}, "papers": []any{}, "reviews": []any{}, "profile": map[string]any{"nickname": "测试同学"}}
}
func put(t *testing.T, a *app, cookie *http.Cookie, rev int, id string, data any) *httptest.ResponseRecorder {
	return call(t, a, "PUT", "/api/state", map[string]any{"revision": rev, "writeId": id, "data": data}, cookie, "http://study.test")
}
func TestAuthenticationAndIsolation(t *testing.T) {
	a := testApp(t)
	if w := call(t, a, "GET", "/api/state", nil, nil, ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	owner := signIn(t, a, "owner")
	other := signIn(t, a, "other")
	if w := call(t, a, "POST", "/api/logout", nil, owner, "http://evil.test"); w.Code != 403 {
		t.Fatal("CSRF was allowed")
	}
	if w := put(t, a, owner, 0, "write-one", stateData([]string{})); w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, w.Body.String())
	}
	if w := call(t, a, "GET", "/api/state", nil, other, ""); !strings.Contains(w.Body.String(), `"data":null`) {
		t.Fatal("cross-user data leaked")
	}
	if w := call(t, a, "POST", "/api/register", map[string]string{"username": "student", "password": "Student-password", "inviteCode": "wrong"}, nil, "http://study.test"); w.Code != 403 {
		t.Fatal("invalid invite accepted")
	}
	if w := call(t, a, "POST", "/api/register", map[string]string{"username": "student", "password": "Student-password", "inviteCode": a.invite}, nil, "http://study.test"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(t, a, "POST", "/api/logout", nil, owner, "http://study.test"); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := call(t, a, "GET", "/api/state", nil, owner, ""); w.Code != 401 {
		t.Fatal("logout did not revoke session")
	}
}
func TestRevisionConflictAndRetry(t *testing.T) {
	a := testApp(t)
	owner := signIn(t, a, "owner")
	data := stateData([]string{})
	for i := 0; i < 2; i++ {
		w := put(t, a, owner, 0, "repeat-write", data)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"revision":1`) {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	data["profile"] = map[string]string{"nickname": "updated"}
	if w := put(t, a, owner, 0, "stale-write", data); w.Code != 409 {
		t.Fatal("stale overwrite accepted", w.Code)
	}
	if w := put(t, a, owner, 1, "new-write", data); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := put(t, a, owner, 1, "new-write", stateData([]string{})); w.Code != 409 {
		t.Fatal("idempotency key reused for different content")
	}
	if w := call(t, a, "GET", "/api/state", nil, owner, ""); !strings.Contains(w.Body.String(), "updated") {
		t.Fatal("committed state lost")
	}
	var count int
	if err := a.db.QueryRow("SELECT COUNT(*) FROM states").Scan(&count); err != nil || count != 1 {
		t.Fatal("retries duplicated state rows")
	}
}
func TestMediaDurabilityAndAccess(t *testing.T) {
	a := testApp(t)
	owner := signIn(t, a, "owner")
	other := signIn(t, a, "other")
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	var path string
	for i := 0; i < 2; i++ {
		w := call(t, a, "POST", "/api/media", png, owner, "http://study.test")
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var result struct {
			URL string `json:"url"`
		}
		json.Unmarshal(w.Body.Bytes(), &result)
		path = result.URL
	}
	var count int
	a.db.QueryRow("SELECT COUNT(*) FROM media").Scan(&count)
	if count != 1 {
		t.Fatal("image not deduplicated")
	}
	if w := call(t, a, "GET", path, nil, other, ""); w.Code != 404 {
		t.Fatal("another user could read image")
	}
	if w := call(t, a, "GET", path, nil, owner, ""); w.Code != 200 || !bytes.Equal(w.Body.Bytes(), png) {
		t.Fatal("stored image differs")
	}
	if w := put(t, a, other, 0, "foreign-image", stateData([]string{path})); w.Code != 400 {
		t.Fatal("foreign image attached")
	}
	if w := put(t, a, owner, 0, "stored-image", stateData([]string{path})); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	reopened, err := openApp(a.dataDir, a.staticDir)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.db.Close()
	if w := call(t, reopened, "GET", "/api/state", nil, owner, ""); w.Code != 200 || !strings.Contains(w.Body.String(), path) {
		t.Fatal("data did not survive reconnect")
	}
	if w := call(t, a, "POST", "/api/media", []byte("<svg><script>alert(1)</script></svg>"), owner, "http://study.test"); w.Code != 400 {
		t.Fatal("unsafe media accepted")
	}
	if w := call(t, a, "POST", "/api/media", make([]byte, mediaLimit+1), owner, "http://study.test"); w.Code != 413 {
		t.Fatal("oversized media accepted")
	}
	backup := filepath.Join(a.dataDir, "backup.sqlite")
	if _, err := a.db.Exec("VACUUM INTO ?", backup); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(backup); err != nil || info.Size() == 0 {
		t.Fatal("backup did not complete")
	}
}

type roundTrip func(*http.Request) (*http.Response, error)

func TestQuestionRemarkAttachmentsAndLegacyState(t *testing.T) {
	a := testApp(t)
	owner := signIn(t, a, "remark-owner")
	other := signIn(t, a, "remark-other")
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII=")
	w := call(t, a, "POST", "/api/media", png, owner, "http://study.test")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var media struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &media); err != nil {
		t.Fatal(err)
	}
	data := stateData([]string{})
	if w := put(t, a, owner, 0, "legacy-question-no-remarks", data); w.Code != 200 {
		t.Fatal("legacy question rejected", w.Code)
	}
	question := data["questions"].([]any)[0].(map[string]any)
	question["remark"] = "课堂板书与自己的理解"
	question["remarkImages"] = []string{media.URL}
	if w := put(t, a, other, 0, "foreign-remark-image", data); w.Code != 400 {
		t.Fatal("foreign remark image attached", w.Code)
	}
	if w := put(t, a, owner, 1, "owned-remark-image", data); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	question["remarkImages"] = []string{media.URL, media.URL, media.URL, media.URL, media.URL, media.URL, media.URL}
	if w := put(t, a, owner, 2, "too-many-remark-images", data); w.Code != 400 {
		t.Fatal("seven remark photos accepted", w.Code)
	}
	question["remarkImages"] = nil
	if w := put(t, a, owner, 2, "null-remark-images", data); w.Code != 400 {
		t.Fatal("null attachment list accepted", w.Code)
	}
	question["remarkImages"] = []string{}
	question["remark"] = strings.Repeat("字", 5001)
	if w := put(t, a, owner, 2, "too-long-remark-text", data); w.Code != 400 {
		t.Fatal("oversized remarks accepted", w.Code)
	}
	question["remark"] = nil
	if w := put(t, a, owner, 2, "invalid-remark-text", data); w.Code != 400 {
		t.Fatal("invalid remarks accepted", w.Code)
	}
	w = call(t, a, "GET", "/api/state", nil, owner, "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), media.URL) || !strings.Contains(w.Body.String(), "课堂板书与自己的理解") {
		t.Fatal("failed edits changed committed remarks")
	}
}

func TestNoteAttachmentOwnershipAndCompatibility(t *testing.T) {
	a := testApp(t)
	owner := signIn(t, a, "note-owner")
	other := signIn(t, a, "note-other")
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII=")
	w := call(t, a, "POST", "/api/media", png, owner, "http://study.test")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var media struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &media); err != nil {
		t.Fatal(err)
	}
	data := stateData([]string{})
	note := map[string]any{"id": "image-note", "title": "课堂板书", "content": ""}
	data["notes"] = []any{note}
	if w := put(t, a, owner, 0, "legacy-text-note", data); w.Code != 200 {
		t.Fatal("legacy note rejected", w.Code)
	}
	note["images"] = []string{media.URL}
	if w := put(t, a, other, 0, "foreign-note-image", data); w.Code != 400 {
		t.Fatal("foreign note image accepted", w.Code)
	}
	if w := put(t, a, owner, 1, "private-note-image", data); w.Code != 200 {
		t.Fatal("own note image rejected", w.Code, w.Body.String())
	}
	note["images"] = []string{media.URL, media.URL, media.URL, media.URL, media.URL, media.URL, media.URL}
	if w := put(t, a, owner, 2, "too-many-note-images", data); w.Code != 400 {
		t.Fatal("oversized note gallery accepted", w.Code)
	}
	note["images"] = nil
	if w := put(t, a, owner, 2, "invalid-note-images", data); w.Code != 400 {
		t.Fatal("null image list accepted", w.Code)
	}
	var saved struct {
		Data struct {
			Notes []struct {
				Images []string `json:"images"`
			} `json:"notes"`
		} `json:"data"`
	}
	w = call(t, a, "GET", "/api/state", nil, owner, "")
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil || len(saved.Data.Notes) != 1 || len(saved.Data.Notes[0].Images) != 1 || saved.Data.Notes[0].Images[0] != media.URL {
		t.Fatal("failed edits changed saved note")
	}
}

func TestExplicitAnswerContradictions(t *testing.T) {
	for _, row := range []struct {
		answer, analysis string
		rejected         bool
	}{
		{"C", "计算得-1。\n【最终答案】B\n【检查】选项B对应-1。", true},
		{"B（最小值为-1）", "【最终答案】B", false},
		{"x = 4", "两边除以2，得到x = 4。", false},
		{"C", "选项B不正确，本题选C。", false},
		{"C、A", "【最终答案】A、C", false},
	} {
		if choiceContradiction(row.answer, row.analysis) != row.rejected {
			t.Fatal("incorrect contradiction decision", row.answer)
		}
	}
}

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestAIValidationAndResponse(t *testing.T) {
	a := testApp(t)
	owner := signIn(t, a, "owner")
	a.apiKey = "unit-test-secret"
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("api-key") != a.apiKey || r.URL.Host != "api.xiaomimimo.com" {
			t.Fatal("wrong upstream configuration")
		}
		output := map[string]any{"title": "解方程", "subject": "数学", "stem": "2x+3=11，求x", "answer": "x=4", "analysis": "1.两边减3得2x=8。2.两边除以2得x=4。", "tags": []string{"一元一次方程"}, "difficulty": "基础"}
		body := mustJSON(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"content": mustJSON(output)}}}})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})}
	if w := call(t, a, "POST", "/api/question-generate", map[string]any{"stem": "", "images": []string{}, "tags": []string{}}, owner, "http://study.test"); w.Code != 400 || calls != 0 {
		t.Fatal("empty input called model")
	}
	if w := call(t, a, "POST", "/api/question-generate", map[string]any{"stem": "2x+3=11，求x", "images": []string{}, "tags": []string{}}, owner, "http://study.test"); w.Code != 200 || calls != 1 || strings.Contains(w.Body.String(), "cause") {
		t.Fatal(w.Code, w.Body.String(), calls)
	}
}
func TestEntryRedirect(t *testing.T) {
	path := filepath.Join(t.TempDir(), "url")
	handler := entryHandler(path)
	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest("GET", "http://entry/", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	for _, target := range []string{"http://evil.test", "https://evil.test", "https://abc.trycloudflare.com.evil.test", "https://abc.trycloudflare.com/steal"} {
		os.WriteFile(path, []byte(target), 0600)
		w = httptest.NewRecorder()
		handler(w, httptest.NewRequest("GET", "http://entry/", nil))
		if w.Code != 503 {
			t.Fatal("untrusted redirect accepted")
		}
	}
	os.WriteFile(path, []byte("https://classroom.trycloudflare.com"), 0600)
	w = httptest.NewRecorder()
	handler(w, httptest.NewRequest("GET", "http://entry/", nil))
	if w.Code != 302 || w.Header().Get("Location") != "https://classroom.trycloudflare.com/" {
		t.Fatal(w.Code)
	}
}
