package main

import (
	"encoding/json"
	"testing"
)

func TestNotebookSnapshots(t *testing.T) {
	book := map[string]any{"id": "book-a", "title": "数据结构错题本", "audience": "computer", "coverId": "algorithms", "subject": "计算机", "createdAt": "2026-11-05T01:00:00Z", "updatedAt": "2026-11-05T01:00:00Z"}
	check := func(data map[string]any) error {
		bytes, _ := json.Marshal(data)
		var raw map[string]json.RawMessage
		_ = json.Unmarshal(bytes, &raw)
		return validateNotebooks(raw)
	}
	if err := check(stateData([]string{})); err != nil {
		t.Fatal("legacy snapshot rejected", err)
	}
	data := stateData([]string{})
	data["notebooks"] = []any{book}
	if err := check(data); err != nil {
		t.Fatal("empty custom notebook rejected", err)
	}
	data["questions"].([]any)[0].(map[string]any)["notebookId"] = "book-a"
	if err := check(data); err != nil {
		t.Fatal("valid notebook reference rejected", err)
	}
	data["questions"].([]any)[0].(map[string]any)["notebookId"] = "missing"
	if err := check(data); err == nil {
		t.Fatal("orphan notebook reference accepted")
	}
	data["questions"] = []any{}
	data["notebooks"] = []any{book, book}
	if err := check(data); err == nil {
		t.Fatal("duplicate notebook IDs accepted")
	}
}
