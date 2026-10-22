// A small standalone host for the Vue application. No Node runtime or database
// daemon is required on the VPS. SQLite and media survive application upgrades.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

//go:embed mimo-prompt.txt
var mimoPrompt string

var accountPattern = regexp.MustCompile(`^[a-zA-Z0-9_\-]{3,32}$`)
var mediaPattern = regexp.MustCompile(`^/api/media/([a-f0-9]{64})$`)
var selectedChoicePattern = regexp.MustCompile(`^\s*(?:(?:选(?:择)?|选项|答案(?:为|是|[:：])?)\s*)?([A-H])(?:$|[\s.、，,：:（(])`)
var multipleChoicePattern = regexp.MustCompile(`[A-H]\s*[,，、/]\s*[A-H]`)
var finalChoicePattern = regexp.MustCompile(`【(?:最终答案|最终结论|答案)】\s*(?:(?:应?选(?:择)?|选项|答案(?:为|是|[:：])?)\s*)?([A-H])(?:$|[\s.。、，,：:（(])`)

const cookieName = "shiti_session"
const stateLimit = 4 * 1024 * 1024
const mediaLimit = 2 * 1024 * 1024

type app struct {
	db                                        *sql.DB
	dataDir, staticDir, invite, apiKey, model string
	provider, endpoint                        string
	client                                    *http.Client
	aiSlots                                   chan struct{}
	mu                                        sync.Mutex
	attempts                                  map[string][]time.Time
}
type user struct{ ID, Username string }
type apiError struct {
	Status        int
	Code, Message string
}

