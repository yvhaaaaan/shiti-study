package main

import (
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"
)

// Older clients may omit notebooks. When supplied, preserve empty books and
// require every explicit question reference to resolve within this snapshot.
func validateNotebooks(data map[string]json.RawMessage) error {
	if data["notebooks"] == nil {
		return nil
	}
	var books []struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Audience  string `json:"audience"`
		CoverID   string `json:"coverId"`
		Subject   string `json:"subject"`
		CreatedAt string `json:"createdAt"`
		UpdatedAt string `json:"updatedAt"`
	}
	if json.Unmarshal(data["notebooks"], &books) != nil || books == nil || len(books) > 2000 {
		return fail(400, "INVALID_NOTEBOOKS", "错题本列表无效或超过数量限制。")
	}
	ids := map[string]bool{}
	for _, book := range books {
		if strings.TrimSpace(book.ID) == "" || len(book.ID) > 200 || ids[book.ID] || strings.TrimSpace(book.Title) == "" || utf8.RuneCountInString(book.Title) > 40 || len(book.CoverID) == 0 || len(book.CoverID) > 60 || utf8.RuneCountInString(book.Subject) > 20 {
			return fail(400, "INVALID_NOTEBOOKS", "错题本名称、封面或标识无效。")
		}
		if book.Audience != "k12" && book.Audience != "computer" && book.Audience != "civil" && book.Audience != "general" {
			return fail(400, "INVALID_NOTEBOOKS", "错题本学习方向无效。")
		}
		if _, err := time.Parse(time.RFC3339Nano, book.CreatedAt); err != nil {
			return fail(400, "INVALID_NOTEBOOKS", "错题本创建日期无效。")
		}
		if _, err := time.Parse(time.RFC3339Nano, book.UpdatedAt); err != nil {
			return fail(400, "INVALID_NOTEBOOKS", "错题本修改日期无效。")
		}
		ids[book.ID] = true
	}
	var questions []map[string]json.RawMessage
	if json.Unmarshal(data["questions"], &questions) != nil {
		return fail(400, "INVALID_STATE", "题目列表无效。")
	}
	for _, question := range questions {
		if question["notebookId"] == nil {
			continue
		}
		var id string
		if json.Unmarshal(question["notebookId"], &id) != nil || !ids[id] {
			return fail(400, "INVALID_NOTEBOOK_REFERENCE", "题目引用的错题本不存在。")
		}
	}
	return nil
}
