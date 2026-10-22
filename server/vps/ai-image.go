package main

import (
	"encoding/base64"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Resolve only this account's immutable media. Private routes are never sent to
// the provider as URLs, and resolving them does not make an HTTP request.
func (a *app) aiImage(u *user, source string) (string, error) {
	if match := mediaPattern.FindStringSubmatch(source); match != nil {
		notFound := func() (string, error) {
			return "", fail(404, "NOT_FOUND", "题图不存在或无法读取，请重新添加。")
		}
		if u == nil || u.ID == "" || filepath.Base(u.ID) != u.ID {
			return notFound()
		}
		var mime string
		var size int64
		if a.db.QueryRow("SELECT mime,size FROM media WHERE user_id=? AND hash=?", u.ID, match[1]).Scan(&mime, &size) != nil || size <= 0 || size > mediaLimit {
			return notFound()
		}
		if mime != "image/png" && mime != "image/jpeg" && mime != "image/webp" {
			return notFound()
		}
		accountDir := filepath.Join(a.dataDir, "media", u.ID)
		for _, dir := range []string{filepath.Join(a.dataDir, "media"), accountDir} {
			info, err := os.Lstat(dir)
			if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return notFound()
			}
		}
		path := filepath.Join(accountDir, match[1])
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() != size {
			return notFound()
		}
		root, err := os.OpenRoot(accountDir)
		if err != nil {
			return notFound()
		}
		defer root.Close()
		file, err := root.Open(match[1])
		if err != nil {
			return notFound()
		}
		defer file.Close()
		raw, err := io.ReadAll(io.LimitReader(file, mediaLimit+1))
		if err != nil || int64(len(raw)) != size || http.DetectContentType(raw) != mime {
			return notFound()
		}
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
	}
	comma := strings.IndexByte(source, ',')
	if comma < 0 {
		return "", fail(400, "INVALID_IMAGE", "题图格式无效，请重新上传。")
	}
	header := source[:comma]
	if header != "data:image/png;base64" && header != "data:image/jpeg;base64" && header != "data:image/webp;base64" {
		return "", fail(400, "INVALID_IMAGE", "题图格式无效，请重新上传。")
	}
	raw, err := base64.StdEncoding.DecodeString(source[comma+1:])
	if err != nil || len(raw) > mediaLimit || http.DetectContentType(raw) != strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64") {
		return "", fail(400, "INVALID_IMAGE", "题图内容无效，请重新上传。")
	}
	return source, nil
}