func (e *apiError) Error() string                 { return e.Message }
func fail(status int, code, message string) error { return &apiError{status, code, message} }
func randomID(size int) string {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func digest(s string) string { sum := sha256.Sum256([]byte(s)); return hex.EncodeToString(sum[:]) }
func passwordHash(password, salt string) string {
	b, err := pbkdf2.Key(sha256.New, password, []byte(salt), 150000, 32)
	if err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, err error) {
	var item *apiError
	if !errors.As(err, &item) {
		item = &apiError{500, "SERVER_ERROR", "服务暂时未能完成操作，当前输入请保留后重试。"}
	}
	jsonResponse(w, item.Status, map[string]any{"error": map[string]string{"code": item.Code, "message": item.Message}})
}
func decode(w http.ResponseWriter, r *http.Request, limit int64, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(value); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return fail(413, "PAYLOAD_TOO_LARGE", "内容过大，请减少题图后重试。")
		}
		return fail(400, "INVALID_JSON", "提交的内容格式不正确。")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fail(400, "INVALID_JSON", "提交的内容格式不正确。")
	}
	return nil
}
func mutationAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return r.Header.Get("Sec-Fetch-Site") != "cross-site"
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host != r.Host || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	return (u.Scheme == "https" || (os.Getenv("SHITI_ALLOW_HTTP") == "1" && u.Scheme == "http")) && r.Header.Get("Sec-Fetch-Site") != "cross-site"
}
func openApp(dataDir, staticDir string) (*app, error) {
	if err := os.MkdirAll(filepath.Join(dataDir, "media"), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(dataDir, "study.sqlite"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA cache_size=-2000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS states(user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL, write_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media(user_id TEXT NOT NULL REFERENCES users(id), hash TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(user_id,hash));
CREATE TABLE IF NOT EXISTS ai_usage(user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,day));`)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	a := &app{db: db, dataDir: dataDir, staticDir: staticDir, invite: os.Getenv("SHITI_INVITE_CODE"), provider: env("SHITI_AI_PROVIDER", "mimo"), client: &http.Client{Timeout: 65 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, aiSlots: make(chan struct{}, 1), attempts: map[string][]time.Time{}}
	switch a.provider {
	case "mimo":
		a.apiKey, a.model, a.endpoint = os.Getenv("MIMO_API_KEY"), env("MIMO_MODEL", "mimo-v2.6-flash"), "https://api.xiaomimimo.com/v1/chat/completions"
	case "deepseek":
		a.apiKey, a.model, a.endpoint = os.Getenv("DEEPSEEK_API_KEY"), env("DEEPSEEK_MODEL", "deepseek-flash"), "https://api.deepseek.com/chat/completions"
		if a.model != "deepseek-flash" && a.model != "deepseek-v4-pro" {
			_ = db.Close()
			return nil, errors.New("unsupported DeepSeek model")
		}
	default:
		_ = db.Close()
		return nil, errors.New("unsupported AI provider")
	}
	return a, nil
}
func (a *app) createUser(username, password string) (*user, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if !accountPattern.MatchString(username) || len(password) < 10 || len(password) > 128 {
		return nil, fail(400, "INVALID_ACCOUNT", "账号需为3至32位字母、数字或下划线，密码需为10至128位。")
	}
	u := &user{randomID(16), username}
	salt := randomID(16)
	_, err := a.db.Exec("INSERT INTO users(id,username,salt,password) VALUES(?,?,?,?)", u.ID, u.Username, salt, passwordHash(password, salt))
	if err != nil {
		return nil, fail(409, "ACCOUNT_EXISTS", "这个账号已存在，请更换账号或直接登录。")
	}
	return u, nil
}
func (a *app) bootstrap() error {
	var count int
	if err := a.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		_, err := a.createUser(env("SHITI_ADMIN_USER", "demo"), os.Getenv("SHITI_ADMIN_PASSWORD"))
		return err
	}
	return nil
}
func (a *app) currentUser(r *http.Request) *user {
	cookie, err := r.Cookie(cookieName)
	if err != nil || len(cookie.Value) != 64 {
		return nil
	}
	u := &user{}
	err = a.db.QueryRow("SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?", digest(cookie.Value), time.Now().Unix()).Scan(&u.ID, &u.Username)
	if err != nil {
		return nil
	}
	return u
}
func (a *app) session(w http.ResponseWriter, r *http.Request, u *user) error {
	token := randomID(32)
	expires := time.Now().Add(7 * 24 * time.Hour)
	if _, err := a.db.Exec("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)", digest(token), u.ID, expires.Unix()); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, Path: "/", HttpOnly: true, Secure: os.Getenv("SHITI_ALLOW_HTTP") != "1", SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: 7 * 24 * 60 * 60})
	return nil
}
func (a *app) allowLogin(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	history := a.attempts[key]
	filtered := history[:0]
	for _, t := range history {
		if now.Sub(t) < 10*time.Minute {
			filtered = append(filtered, t)
		}
	}
	a.attempts[key] = filtered
	if len(filtered) >= 12 {
		return false
	}
	a.attempts[key] = append(filtered, now)
	if len(a.attempts) > 2000 {
		for k, v := range a.attempts {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > 10*time.Minute {
				delete(a.attempts, k)
			}
		}
	}
	return true
}
func (a *app) auth(w http.ResponseWriter, r *http.Request, register bool) error {
	var input struct{ Username, Password, InviteCode string }
	if err := decode(w, r, 4096, &input); err != nil {
		return err
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	if !a.allowLogin(username) {
		return fail(429, "LOGIN_RATE_LIMIT", "尝试次数较多，请10分钟后再试。")
	}
	var u *user
	if register {
		if a.invite == "" || subtle.ConstantTimeCompare([]byte(input.InviteCode), []byte(a.invite)) != 1 {
			return fail(403, "INVITE_REQUIRED", "邀请码不正确，请向演示者获取邀请码。")
		}
		var err error
		u, err = a.createUser(username, input.Password)
		if err != nil {
			return err
		}
	} else {
		var salt, hash string
		u = &user{}
		err := a.db.QueryRow("SELECT id,username,salt,password FROM users WHERE username=?", username).Scan(&u.ID, &u.Username, &salt, &hash)
		if err != nil {
			_ = passwordHash(input.Password, "unknown-account")
			return fail(401, "LOGIN_FAILED", "账号或密码不正确。")
		}
		if len(input.Password) > 128 || subtle.ConstantTimeCompare([]byte(passwordHash(input.Password, salt)), []byte(hash)) != 1 {
			return fail(401, "LOGIN_FAILED", "账号或密码不正确。")
		}
	}
	if err := a.session(w, r, u); err != nil {
		return err
	}
	jsonResponse(w, 200, map[string]any{"user": u})
	return nil
}
func (a *app) validateState(u *user, raw json.RawMessage) error {
	var data map[string]json.RawMessage
	if json.Unmarshal(raw, &data) != nil {
		return fail(400, "INVALID_STATE", "学习档案格式不正确。")
	}
	var version int
	if json.Unmarshal(data["version"], &version) != nil || version != 1 {
		return fail(400, "INVALID_STATE", "学习档案版本不受支持。")
	}
	for key, limit := range map[string]int{"questions": 10000, "notes": 5000, "papers": 2000, "reviews": 50000} {
		var rows []map[string]json.RawMessage
		if json.Unmarshal(data[key], &rows) != nil || rows == nil || len(rows) > limit {
			return fail(400, "INVALID_STATE", "学习档案中的列表无效或过大。")
		}
		ids := map[string]bool{}
		for _, row := range rows {
			var id string
			if json.Unmarshal(row["id"], &id) != nil || id == "" || len(id) > 160 || ids[id] {
				return fail(400, "INVALID_STATE", "档案中存在无效或重复标识。")
			}
			ids[id] = true
			if key == "questions" {
				if err := a.validateImages(u, row["images"]); err != nil {
					return err
				}
				if row["remarkImages"] != nil {
					if err := a.validateImageList(u, row["remarkImages"], 6); err != nil {
						return err
					}
				}
				if row["remark"] != nil {
					var remark string
					if json.Unmarshal(row["remark"], &remark) != nil || string(row["remark"]) == "null" || len([]rune(remark)) > 5000 {
						return fail(400, "INVALID_REMARK", "补充说明最多填写5000字。")
					}
				}
			}
			// Legacy notes have no images. New attachments use the same private media
			// ownership checks as question photos, with a separate six-image limit.
			if key == "notes" && row["images"] != nil {
				if err := a.validateImageList(u, row["images"], 6); err != nil {
					return err
				}
			}
			if key == "reviews" && row["questionSnapshot"] != nil {
				var snapshot map[string]json.RawMessage
				if json.Unmarshal(row["questionSnapshot"], &snapshot) != nil {
					return fail(400, "INVALID_STATE", "复习快照格式不正确。")
				}
				if err := a.validateImages(u, snapshot["images"]); err != nil {
					return err
				}
			}
		}
	}
	var profile map[string]any
	if json.Unmarshal(data["profile"], &profile) != nil || profile == nil {
		return fail(400, "INVALID_STATE", "个人资料格式不正确。")
	}
	if _, ok := profile["nickname"].(string); !ok {
		return fail(400, "INVALID_STATE", "个人资料缺少昵称。")
	}
	return nil
}
func (a *app) validateImages(u *user, raw json.RawMessage) error {
	return a.validateImageList(u, raw, 3)
}
func (a *app) validateImageList(u *user, raw json.RawMessage, limit int) error {
	var images []string
	if json.Unmarshal(raw, &images) != nil || images == nil || len(images) > limit {
		return fail(400, "INVALID_IMAGES", fmt.Sprintf("请保留最多%d张有效图片。", limit))
	}
	for _, image := range images {
		match := mediaPattern.FindStringSubmatch(image)
		if match == nil {
			return fail(400, "IMAGE_NOT_UPLOADED", "题图尚未上传成功，请保留当前页面并重试。")
		}
		var count int
		if a.db.QueryRow("SELECT COUNT(*) FROM media WHERE user_id=? AND hash=?", u.ID, match[1]).Scan(&count) != nil || count != 1 {
			return fail(400, "IMAGE_NOT_UPLOADED", "题图未找到，请重新上传。")
		}
	}
	return nil
}
func (a *app) state(w http.ResponseWriter, r *http.Request, u *user) error {
	if r.Method == "GET" {
		var revision int
		var data, writeID string
		err := a.db.QueryRow("SELECT revision,data,write_id FROM states WHERE user_id=?", u.ID).Scan(&revision, &data, &writeID)
		if errors.Is(err, sql.ErrNoRows) {
			jsonResponse(w, 200, map[string]any{"revision": 0, "data": nil})
			return nil
		}
		if err != nil {
			return err
		}
		jsonResponse(w, 200, map[string]any{"revision": revision, "data": json.RawMessage(data), "writeId": writeID})
		return nil
	}
	if r.Method != "PUT" {
		return fail(405, "METHOD_NOT_ALLOWED", "此接口不支持该请求方式。")
	}
	var input struct {
		Revision int
		WriteID  string `json:"writeId"`
		Data     json.RawMessage
	}
	if err := decode(w, r, stateLimit, &input); err != nil {
		return err
	}
	if input.Revision < 0 || len(input.WriteID) < 8 || len(input.WriteID) > 160 {
		return fail(400, "INVALID_STATE", "保存标识无效，请刷新后重试。")
	}
	if err := a.validateState(u, input.Data); err != nil {
		return err
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var revision int
	var lastWrite, lastData string
	err = tx.QueryRow("SELECT revision,write_id,data FROM states WHERE user_id=?", u.ID).Scan(&revision, &lastWrite, &lastData)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil && lastWrite == input.WriteID {
		if lastData != string(input.Data) {
			return fail(409, "WRITE_ID_REUSED", "保存标识已用于其他内容，请重新保存。")
		}
		jsonResponse(w, 200, map[string]int{"revision": revision})
		return nil
	}
	if revision != input.Revision {
		return fail(409, "STATE_CONFLICT", "另一台设备更新了档案。当前修改仍保留，请先导出备份，再刷新查看云端版本。")
	}
	revision++
	_, err = tx.Exec("INSERT INTO states(user_id,revision,write_id,data) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,write_id=excluded.write_id,data=excluded.data", u.ID, revision, input.WriteID, string(input.Data))
	if err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	jsonResponse(w, 200, map[string]int{"revision": revision})
	return nil
}
func (a *app) upload(w http.ResponseWriter, r *http.Request, u *user) error {
	r.Body = http.MaxBytesReader(w, r.Body, mediaLimit)
	content, err := io.ReadAll(r.Body)
	if err != nil || len(content) == 0 {
		return fail(413, "INVALID_IMAGE", "题图为空或超过2MB，请压缩后重试。")
	}
	mime := http.DetectContentType(content)
	if mime != "image/png" && mime != "image/jpeg" && mime != "image/webp" {
		return fail(400, "INVALID_IMAGE", "仅支持真实的 JPG、PNG、WebP 图片文件。")
	}
	hash := sha256.Sum256(content)
	key := hex.EncodeToString(hash[:])
	var existing int
	if err = a.db.QueryRow("SELECT COUNT(*) FROM media WHERE user_id=? AND hash=?", u.ID, key).Scan(&existing); err != nil {
		return err
	}
	if existing == 0 {
		var userBytes, totalBytes int64
		if err = a.db.QueryRow("SELECT COALESCE(SUM(size),0) FROM media WHERE user_id=?", u.ID).Scan(&userBytes); err != nil {
			return err
		}
		if err = a.db.QueryRow("SELECT COALESCE(SUM(size),0) FROM media").Scan(&totalBytes); err != nil {
			return err
		}
		if userBytes+int64(len(content)) > 256*1024*1024 || totalBytes+int64(len(content)) > 2*1024*1024*1024 {
			return fail(413, "MEDIA_QUOTA", "题图空间已达到当前演示服务的容量上限，请先备份并联系部署者扩容。")
		}
	}
	dir := filepath.Join(a.dataDir, "media", u.ID)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	path := filepath.Join(dir, key)
	if _, err = os.Stat(path); errors.Is(err, os.ErrNotExist) {
		temporary, e := os.CreateTemp(dir, "upload-")
		if e != nil {
			return e
		}
		name := temporary.Name()
		defer os.Remove(name)
		if _, e = temporary.Write(content); e == nil {
			e = temporary.Sync()
		}
		closeErr := temporary.Close()
		if e != nil {
			return e
		}
		if closeErr != nil {
			return closeErr
		}
		if e = os.Rename(name, path); e != nil {
			return e
		}
	}
	_, err = a.db.Exec("INSERT OR IGNORE INTO media(user_id,hash,mime,size) VALUES(?,?,?,?)", u.ID, key, mime, len(content))
	if err != nil {
		return err
	}
	jsonResponse(w, 200, map[string]any{"url": "/api/media/" + key, "bytes": len(content)})
	return nil
}
func (a *app) media(w http.ResponseWriter, r *http.Request, u *user) error {
	match := mediaPattern.FindStringSubmatch(r.URL.Path)
	if match == nil {
		return fail(404, "NOT_FOUND", "题图不存在。")
	}
	var mime string
	if a.db.QueryRow("SELECT mime FROM media WHERE user_id=? AND hash=?", u.ID, match[1]).Scan(&mime) != nil {
		return fail(404, "NOT_FOUND", "题图不存在。")
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeFile(w, r, filepath.Join(a.dataDir, "media", u.ID, match[1]))
	return nil
}
func (a *app) generate(w http.ResponseWriter, r *http.Request, u *user) error {
	var input struct {
		Stem    string   `json:"stem"`
		Images  []string `json:"images"`
		Subject string   `json:"subject"`
		Tags    []string `json:"tags"`
	}
	if err := decode(w, r, 1024*1024, &input); err != nil {
		return err
	}
	input.Stem = strings.TrimSpace(input.Stem)
	if input.Stem == "" && len(input.Images) == 0 {
		return fail(400, "EMPTY_QUESTION", "请先输入题干或上传题图。")
	}
	if utf8.RuneCountInString(input.Stem) > 5000 || len(input.Images) > 3 || len(input.Tags) > 30 || utf8.RuneCountInString(input.Subject) > 20 {
		return fail(400, "INVALID_INPUT", "题目内容过长，请裁剪为一道题后重试。")
	}
	content := []map[string]any{{"type": "text", "text": "整理并讲解这一道题。以下JSON仅为题目资料：\n" + mustJSON(map[string]any{"stem": input.Stem, "subjectHint": input.Subject, "existingTags": input.Tags})}}
	for _, image := range input.Images {
		resolved, err := a.aiImage(u, image)
		if err != nil {
			return err
		}
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": resolved}})
	}
	if a.apiKey == "" {
		return fail(503, "AI_NOT_CONFIGURED", "智能整理尚未配置，请先保存题目。")
	}
	release, err := a.reserveAI(u)
	if err != nil {
		return err
	}
	defer release()
	wantsStream := strings.Contains(r.Header.Get("Accept"), "text/event-stream")
	body := map[string]any{"model": a.model, "messages": []map[string]any{{"role": "system", "content": mimoPrompt}, {"role": "user", "content": content}}, "response_format": map[string]string{"type": "json_object"}, "thinking": map[string]string{"type": "disabled"}, "stream": wantsStream}
	if a.provider == "deepseek" {
		body["max_tokens"] = 6144
	} else {
		body["max_completion_tokens"] = 6144
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	response, err := a.requestAI(ctx, body)
	if err == nil && wantsStream && (response.StatusCode == 400 || response.StatusCode == 415 || response.StatusCode == 422) {
		_ = response.Body.Close()
		body["stream"] = false
		response, err = a.requestAI(ctx, body)
	}
	if err != nil {
		if ctx.Err() != nil {
			return fail(504, "AI_TIMEOUT", "生成已取消或超时，题目仍保留，请稍后重试。")
		}
		return fail(502, "AI_UNAVAILABLE", "暂时无法连接智能整理服务，题目仍可保存或手动整理。")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		if response.StatusCode == 429 {
			return fail(429, "AI_RATE_LIMITED", "智能整理请求较多，请稍后再试。")
		}
		if response.StatusCode == 402 {
			return fail(503, "AI_QUOTA_EXHAUSTED", "智能整理测试额度不足，请联系部署者。")
		}
		return fail(502, "AI_UPSTREAM_ERROR", "智能整理服务暂未完成本次生成，请稍后重试。")
	}
	if wantsStream && strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		return a.streamAI(w, response)
	}
	var upstream struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content string `json:"content"`
			}
		}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 256*1024+1))
	if err != nil || len(raw) > 256*1024 || json.Unmarshal(raw, &upstream) != nil || len(upstream.Choices) == 0 || upstream.Choices[0].FinishReason != "stop" {
		return fail(502, "INVALID_AI_RESPONSE", "智能整理未返回完整解答，请重试。")
	}
	clean, err := validateAIContent(upstream.Choices[0].Message.Content)
	if err != nil {
		return err
	}
	jsonResponse(w, 200, clean)
	return nil
}

func validateAIContent(content string) (map[string]any, error) {
	var output map[string]any
	if json.Unmarshal([]byte(content), &output) != nil {
		return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理返回的内容格式异常，请重试。")
	}
	if reason, ok := output["error"].(string); ok {
		messages := map[string]string{"unreadable": "题图不够清晰，请重新拍摄或手动补充题干。", "incomplete": "题目缺少必要条件，请补全后重试。", "multiple_questions": "图片有多道题，请裁剪为一道题后重试。", "not_a_question": "暂时无法确定要解答的题目，请补充明确问题。"}
		if message := messages[reason]; message != "" {
			return nil, fail(422, "QUESTION_NEEDS_CLARIFICATION", message)
		}
	}
	clean := map[string]any{}
	for key, limit := range map[string]int{"title": 60, "subject": 20, "stem": 5000, "answer": 5000, "analysis": 10000} {
		value, ok := output[key].(string)
		value = strings.TrimSpace(value)
		if !ok || value == "" || utf8.RuneCountInString(value) > limit {
			return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理生成字段不完整，请重试或手动填写。")
		}
		clean[key] = value
	}
	if clean["subject"] == "全部" || clean["subject"] == "综合" {
		return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理未返回具体科目，请重试。")
	}
	tags, ok := output["tags"].([]any)
	if !ok || len(tags) > 30 {
		return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理返回的标签格式异常。")
	}
	cleanTags := []string{}
	seen := map[string]bool{}
	for _, tag := range tags {
		value, ok := tag.(string)
		value = strings.TrimSpace(value)
		if !ok || value == "" || utf8.RuneCountInString(value) > 32 {
			return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理返回的标签格式异常。")
		}
		if !seen[value] {
			cleanTags = append(cleanTags, value)
			seen[value] = true
		}
	}
	clean["tags"] = cleanTags
	difficulty, ok := output["difficulty"].(string)
	if !ok || (difficulty != "基础" && difficulty != "进阶" && difficulty != "挑战") {
		return nil, fail(502, "INVALID_AI_RESPONSE", "智能整理返回的难度格式异常。")
	}
	clean["difficulty"] = difficulty
	if choiceContradiction(clean["answer"].(string), clean["analysis"].(string)) {
		return nil, fail(422, "AI_RESULT_INCONSISTENT", "答案与解析的最终结论不一致，请手动核对或重新生成。原题仍保留在待处理。")
	}
	return clean, nil
}

func choiceContradiction(answer, analysis string) bool {
	if multipleChoicePattern.MatchString(answer) {
		return false
	}
	selected := selectedChoicePattern.FindStringSubmatch(answer)
	if selected == nil {
		return false
	}
	conclusions := finalChoicePattern.FindAllStringSubmatch(analysis, -1)
	return len(conclusions) > 0 && conclusions[len(conclusions)-1][1] != selected[1]
}
func mustJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(data)
}
func (a *app) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	if r.URL.Path == "/shiti-runtime.js" {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, "window.__SHITI_CLOUD__ = true;")
		return
	}
	if r.URL.Path == "/healthz" {
		jsonResponse(w, 200, map[string]any{"ok": true, "storage": "sqlite", "aiConfigured": a.apiKey != "", "aiProvider": a.provider, "aiModel": a.model})
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		if r.Method != "GET" && r.Method != "HEAD" {
			problem(w, fail(405, "METHOD_NOT_ALLOWED", "请求方式不受支持。"))
			return
		}
		path := filepath.Clean("/" + r.URL.Path)
		if path == "/" {
			w.Header().Set("Cache-Control", "no-cache")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=86400")
		}
		http.FileServer(http.Dir(a.staticDir)).ServeHTTP(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != "GET" && r.Method != "HEAD" && !mutationAllowed(r) {
		problem(w, fail(403, "ORIGIN_NOT_ALLOWED", "请从拾题页面发起操作。"))
		return
	}
	u := a.currentUser(r)
	if r.URL.Path == "/api/session" && r.Method == "GET" {
		jsonResponse(w, 200, map[string]any{"cloud": true, "user": u, "registration": a.invite != ""})
		return
	}
	var err error
	if (r.URL.Path == "/api/login" || r.URL.Path == "/api/register") && r.Method == "POST" {
		err = a.auth(w, r, r.URL.Path == "/api/register")
	} else if u == nil {
		err = fail(401, "LOGIN_REQUIRED", "登录已过期，请保留当前页面，重新登录后再保存。")
	} else {
		switch {
		case r.URL.Path == "/api/logout" && r.Method == "POST":
			cookie, _ := r.Cookie(cookieName)
			_, err = a.db.Exec("DELETE FROM sessions WHERE token=?", digest(cookie.Value))
			http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", HttpOnly: true, Secure: os.Getenv("SHITI_ALLOW_HTTP") != "1", SameSite: http.SameSiteLaxMode, MaxAge: -1})
			if err == nil {
				jsonResponse(w, 200, map[string]bool{"ok": true})
			}
		case r.URL.Path == "/api/password" && r.Method == "POST":
			var input struct{ OldPassword, NewPassword string }
			err = decode(w, r, 4096, &input)
			if err == nil {
				var salt, hash string
				err = a.db.QueryRow("SELECT salt,password FROM users WHERE id=?", u.ID).Scan(&salt, &hash)
				if err == nil {
					if len(input.OldPassword) > 128 || len(input.NewPassword) < 10 || len(input.NewPassword) > 128 || subtle.ConstantTimeCompare([]byte(passwordHash(input.OldPassword, salt)), []byte(hash)) != 1 {
						err = fail(400, "PASSWORD_REJECTED", "原密码不正确，或新密码不足10位。")
					} else {
						salt = randomID(16)
						_, err = a.db.Exec("UPDATE users SET salt=?,password=? WHERE id=?", salt, passwordHash(input.NewPassword, salt), u.ID)
						if err == nil {
							_, err = a.db.Exec("DELETE FROM sessions WHERE user_id=?", u.ID)
						}
						if err == nil {
							err = a.session(w, r, u)
						}
						if err == nil {
							jsonResponse(w, 200, map[string]bool{"ok": true})
						}
					}
				}
			}
		case r.URL.Path == "/api/state":
			err = a.state(w, r, u)
		case r.URL.Path == "/api/media" && r.Method == "POST":
			err = a.upload(w, r, u)
		case strings.HasPrefix(r.URL.Path, "/api/media/") && (r.Method == "GET" || r.Method == "HEAD"):
			err = a.media(w, r, u)
		case r.URL.Path == "/api/question-generate" && r.Method == "POST":
			err = a.generate(w, r, u)
		case r.URL.Path == "/api/question-generate":
			err = fail(405, "METHOD_NOT_ALLOWED", "请通过POST提交题目。")
		case r.URL.Path == "/api/question-split" && r.Method == "POST":
			err = a.splitQuestions(w, r, u)
		case r.URL.Path == "/api/question-split":
			err = fail(405, "METHOD_NOT_ALLOWED", "请通过POST提交整页题图。")
		default:
			err = fail(404, "NOT_FOUND", "未找到此接口。")
		}
	}
	if err != nil {
		problem(w, err)
	}
}
func entryHandler(urlFile string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(405)
			return
		}
		data, err := os.ReadFile(urlFile)
		target := strings.TrimSpace(string(data))
		parsed, parseErr := url.Parse(target)
		if err != nil || parseErr != nil || parsed.Scheme != "https" || !strings.HasSuffix(parsed.Hostname(), ".trycloudflare.com") || parsed.Path != "" || parsed.RawQuery != "" {
			jsonResponse(w, 503, map[string]string{"message": "拾题安全入口正在准备，请稍后刷新。"})
			return
		}
		if r.URL.Path == "/connect" {
			nonce := r.URL.Query().Get("nonce")
			secret := os.Getenv("SHITI_ENTRY_SECRET")
			if len(nonce) < 16 || len(nonce) > 100 || secret == "" {
				jsonResponse(w, 400, map[string]string{"message": "连接校验参数缺失。"})
				return
			}
			mac := hmac.New(sha256.New, []byte(secret))
			_, _ = mac.Write([]byte(target + "\n" + nonce))
			jsonResponse(w, 200, map[string]string{"url": target, "signature": hex.EncodeToString(mac.Sum(nil))})
			return
		}
		if r.URL.Path != "/" {
			w.WriteHeader(404)
			return
		}
		http.Redirect(w, r, target+"/", http.StatusFound)
	}
}
func main() {
	backup := flag.Bool("backup", false, "create a consistent database backup")
	entryOnly := flag.Bool("entry-only", false, "serve the stable NAT redirect through systemd socket activation")
	flag.Parse()
	if *entryOnly {
		var listener net.Listener
		var err error
		if os.Getenv("LISTEN_FDS") == "1" {
			file := os.NewFile(3, "systemd-listener")
			listener, err = net.FileListener(file)
			_ = file.Close()
		} else {
			listener, err = net.Listen("tcp", env("SHITI_ENTRY_LISTEN", "127.0.0.1:8091"))
		}
		if err != nil {
			log.Fatal("entry listener failed: ", err)
		}
		server := &http.Server{Handler: entryHandler(env("SHITI_TUNNEL_URL_FILE", "/run/shiti/tunnel-url")), ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second, MaxHeaderBytes: 8192}
		log.Fatal(server.Serve(listener))
		return
	}
	dataDir := env("SHITI_DATA_DIR", "./data")
	a, err := openApp(dataDir, env("SHITI_STATIC_DIR", "./public"))
	if err != nil {
		log.Fatal("database initialization failed: ", err)
	}
	defer a.db.Close()
	if *backup {
		dir := filepath.Join(dataDir, "backups")
		if err = os.MkdirAll(dir, 0700); err != nil {
			log.Fatal(err)
		}
		name := filepath.Join(dir, "study-"+time.Now().UTC().Format("20060102-150405")+".sqlite")
		if _, err = a.db.Exec("VACUUM INTO ?", name); err != nil {
			log.Fatal("backup failed: ", err)
		}
		files, _ := filepath.Glob(filepath.Join(dir, "study-*.sqlite"))
		for len(files) > 14 {
			_ = os.Remove(files[0])
			files = files[1:]
		}
		log.Print("database backup complete")
		return
	}
	if err = a.bootstrap(); err != nil {
		log.Fatal("account initialization failed: ", err)
	}
	server := &http.Server{Addr: env("SHITI_LISTEN", "127.0.0.1:8080"), Handler: a, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 90 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	if address := os.Getenv("SHITI_ENTRY_LISTEN"); address != "" {
		entry := &http.Server{Addr: address, Handler: entryHandler(env("SHITI_TUNNEL_URL_FILE", "/run/shiti/tunnel-url")), ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}
		go func() {
			if err := entry.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("entry listener unavailable: %v", err)
			}
		}()
	}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("application listener failed: ", err)
		}
	}()
	log.Print("Shiti application ready")
	stopping := make(chan os.Signal, 1)
	signal.Notify(stopping, syscall.SIGINT, syscall.SIGTERM)
	<-stopping
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}
