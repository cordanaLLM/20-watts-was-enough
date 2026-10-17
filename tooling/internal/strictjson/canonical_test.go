package strictjson

import (
	"encoding/json"
	"testing"
)

func TestCanonical(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name  string
		value any
		want  string
	}{
		{"indented with final newline", map[string]any{"outer": map[string]int{"value": 1}}, "{\n  \"outer\": {\n    \"value\": 1\n  }\n}\n"},
		{"unescaped HTML", "<>&", "\"<>&\"\n"},
		{"nil", nil, "null\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := Canonical(test.value)
			if err != nil {
				t.Fatalf("Canonical() error = %v", err)
			}
			if string(got) != test.want {
				t.Fatalf("Canonical() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestCanonicalReturnsUnwrappedEncodingError(t *testing.T) {
	t.Parallel()
	body, err := Canonical(make(chan int))
	if _, ok := err.(*json.UnsupportedTypeError); !ok {
		t.Fatalf("Canonical() error = %T (%v), want unwrapped *json.UnsupportedTypeError", err, err)
	}
	if body != nil {
		t.Fatalf("Canonical() = %q, want nil on error", body)
	}
}
