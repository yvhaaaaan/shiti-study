package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Keep a cursor after each complete question. JSON decoding handles quoted
// braces, escaped quotes, Unicode and chunk boundaries without guessing where
// a partially received question ends.
type splitProgress struct {
	started   bool
	cursor    int
	separator bool
	closed    bool
	questions []splitQuestion
}

func incompleteJSON(err error) bool {
	return errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF)
}

func (p *splitProgress) append(content string, emit func(int, splitQuestion) error) error {
	if !p.started {
		decoder := json.NewDecoder(strings.NewReader(content))
		token, err := decoder.Token()
		if incompleteJSON(err) {
			return nil
		}
		if err != nil || token != json.Delim('{') {
			return errors.New("invalid split root")
		}
		for decoder.More() {
			key, err := decoder.Token()
			if incompleteJSON(err) {
				return nil
			}
			if err != nil {
				return err
			}
			if key == "questions" {
				token, err = decoder.Token()
				if incompleteJSON(err) {
					return nil
				}
				if err != nil || token != json.Delim('[') {
					return errors.New("invalid questions array")
				}
				p.started, p.cursor = true, int(decoder.InputOffset())
				break
			}
			var ignored json.RawMessage
			if err = decoder.Decode(&ignored); incompleteJSON(err) {
				return nil
			} else if err != nil {
				return err
			}
		}
		if !p.started {
			return nil
		}
	}
	for !p.closed {
		for p.cursor < len(content) && strings.ContainsRune(" \t\r\n", rune(content[p.cursor])) {
			p.cursor++
		}
		if p.cursor == len(content) {
			return nil
		}
		if content[p.cursor] == ']' {
			p.closed = true
			return nil
		}
		if p.separator {
			if content[p.cursor] != ',' {
				return errors.New("missing question separator")
			}
			p.cursor++
			p.separator = false
			continue
		}
		decoder := json.NewDecoder(strings.NewReader(content[p.cursor:]))
		var question splitQuestion
		if err := decoder.Decode(&question); incompleteJSON(err) {
			return nil
		} else if err != nil {
			return err
		}
		if err := validateSplitQuestion(&question); err != nil {
			return err
		}
		if len(p.questions) >= 20 {
			return errors.New("too many questions")
		}
		index := len(p.questions)
		p.questions = append(p.questions, question)
		p.cursor += int(decoder.InputOffset())
		p.separator = true
		if err := emit(index, question); err != nil {
			return err
		}
	}
	return nil
}

func streamSplitQuestions(w http.ResponseWriter, response *http.Response) error {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	send := func(event string, value any) error {
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, mustJSON(value)); err != nil {
			return err
		}
		return http.NewResponseController(w).Flush()
	}
	reject := func(err error) {
		var item *apiError
		if !errors.As(err, &item) {
			item = &apiError{502, "INVALID_AI_RESPONSE", "拆题中断或结果不完整。已显示的题目和原图仍保留，请核对后继续。"}
		}
		_ = send("error", map[string]any{"error": map[string]string{"code": item.Code, "message": item.Message}})
	}
	if err := send("open", map[string]bool{"ok": true}); err != nil {
		return nil
	}
	scanner := bufio.NewScanner(io.LimitReader(response.Body, 2*1024*1024+1))
	scanner.Buffer(make([]byte, 4096), 512*1024)
	var content strings.Builder
	progress := &splitProgress{}
	var data []string
	finished, finishReason := false, ""
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
					return errors.New("split output too large")
				}
				content.WriteString(choice.Delta.Content)
				if err := progress.append(content.String(), func(index int, question splitQuestion) error {
					return send("question", map[string]any{"index": index, "question": question})
				}); err != nil {
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
		reject(errors.New("incomplete split stream"))
		return nil
	}
	questions, err := validateSplitContent(content.String())
	if err != nil {
		reject(err)
		return nil
	}
	if len(progress.questions) != len(questions) {
		reject(errors.New("split preview mismatch"))
		return nil
	}
	for i := range questions {
		if progress.questions[i] != questions[i] {
			reject(errors.New("split preview mismatch"))
			return nil
		}
	}
	_ = send("done", map[string]any{"questions": questions})
	return nil
}
