package fileidentity_test

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const maximumScannedFiles = 4096

// unpinnedCaptures lists calls that read path-based file information in a
// file that also calls os.SameFile. Such a file must capture through this
// package; Root and File methods are handle-based and stay allowed.
func unpinnedCaptures(name string, source []byte) ([]string, error) {
	file, err := parser.ParseFile(token.NewFileSet(), name, source, parser.SkipObjectResolution)
	if err != nil {
		return nil, err
	}
	comparesIdentity := false
	var findings []string
	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if receiver, ok := selector.X.(*ast.Ident); ok && receiver.Name == "os" {
			switch selector.Sel.Name {
			case "SameFile":
				comparesIdentity = true
			case "Lstat", "Stat":
				findings = append(findings, "os."+selector.Sel.Name)
			}
			return true
		}
		if (selector.Sel.Name == "Info" && len(call.Args) == 0) || selector.Sel.Name == "Readdir" {
			findings = append(findings, "."+selector.Sel.Name)
		}
		return true
	})
	if !comparesIdentity {
		return nil, nil
	}
	return findings, nil
}

func TestUnpinnedCapturesFindsPlantedDefects(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name, body string
		want       int
	}{
		{name: "lstat-compared", body: "a, _ := os.Lstat(p); b, _ := f.Stat(); _ = os.SameFile(a, b)", want: 1},
		{name: "stat-compared", body: "a, _ := os.Stat(p); _ = os.SameFile(a, a)", want: 1},
		{name: "entry-compared", body: "a, _ := e.Info(); _ = os.SameFile(a, a)", want: 1},
		{name: "readdir-compared", body: "a, _ := f.Readdir(1); _ = os.SameFile(a[0], a[0])", want: 1},
		{name: "lstat-uncompared", body: "_, _ = os.Lstat(p)"},
		{name: "pinned", body: "a, _ := fileidentity.Lstat(p); b, _ := fileidentity.Info(e); _ = os.SameFile(a, b)"},
		{name: "handle-based", body: "a, _ := root.Lstat(p); b, _ := f.Stat(); _ = os.SameFile(a, b)"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			source := "package planted\nfunc planted() {\n" + testCase.body + "\n}\n"
			findings, err := unpinnedCaptures("planted.go", []byte(source))
			if err != nil || len(findings) != testCase.want {
				t.Fatalf("findings = %v, %v; want %d", findings, err, testCase.want)
			}
		})
	}
}

func TestToolingCapturesComparedIdentityThroughFileidentity(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	scanned := 0
	var problems []string
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") ||
			filepath.Dir(path) == filepath.Join(root, "internal", "fileidentity") {
			return nil
		}
		if scanned++; scanned > maximumScannedFiles {
			return errors.New("tooling has more Go files than the scan bound")
		}
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		findings, err := unpinnedCaptures(path, source)
		if err != nil {
			return err
		}
		for _, finding := range findings {
			relative, _ := filepath.Rel(root, path)
			problems = append(problems, fmt.Sprintf("%s: %s", filepath.ToSlash(relative), finding))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if scanned == 0 {
		t.Fatal("scan found no Go files")
	}
	if len(problems) > 0 {
		t.Fatalf("files calling os.SameFile must capture through fileidentity:\n%s", strings.Join(problems, "\n"))
	}
}
