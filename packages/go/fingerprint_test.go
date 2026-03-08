// ---------------------------------------------------------------------------
// uncaught-go — fingerprint contract tests
// ---------------------------------------------------------------------------
//
// These tests load the shared contract vectors from
// contracts/fixtures/fingerprint-vectors.json and verify that the Go
// implementation produces identical results to the TypeScript SDK.
// ---------------------------------------------------------------------------

package uncaught

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// ---------------------------------------------------------------------------
// JSON structures matching the contract file
// ---------------------------------------------------------------------------

type vectorFile struct {
	FingerprintVectors []fingerprintVector `json:"fingerprintVectors"`
	RawDjb2Vectors     []rawDjb2Vector     `json:"rawDjb2Vectors"`
}

type fingerprintVector struct {
	Description               string          `json:"description"`
	Input                     fingerprintInput `json:"input"`
	ExpectedNormalizedMessage string          `json:"expectedNormalizedMessage,omitempty"`
	ExpectedFrames            []string        `json:"expectedFrames,omitempty"`
	ExpectedFingerprint       string          `json:"expectedFingerprint"`
}

type fingerprintInput struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Stack   string `json:"stack"`
}

type rawDjb2Vector struct {
	Description string `json:"description"`
	Input       string `json:"input"`
	Expected    string `json:"expected"`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// loadVectors reads the contract fixture file relative to this test file.
func loadVectors(t *testing.T) vectorFile {
	t.Helper()

	// Find the path relative to this test file
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to determine test file path")
	}

	// Navigate from packages/go/ to contracts/fixtures/
	contractPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "contracts", "fixtures", "fingerprint-vectors.json")
	data, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("failed to read contract vectors: %v (path: %s)", err, contractPath)
	}

	var vectors vectorFile
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatalf("failed to parse contract vectors: %v", err)
	}

	return vectors
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestRawDjb2Vectors(t *testing.T) {
	vectors := loadVectors(t)

	for _, v := range vectors.RawDjb2Vectors {
		t.Run(v.Description, func(t *testing.T) {
			got := Djb2(v.Input)
			if got != v.Expected {
				t.Errorf("Djb2(%q) = %q, want %q", v.Input, got, v.Expected)
			}
		})
	}
}

func TestFingerprintVectors(t *testing.T) {
	vectors := loadVectors(t)

	for _, v := range vectors.FingerprintVectors {
		t.Run(v.Description, func(t *testing.T) {
			// Test normalised message if expected value is provided
			if v.ExpectedNormalizedMessage != "" {
				gotMsg := NormaliseMessage(v.Input.Message)
				if gotMsg != v.ExpectedNormalizedMessage {
					t.Errorf("NormaliseMessage(%q) = %q, want %q",
						v.Input.Message, gotMsg, v.ExpectedNormalizedMessage)
				}
			}

			// Test frame extraction if expected frames are provided
			if v.ExpectedFrames != nil {
				gotFrames := ExtractTopFrames(v.Input.Stack, 3)
				if len(gotFrames) != len(v.ExpectedFrames) {
					t.Errorf("ExtractTopFrames() returned %d frames, want %d\n  got:  %v\n  want: %v",
						len(gotFrames), len(v.ExpectedFrames), gotFrames, v.ExpectedFrames)
				} else {
					for i, expected := range v.ExpectedFrames {
						if gotFrames[i] != expected {
							t.Errorf("ExtractTopFrames()[%d] = %q, want %q", i, gotFrames[i], expected)
						}
					}
				}
			}

			// Test the full fingerprint
			errType := v.Input.Type
			got := GenerateFingerprint(errType, v.Input.Message, v.Input.Stack)
			if got != v.ExpectedFingerprint {
				t.Errorf("GenerateFingerprint(%q, %q, ...) = %q, want %q",
					errType, v.Input.Message, got, v.ExpectedFingerprint)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Additional unit tests for edge cases
// ---------------------------------------------------------------------------

func TestDjb2EmptyString(t *testing.T) {
	got := Djb2("")
	if got != "00001505" {
		t.Errorf("Djb2(\"\") = %q, want \"00001505\"", got)
	}
}

func TestNormaliseMessageUUID(t *testing.T) {
	msg := "User 550e8400-e29b-41d4-a716-446655440000 not found"
	got := NormaliseMessage(msg)
	want := "User <UUID> not found"
	if got != want {
		t.Errorf("NormaliseMessage(%q) = %q, want %q", msg, got, want)
	}
}

func TestNormaliseMessageHex(t *testing.T) {
	msg := "Invalid token abcdef0123456789"
	got := NormaliseMessage(msg)
	want := "Invalid token <HEX>"
	if got != want {
		t.Errorf("NormaliseMessage(%q) = %q, want %q", msg, got, want)
	}
}

func TestNormaliseMessageNumbers(t *testing.T) {
	msg := "Transaction 123456789 failed"
	got := NormaliseMessage(msg)
	// 123456789 is all digits which are valid hex chars, and it's 9 chars long (>= 8)
	// So hex regex catches it first
	want := "Transaction <HEX> failed"
	if got != want {
		t.Errorf("NormaliseMessage(%q) = %q, want %q", msg, got, want)
	}
}

func TestExtractTopFramesV8(t *testing.T) {
	stack := "TypeError: Cannot read property foo of undefined\n    at processTickets (/app/src/handlers.js:42:10)\n    at Object.<anonymous> (/app/src/index.js:15:3)"
	frames := ExtractTopFrames(stack, 3)

	expected := []string{"handlers.js:processTickets", "index.js:Object.<anonymous>"}
	if len(frames) != len(expected) {
		t.Fatalf("expected %d frames, got %d: %v", len(expected), len(frames), frames)
	}
	for i, want := range expected {
		if frames[i] != want {
			t.Errorf("frame[%d] = %q, want %q", i, frames[i], want)
		}
	}
}

func TestExtractTopFramesSpiderMonkey(t *testing.T) {
	stack := "handleClick@http://localhost:3000/static/js/main.js:42:15\nrender@http://localhost:3000/static/js/main.js:100:7"
	frames := ExtractTopFrames(stack, 3)

	expected := []string{"main.js:handleClick", "main.js:render"}
	if len(frames) != len(expected) {
		t.Fatalf("expected %d frames, got %d: %v", len(expected), len(frames), frames)
	}
	for i, want := range expected {
		if frames[i] != want {
			t.Errorf("frame[%d] = %q, want %q", i, frames[i], want)
		}
	}
}

func TestExtractTopFramesGoStack(t *testing.T) {
	stack := "goroutine 1 [running]:\nmain.handler(0xc0000b6000)\n\t/app/main.go:42 +0x1a3\nnet/http.HandlerFunc.ServeHTTP(0x6f4e80, 0xc0000b6000, 0xc0000b4000)\n\t/usr/local/go/src/net/http/server.go:2084 +0x44"
	frames := ExtractTopFrames(stack, 3)

	if len(frames) != 2 {
		t.Fatalf("expected 2 frames, got %d: %v", len(frames), frames)
	}
	if frames[0] != "main.go:main.handler" {
		t.Errorf("frame[0] = %q, want %q", frames[0], "main.go:main.handler")
	}
	if frames[1] != "server.go:http.HandlerFunc.ServeHTTP" {
		t.Errorf("frame[1] = %q, want %q", frames[1], "server.go:http.HandlerFunc.ServeHTTP")
	}
}
