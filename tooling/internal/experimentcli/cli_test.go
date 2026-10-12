package experimentcli

import (
	"bytes"
	"io"
	"strings"
	"testing"
)

const expectedExperimentUsage = "  20w experiment list [--root <repository>] [--json]\n  20w experiment validate [--root <repository>]\n  20w experiment release-plan [--root <repository>] [--json]\n  20w experiment package-node-image --artifact <id> --output <directory> [--root <repository>]\n  20w experiment render-clrs-wheelhouse-manifest --wheelhouse <directory> --output <new.json> [--root <repository>]\n  20w experiment verify-clrs-wheelhouse --wheelhouse <directory> [--root <repository>]\n  20w experiment check-clrs-sbom-bundle --bundle <directory> --image-manifest <sha256:digest> --image-config <sha256:digest> [--root <repository>] [--json]\n  20w experiment reproduce-clrs-promise-wheel --output <directory> (--inputs <directory> | --check) [--root <repository>]\n  20w experiment fetch-clrs-retained-inputs --output <new-directory> [--root <repository>]\n  20w experiment materialize-clrs-context --wheelhouse <directory> --source-archive <tar.gz> --promise-source-root <frozen-repository> --promise-evidence <directory> --output <context.tar> [--root <repository>] [--check]\n  20w experiment compare-clrs-fixtures --first <dataset-root> --second <dataset-root> [--root <repository>] [--json]\n  20w experiment render-clrs-generation-program [--root <repository>] [--json]\n  20w experiment generate-clrs-fixtures --output <directory> --image-id <sha256:id> --image-manifest <sha256:digest> --image-config <sha256:digest> --manifest-file <json> --config-file <json> (--execute | --check) [--root <repository>] [--json]\n"

func TestUsageRetainsExactExperimentFragment(t *testing.T) {
	var output bytes.Buffer
	Usage(&output)
	if output.String() != expectedExperimentUsage+"  20w experiment inspect-clrs-image-archive --archive <oci.tar> --sha256 <hex> --bytes <count> [--root <repository>] [--json]\n"+
		"  20w experiment prepare-clrs-loaded-image --archive <oci.tar> --sha256 <hex> --bytes <count> --output <new-directory> [--root <repository>] [--json]\n"+
		"  20w experiment run-clrs-shakedown --dataset <directory> --expected-tree <sha256-hex> --output <directory> --run-id <id> (--execute | --check) [--root <repository>] [--json]\n" {
		t.Fatalf("experiment help changed:\n%s", output.String())
	}
}

func TestRunLeavesUnknownCommandsToPublicCaller(t *testing.T) {
	for _, args := range [][]string{nil, {"unknown"}, {"--help"}, {"experiment", "list"}} {
		var stdout, stderr bytes.Buffer
		code, handled := Run(args, &stdout, &stderr)
		if code != 2 || handled || stdout.Len() != 0 || stderr.Len() != 0 {
			t.Fatalf("args=%q exit=%d handled=%t stdout=%q stderr=%q", args, code, handled, stdout.String(), stderr.String())
		}
	}
}

func TestEveryExperimentHelpCommandIsHandledWithoutExecution(t *testing.T) {
	for _, command := range []string{"list", "validate", "package-node-image", "release-plan", "render-clrs-wheelhouse-manifest", "verify-clrs-wheelhouse", "check-clrs-sbom-bundle", "reproduce-clrs-promise-wheel", "fetch-clrs-retained-inputs", "materialize-clrs-context", "compare-clrs-fixtures", "render-clrs-generation-program", "generate-clrs-fixtures", "inspect-clrs-image-archive", "prepare-clrs-loaded-image", "run-clrs-shakedown"} {
		var stdout, stderr bytes.Buffer
		code, handled := Run([]string{command, "--help"}, &stdout, &stderr)
		if code != 2 || !handled || stdout.Len() != 0 || !strings.Contains(stderr.String(), "Usage of experiment "+command+":") {
			t.Fatalf("command=%s exit=%d handled=%t stdout=%q stderr=%q", command, code, handled, stdout.String(), stderr.String())
		}
	}
}

func runCommand(t *testing.T, args []string, stdout, stderr io.Writer) int {
	t.Helper()
	code, handled := Run(args, stdout, stderr)
	if !handled {
		t.Fatalf("expected experiment command to be handled: %q", args)
	}
	return code
}
