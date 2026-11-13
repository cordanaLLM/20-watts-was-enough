package visualbaseline

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strings"
)

type jsonKeyWork struct {
	body   json.RawMessage
	target reflect.Type
	depth  int
}

// validateExactJSONKeys checks tags before encoding/json can fold their case.
// Each queued value consumes input bytes; size and depth bound the work stack.
func validateExactJSONKeys(body []byte, value any) error {
	target := reflect.TypeOf(value)
	if target == nil || target.Kind() != reflect.Pointer {
		return errors.New("exact JSON keys require a pointer target")
	}
	stack := []jsonKeyWork{{body: body, target: target.Elem()}}
	for step := 0; step < maximumJSONBytes && len(stack) > 0; step++ {
		last := len(stack) - 1
		work := stack[last]
		stack = stack[:last]
		children, err := jsonKeyChildren(work)
		if err != nil {
			return err
		}
		stack = append(stack, children...)
	}
	if len(stack) > 0 {
		return errors.New("exact JSON keys exceed the work limit")
	}
	return nil
}

func jsonKeyChildren(work jsonKeyWork) ([]jsonKeyWork, error) {
	kind := work.target.Kind()
	if kind != reflect.Struct && kind != reflect.Slice && kind != reflect.Array {
		return nil, nil
	}
	if work.depth >= maximumJSONDepth {
		return nil, fmt.Errorf("exact JSON keys exceed the %d-level depth limit", maximumJSONDepth)
	}
	if kind == reflect.Struct {
		return jsonObjectChildren(work)
	}
	var items []json.RawMessage
	if err := json.Unmarshal(work.body, &items); err != nil {
		return nil, fmt.Errorf("decode JSON key array: %w", err)
	}
	children := make([]jsonKeyWork, 0, len(items))
	for _, item := range items {
		children = append(children, jsonKeyWork{item, work.target.Elem(), work.depth + 1})
	}
	return children, nil
}

func jsonObjectChildren(work jsonKeyWork) ([]jsonKeyWork, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(work.body, &object); err != nil {
		return nil, fmt.Errorf("decode JSON key object: %w", err)
	}
	allowed := jsonFieldTypes(work.target)
	children := make([]jsonKeyWork, 0, len(object))
	// Input size bounds member count; sorted keys make diagnostics deterministic.
	for _, name := range slices.Sorted(maps.Keys(object)) {
		field, ok := allowed[name]
		if !ok {
			return nil, fmt.Errorf("JSON object contains an unknown or case-aliased field %q", name)
		}
		children = append(children, jsonKeyWork{object[name], field, work.depth + 1})
	}
	return children, nil
}

func jsonFieldTypes(target reflect.Type) map[string]reflect.Type {
	allowed := make(map[string]reflect.Type, target.NumField())
	for index := 0; index < target.NumField(); index++ {
		field := target.Field(index)
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if field.IsExported() && name != "" && name != "-" {
			allowed[name] = field.Type
		}
	}
	return allowed
}
