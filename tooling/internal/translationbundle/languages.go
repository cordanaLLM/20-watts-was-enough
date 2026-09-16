package translationbundle

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const languageRegistryRelativePath = "translations/eu-languages.json"

var openGraphLocalePattern = regexp.MustCompile(`^[a-z]{2}_[A-Z]{2}$`)

var expectedOfficialEuLanguageCodes = [...]string{
	"en", "bg", "hr", "cs", "da", "nl", "et", "fi", "fr", "de", "el", "hu",
	"ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv",
}

type languageRegistry struct {
	Schema    int              `json:"schema"`
	Languages []languageRecord `json:"languages"`
}

type languageRecord struct {
	Code            string `json:"code"`
	Label           string `json:"label"`
	OpenGraphLocale string `json:"openGraphLocale"`
}

func loadOfficialTargetLanguages(root string) (map[string]struct{}, error) {
	path := filepath.Join(root, filepath.FromSlash(languageRegistryRelativePath))
	body, err := readStableRegularFile(path, 64<<10)
	if err != nil {
		return nil, fmt.Errorf("read shared EU language registry: %w", err)
	}
	if err := strictjson.Validate(body, 4); err != nil {
		return nil, fmt.Errorf("validate unambiguous EU language registry: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var registry languageRegistry
	if err := decoder.Decode(&registry); err != nil {
		return nil, fmt.Errorf("decode EU language registry: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return nil, errors.New("EU language registry contains trailing data")
	}
	return validateLanguageRegistry(registry)
}

func validateLanguageRegistry(registry languageRegistry) (map[string]struct{}, error) {
	if registry.Schema != 1 || len(registry.Languages) != len(expectedOfficialEuLanguageCodes) {
		return nil, errors.New("EU language registry must contain the exact ordered 24-code set")
	}
	codes := make(map[string]struct{}, len(registry.Languages))
	for index, record := range registry.Languages {
		if err := validateLanguageRecord(record); err != nil {
			return nil, err
		}
		if record.Code != expectedOfficialEuLanguageCodes[index] {
			return nil, errors.New("EU language registry does not match the exact ordered 24-code set")
		}
		if _, duplicate := codes[record.Code]; duplicate {
			return nil, fmt.Errorf("EU language registry repeats code %q", record.Code)
		}
		codes[record.Code] = struct{}{}
	}
	delete(codes, "en")
	return codes, nil
}

func validateLanguageRecord(record languageRecord) error {
	if !languagePattern.MatchString(record.Code) || record.Label == "" || record.Label != strings.TrimSpace(record.Label) || len(record.Label) > 128 {
		return fmt.Errorf("EU language registry has an invalid record for code %q", record.Code)
	}
	if !openGraphLocalePattern.MatchString(record.OpenGraphLocale) || !strings.HasPrefix(record.OpenGraphLocale, record.Code+"_") {
		return fmt.Errorf("EU language registry has an invalid Open Graph locale for %q", record.Code)
	}
	return nil
}

func requireOfficialTargetLanguage(languages map[string]struct{}, language string) error {
	if _, supported := languages[language]; !supported {
		return fmt.Errorf("target language %q is not a registered non-English official EU language", language)
	}
	return nil
}
