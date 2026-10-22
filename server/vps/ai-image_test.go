package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const imageTestPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf0cAAAAASUVORK5CYII="

func uploadAIImage(t *testing.T, a *app, cookie *http.Cookie) (string, []byte) {
	t.Helper()
	png, err := base64.StdEncoding.DecodeString(imageTestPNG)
	if err != nil {
		t.Fatal(err)
	}
	w := call(t, a, "POST", "/api/media", png, cookie, "http://study.test")
	var uploaded struct {
		URL string `json:"url"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &uploaded) != nil || uploaded.URL == "" {
		t.Fatalf("image setup failed: %d %s", w.Code, w.Body.String())
	}
	return uploaded.URL, png
}

func TestAIImageReferenceResolvedWithOwnerCredentials(t *testing.T) {
	a := deepseekTestApp(t)
	owner := signIn(t, a, "image-owner")
	other := signIn(t, a, "image-other")
	reference, _ := uploadAIImage(t, a, owner)
	calls := 0
	a.client = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != a.endpoint || r.Header.Get("Authorization") != "Bearer "+a.apiKey {
			t.Fatal("image reference changed provider configuration")
		}
		var body struct {
			Messages []struct {
				Role    string
				Content json.RawMessage
			}
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || len(body.Messages) != 2 {
			t.Fatal("invalid upstream request")
		}
		var content []struct {
			Type     string
			ImageURL struct {
				URL string `json:"url"`
			} `json:"image_url"`
		}
		if json.Unmarshal(body.Messages[1].Content, &content) != nil || len(content) != 2 || content[1].Type != "image_url" {
			t.Fatal("missing resolved image")
		}
		if content[1].ImageURL.URL != "data:image/png;base64,"+imageTestPNG {
			t.Fatal("provider did not receive exact owned image bytes")
		}
		if strings.Contains(string(body.Messages[1].Content), "/api/media/") || strings.Contains(string(body.Messages[1].Content), cookieName) {
			t.Fatal("private route or session credential leaked to model")
		}
		return deepseekJSONResponse(deepseekTestResult()), nil
	})}
	input := func(image string) map[string]any {
		return map[string]any{"stem": "2x+3=11，求x", "images": []string{image}, "tags": []string{}}
	}
	for _, row := range []struct {
		cookie *http.Cookie
		source string
		status int
	}{
		{other, reference, 404},
		{owner, "/api/media/" + strings.Repeat("0", 64), 404},
		{owner, reference + "?download=1", 400},
		{owner, "https://study.test" + reference, 400},
		{owner, "http://127.0.0.1/private", 400},
		{owner, "/api/media/../shiti.env", 400},
	} {
		w := call(t, a, "POST", "/api/question-generate", input(row.source), row.cookie, "http://study.test")
		if w.Code != row.status || calls != 0 || len(a.aiSlots) != 0 {
			t.Fatalf("invalid/foreign reference reached provider: %d %s, calls=%d", w.Code, w.Body.String(), calls)
		}
	}
	var usage int
	if err := a.db.QueryRow("SELECT COALESCE(SUM(count),0) FROM ai_usage").Scan(&usage); err != nil || usage != 0 {
		t.Fatal("rejected references consumed model usage")
	}
	for _, image := range []string{reference, "data:image/png;base64," + imageTestPNG} {
		w := call(t, a, "POST", "/api/question-generate", input(image), owner, "http://study.test")
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"answer":"x=4"`) {
			t.Fatalf("owned reference/inline compatibility failed: %d %s", w.Code, w.Body.String())
		}
	}
	if calls != 2 {
		t.Fatal("unexpected provider call count", calls)
	}
}

func TestAIImageReferenceChecksStoredFileAndMime(t *testing.T) {
	a := testApp(t)
	cookie := signIn(t, a, "file-owner")
	reference, png := uploadAIImage(t, a, cookie)
	var account user
	if err := a.db.QueryRow("SELECT id,username FROM users WHERE username=?", "file-owner").Scan(&account.ID, &account.Username); err != nil {
		t.Fatal(err)
	}
	hash := strings.TrimPrefix(reference, "/api/media/")
	path := filepath.Join(a.dataDir, "media", account.ID, hash)
	assertRejected := func() {
		t.Helper()
		_, err := a.aiImage(&account, reference)
		var item *apiError
		if !errors.As(err, &item) || item.Status != 404 {
			t.Fatalf("invalid stored file not rejected: %v", err)
		}
	}
	if _, err := a.db.Exec("UPDATE media SET mime='image/jpeg' WHERE user_id=? AND hash=?", account.ID, hash); err != nil {
		t.Fatal(err)
	}
	assertRejected()
	if _, err := a.db.Exec("UPDATE media SET mime='image/png',size=? WHERE user_id=? AND hash=?", len(png)+1, account.ID, hash); err != nil {
		t.Fatal(err)
	}
	assertRejected()
	if _, err := a.db.Exec("UPDATE media SET size=? WHERE user_id=? AND hash=?", len(png), account.ID, hash); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.Repeat("x", len(png))), 0600); err != nil {
		t.Fatal(err)
	}
	assertRejected()
	if err := os.WriteFile(path, append(png, make([]byte, mediaLimit)...), 0600); err != nil {
		t.Fatal(err)
	}
	assertRejected()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	assertRejected()
}

func TestAIImageReferenceRejectsSymlinkEscape(t *testing.T) {
	a := testApp(t)
	cookie := signIn(t, a, "link-owner")
	reference, png := uploadAIImage(t, a, cookie)
	var account user
	if err := a.db.QueryRow("SELECT id,username FROM users WHERE username=?", "link-owner").Scan(&account.ID, &account.Username); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(a.dataDir, "media", account.ID, strings.TrimPrefix(reference, "/api/media/"))
	outside := filepath.Join(t.TempDir(), "outside.png")
	if err := os.WriteFile(outside, png, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Skipf("symlinks unavailable on this platform: %v", err)
	}
	if _, err := a.aiImage(&account, reference); err == nil {
		t.Fatal("symlink escaped account media directory")
	}
}

func TestAIImageInlineStillRejectsInvalidBytes(t *testing.T) {
	a := testApp(t)
	for _, source := range []string{
		"data:image/jpeg;base64," + imageTestPNG,
		"data:image/png;base64,broken",
		"data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte("<svg></svg>")),
		"data:image/png;base64," + base64.StdEncoding.EncodeToString(append([]byte{137, 80, 78, 71, 13, 10, 26, 10}, make([]byte, mediaLimit)...)),
	} {
		if _, err := a.aiImage(nil, source); err == nil {
			t.Fatal("invalid inline image accepted")
		}
	}
}
