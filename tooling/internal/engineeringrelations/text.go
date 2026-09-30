package engineeringrelations

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	maximumShortText           = 200
	maximumBoundaryText        = 300
	maximumIdentifiersPerField = 64
)

var (
	// identifierPattern finds hyphenated upper-case identifiers such as
	// P-002, REQ-P15-04 or H-E1, with an optional lower-case namespace.
	identifierPattern = regexp.MustCompile(`(?:([a-z0-9][a-z0-9-]{0,31}):)?\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b`)
	evidentialVerb    = regexp.MustCompile(`(?i)\b(?:prov(?:e|es|ed|en|ing)|establish(?:es|ed|ing)?|confirm(?:s|ed|ing)?|demonstrat(?:e|es|ed|ing))\b`)
)

type textField struct {
	name  string
	value string
	limit int
}

func checkText(label string, relation Relation, report *collector) {
	for _, field := range textFields(relation) {
		checkTextField(label, field, report)
	}
	if evidentialVerb.MatchString(relation.Subject) {
		report.add("%s: subject uses an evidential verb; describe what the code does", label)
	}
	checkRecorded(label, relation.Recorded, report)
}

func textFields(relation Relation) []textField {
	fields := []textField{
		{name: "subject", value: relation.Subject, limit: maximumShortText},
		{name: "does_not_establish", value: relation.DoesNotEstablish, limit: maximumBoundaryText},
	}
	if relation.TargetSection != nil {
		fields = append(fields, textField{name: "target_section", value: *relation.TargetSection, limit: maximumShortText})
	}
	if relation.Residual != nil {
		fields = append(fields, textField{name: "residual", value: *relation.Residual, limit: maximumShortText})
	}
	if relation.Metric != nil {
		fields = append(fields, textField{name: "metric", value: *relation.Metric, limit: maximumShortText})
	}
	return fields
}

func checkTextField(label string, field textField, report *collector) {
	if field.value == "" || strings.TrimSpace(field.value) != field.value {
		report.add("%s: %s must be non-empty without surrounding space", label, field.name)
	}
	if utf8.RuneCountInString(field.value) > field.limit {
		report.add("%s: %s exceeds %d characters", label, field.name, field.limit)
	}
	if containsControl(field.value) {
		report.add("%s: %s contains a control character", label, field.name)
	}
	checkIdentifiers(label, field, report)
}

// checkIdentifiers requires every identifier in free text to carry its
// namespace, so an external P-002 cannot read as the 20w principle, and
// rejects any 20w claim identifier outright.
func checkIdentifiers(label string, field textField, report *collector) {
	for _, match := range identifierPattern.FindAllStringSubmatch(field.value, maximumIdentifiersPerField) {
		namespace, identifier := match[1], match[2]
		if !strings.ContainsAny(identifier, "0123456789") {
			continue
		}
		if strings.HasPrefix(identifier, "C-") && (namespace == "" || namespace == "20w") {
			report.add("%s: %s cites claim %s; code never supports a C- claim (decision 0087)", label, field.name, identifier)
			continue
		}
		if namespace == "" {
			report.add("%s: %s names %s without a namespace; write 20w:%s or <repository>:%s", label, field.name, identifier, identifier, identifier)
		}
	}
}
