// Package experimentcli owns experiment command help, dispatch and argument handling.
package experimentcli

import (
	"fmt"
	"io"
)

// Usage writes the experiment fragment of the public 20w help, in its stable order.
func Usage(writer io.Writer) {
	fmt.Fprintln(writer, "  20w experiment list [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment validate [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment release-plan [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment package-node-image --artifact <id> --output <directory> [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment render-clrs-wheelhouse-manifest --wheelhouse <directory> --output <new.json> [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment verify-clrs-wheelhouse --wheelhouse <directory> [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment check-clrs-sbom-bundle --bundle <directory> --image-manifest <sha256:digest> --image-config <sha256:digest> [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment reproduce-clrs-promise-wheel --output <directory> (--inputs <directory> | --check) [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment fetch-clrs-retained-inputs --output <new-directory> [--root <repository>]")
	fmt.Fprintln(writer, "  20w experiment materialize-clrs-context --wheelhouse <directory> --source-archive <tar.gz> --promise-source-root <frozen-repository> --promise-evidence <directory> --output <context.tar> [--root <repository>] [--check]")
	fmt.Fprintln(writer, "  20w experiment compare-clrs-fixtures --first <dataset-root> --second <dataset-root> [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment render-clrs-generation-program [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment generate-clrs-fixtures --output <directory> --image-id <sha256:id> --image-manifest <sha256:digest> --image-config <sha256:digest> --manifest-file <json> --config-file <json> (--execute | --check) [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment inspect-clrs-image-archive --archive <oci.tar> --sha256 <hex> --bytes <count> [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment prepare-clrs-loaded-image --archive <oci.tar> --sha256 <hex> --bytes <count> --output <new-directory> [--root <repository>] [--json]")
	fmt.Fprintln(writer, "  20w experiment run-clrs-shakedown --dataset <directory> --expected-tree <sha256-hex> --output <directory> --run-id <id> (--execute | --check) [--root <repository>] [--json]")
}

// Run dispatches one experiment subcommand. An unhandled command writes nothing,
// leaving the public caller responsible for its full-command usage and error.
func Run(arguments []string, stdout, stderr io.Writer) (exitCode int, handled bool) {
	if len(arguments) == 0 {
		return 2, false
	}
	switch arguments[0] {
	case "list":
		return runExperimentList(arguments[1:], stdout, stderr), true
	case "validate":
		return runExperimentValidate(arguments[1:], stdout, stderr), true
	case "package-node-image":
		return runPackageNodeImage(arguments[1:], stdout, stderr), true
	case "release-plan":
		return runExperimentReleasePlan(arguments[1:], stdout, stderr), true
	case "render-clrs-wheelhouse-manifest":
		return runExperimentRenderCLRSWheelhouseManifest(arguments[1:], stdout, stderr), true
	case "verify-clrs-wheelhouse":
		return runExperimentVerifyCLRSWheelhouse(arguments[1:], stdout, stderr), true
	case "check-clrs-sbom-bundle":
		return runExperimentCheckCLRSSBOM(arguments[1:], stdout, stderr), true
	case "reproduce-clrs-promise-wheel":
		return runExperimentReproducePromise(arguments[1:], stdout, stderr), true
	case "fetch-clrs-retained-inputs":
		return runExperimentFetchCLRSRetainedInputs(arguments[1:], stdout, stderr), true
	case "materialize-clrs-context":
		return runExperimentCLRSContext(arguments[1:], stdout, stderr), true
	case "compare-clrs-fixtures":
		return runExperimentCompareCLRSFixtures(arguments[1:], stdout, stderr), true
	case "render-clrs-generation-program":
		return runExperimentRenderCLRSInvocation(arguments[1:], stdout, stderr), true
	case "generate-clrs-fixtures":
		return runExperimentGenerateCLRSFixtures(arguments[1:], stdout, stderr), true
	case "inspect-clrs-image-archive":
		return runExperimentInspectCLRSOCI(arguments[1:], stdout, stderr), true
	case "prepare-clrs-loaded-image":
		return runExperimentPrepareCLRSLoadedImage(arguments[1:], stdout, stderr), true
	case "run-clrs-shakedown":
		return runExperimentCLRSShakedown(arguments[1:], stdout, stderr), true
	}
	return 2, false
}
