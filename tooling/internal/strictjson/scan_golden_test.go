package strictjson

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"testing"
)

// goldenCase is one Validate input with the exact error the recursive scan
// returned before the scan moved to an explicit stack; "" means accepted.
type goldenCase struct {
	name  string
	body  string
	depth int
	want  string
}

func goldenCases() []goldenCase {
	items := func(n int) string { return "[" + strings.TrimSuffix(strings.Repeat("0,", n), ",") + "]" }
	members := func(n int) string {
		var builder strings.Builder
		builder.WriteByte('{')
		for i := 0; i < n; i++ {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(`"m`)
			builder.WriteString(strconv.Itoa(i))
			builder.WriteString(`":0`)
		}
		builder.WriteByte('}')
		return builder.String()
	}
	return []goldenCase{
		{"scalar", `7`, 1, ""},
		{"mixed", `{"outer":{"name":"value"},"items":[1,true,null,{"a":[]}]}`, 8, ""},
		{"depth at limit", `[[[]]]`, 3, ""},
		{"depth over limit", `[[[]]]`, 2, "JSON nesting exceeds the 2-level limit"},
		{"object depth over limit", `{"a":{"b":{}}}`, 2, "JSON nesting exceeds the 2-level limit"},
		{"deep duplicate", `[{"a":[{"x":1,"x":2}]}]`, 8, `JSON object repeats name "x"`},
		{"duplicate after nested value", `{"a":{"a":1},"a":2}`, 8, `JSON object repeats name "a"`},
		{"same name in sibling objects", `[{"a":1},{"a":2}]`, 8, ""},
		{"trailing value", `{} {}`, 8, "JSON contains trailing data"},
		{"trailing garbage", `[] x`, 8, "read trailing JSON: invalid character 'x' looking for beginning of value"},
		{"empty body", ``, 8, "decode JSON token: EOF"},
		{"truncated array", `[1,`, 8, "decode JSON token: unexpected end of JSON input"},
		{"truncated object", `{"a"`, 8, "decode JSON token: EOF"},
		{"mismatched close", `[1}`, 8, "close JSON container: invalid character '}' after array element"},
		{"non-string name", `{1:2}`, 8, "decode JSON object name: object member name must be a string"},
		{"array items at limit", items(maximumContainerEntries), 2, ""},
		{"array items over limit", items(maximumContainerEntries + 1), 2, "JSON array exceeds its item limit"},
		{"object members at limit", members(maximumContainerEntries), 2, ""},
		{"object members over limit", members(maximumContainerEntries + 1), 2, "JSON object exceeds its member limit"},
	}
}

func TestValidateKeepsTheRecursiveScanErrors(t *testing.T) {
	t.Parallel()
	for _, c := range goldenCases() {
		err := Validate([]byte(c.body), c.depth)
		got := ""
		if err != nil {
			got = err.Error()
		}
		if got != c.want {
			t.Errorf("%s: Validate error = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestScanValueStopsAtItsStepBound(t *testing.T) {
	t.Parallel()
	// [1] takes three steps: open, read 1, close.
	for _, c := range []struct {
		steps int
		want  string
	}{{2, ""}, {1, "JSON scan exceeds its token bound"}} {
		decoder := json.NewDecoder(bytes.NewReader([]byte(`[1]`)))
		err := scanValue(decoder, 8, c.steps)
		got := ""
		if err != nil {
			got = err.Error()
		}
		if got != c.want {
			t.Errorf("scanValue with %d steps = %q, want %q", c.steps, got, c.want)
		}
	}
}
