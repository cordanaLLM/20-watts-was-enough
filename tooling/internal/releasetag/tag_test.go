package releasetag

import (
	"regexp"
	"testing"
)

func TestPattern(t *testing.T) {
	t.Parallel()
	pattern := regexp.MustCompile(Pattern)
	for _, test := range []struct {
		tag   string
		valid bool
	}{
		{"v0.0.0", true},
		{"v0.5.0", true},
		{"v12.34.56", true},
		{"v0.0.0-rc.0", true},
		{"v0.5.0-rc.1", true},
		{"v0.5.0-rc.10", true},
		{"v999999999999999999999.0.0-rc.999999999999999999999", true},
		{"", false},
		{"0.5.0", false},
		{"v0.5.0-rc", false},
		{"v0.5.0-rc.01", false},
		{"v0.5.0-rc.1.2", false},
		{"v0.5.0-beta.1", false},
		{"v0.5.0-RC.1", false},
		{"v05.0.0", false},
		{"v0.05.0", false},
		{"v0.5.00", false},
		{"v0.5.0+meta", false},
		{"v0.5.0-rc.1-x", false},
		{"v0.5.0-rc.-1", false},
		{"v0.5.0-rc.", false},
		{"v0.5.0\n", false},
		{" v0.5.0", false},
		{"v0.5.0 ", false},
	} {
		if got := pattern.MatchString(test.tag); got != test.valid {
			t.Errorf("tag %q: valid = %t, want %t", test.tag, got, test.valid)
		}
	}
}
