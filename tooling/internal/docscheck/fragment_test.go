package docscheck

import (
	"testing"
)

func TestFragmentValidationPositive(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		targetFile string
		content    string
		link       string
	}{
		{
			name:       "valid heading slug",
			targetFile: "docs/target.md",
			content:    "# Target Document\n\n## Section Overview\n",
			link:       "[overview](docs/target.md#section-overview)\n",
		},
		{
			name:       "duplicate -1",
			targetFile: "docs/target.md",
			content:    "# Target\n\n## Details\n\nFirst.\n\n## Details\n\nSecond.\n",
			link:       "[second details](docs/target.md#details-1)\n",
		},
		{
			name:       "explicit <a id>",
			targetFile: "docs/target.md",
			content:    "# Target\n\n<a id=\"custom-anchor\"></a>\n",
			link:       "[custom](docs/target.md#custom-anchor)\n",
		},
		{
			name:       "same-file #frag",
			targetFile: "README.md",
			content:    "# Readme\n\n## Local Section\n\n[jump](#local-section)\n",
			link:       "",
		},
		{
			name:       "unicode heading",
			targetFile: "docs/target.md",
			content:    "# Target\n\n## Über die Brücke\n",
			link:       "[unicode](docs/target.md#über-die-brücke)\n",
		},
		{
			name:       "heading with code and punctuation",
			targetFile: "docs/target.md",
			content:    "# Target\n\n## 6.2 `Changes` and history!\n",
			link:       "[history](docs/target.md#62-changes-and-history)\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			writeFile(t, root, test.targetFile, test.content)
			if test.link != "" {
				writeFile(t, root, "README.md", test.link)
			}
			result := validateFixture(root)
			if len(result.Errors) != 0 {
				t.Fatalf("Validate() errors = %v, want none", result.Errors)
			}
		})
	}
}

func TestFragmentValidationNegative(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name          string
		mutate        func(t *testing.T, root string)
		wantSubstring string
	}{
		{
			name: "missing fragment cross-file",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "docs/target.md", "# Target\n\n## Real Section\n")
				writeFile(t, root, "README.md", "[broken](docs/target.md#missing-section)\n")
			},
			wantSubstring: "Broken link fragment in README.md: docs/target.md#missing-section",
		},
		{
			name: "missing fragment same-file",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "# Readme\n\n[broken](#missing-local-anchor)\n")
			},
			wantSubstring: "Broken link fragment in README.md: #missing-local-anchor",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			test.mutate(t, root)
			result := validateFixture(root)
			if !containsDiagnostic(result.Errors, test.wantSubstring) {
				t.Fatalf("Validate() errors = %v, want diagnostic containing %q", result.Errors, test.wantSubstring)
			}
		})
	}
}

func TestFragmentValidationBoundary(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(t *testing.T, root string) options
	}{
		{
			name: "empty fragment file.md#",
			mutate: func(t *testing.T, root string) options {
				writeFile(t, root, "docs/target.md", "# Target\n")
				writeFile(t, root, "README.md", "[target](docs/target.md#)\n")
				return options{today: testToday}
			},
		},
		{
			name: "non-.md target with fragment skipped",
			mutate: func(t *testing.T, root string) options {
				writeFile(t, root, "data/schema.json", "{\"$id\": \"https://example.com/schema\"}\n")
				writeFile(t, root, "README.md", "[schema](data/schema.json#definitions)\n")
				return options{today: testToday}
			},
		},
		{
			name: "exception admits",
			mutate: func(t *testing.T, root string) options {
				writeFile(t, root, "docs/target.md", "# Target\n")
				writeFile(t, root, "README.md", "[broken](docs/target.md#not-there)\n")
				return options{
					today: testToday,
					linkExceptions: []linkException{
						{
							Path:    "README.md",
							Target:  "docs/target.md#not-there",
							Reason:  "legacy fragment exception",
							Expires: testLastDay,
						},
					},
				}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			opts := test.mutate(t, root)
			result := validateWith(root, opts)
			if len(result.Errors) != 0 {
				t.Fatalf("Validate() errors = %v, want none", result.Errors)
			}
		})
	}
}
