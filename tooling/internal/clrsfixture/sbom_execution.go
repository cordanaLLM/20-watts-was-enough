package clrsfixture

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// This is the retained outer runner's receipt schema, including its original
// upper-case keys. Inspection payloads are byte-bound; only identity and state
// claims are interpreted here, not the runner's sandbox enforcement policy.
type sbomExecution struct {
	Schema                                                              int `json:"schema"`
	Authority, State, Started, Finished                                 string
	Name, ContainerID, LoadedScannerID                                  string
	Archive, Supervisor, Launcher, ScannerBinary, Statement, CommandLog sbomIdentity
	ScannerIndexDigest, ScannerManifestDigest, ScannerConfigDigest      string
	ImageManifestDigest, ImageConfigDigest                              string
	Before, After                                                       json.RawMessage
	InputsRechecked, CleanupVerified                                    bool
	PackageCount                                                        int
	Error                                                               string `json:"error,omitempty"`
	Limitations                                                         []string
}

type sbomRecordedState struct {
	Running, Paused, Restarting, OOMKilled, Dead bool
	Status, Error                                string
	ExitCode, Pid                                int
}

func checkSBOMExecution(body []byte, binding sbomBinding, statement sbomIdentity, packageCount int) error {
	object, err := sbomObject(body, "schema Authority State Started Finished Name ContainerID LoadedScannerID Archive Supervisor Launcher ScannerBinary Statement CommandLog ScannerIndexDigest ScannerManifestDigest ScannerConfigDigest ImageManifestDigest ImageConfigDigest Before After InputsRechecked CleanupVerified PackageCount Limitations", "error")
	if err != nil {
		return fmt.Errorf("SBOM execution record: %w", err)
	}
	if value, exists := object["error"]; exists && string(value) == "null" {
		return errors.New("SBOM execution error field must not be null")
	}
	var execution sbomExecution
	if err := decodeStrict(body, sbomMaximumDepth, &execution); err != nil {
		return err
	}
	if execution.Schema != 1 || execution.Authority != ResultAuthority || execution.State != "scanner-observation-passed-unadmitted" ||
		execution.Error != "" || !execution.InputsRechecked || !execution.CleanupVerified || execution.PackageCount != packageCount ||
		!validSBOMLimitations(execution.Limitations) {
		return errors.New("SBOM execution record does not contain the required successful, unadmitted recorded claims")
	}
	if execution.Archive != binding.Archive || execution.Statement != statement ||
		execution.Supervisor.SHA256 != binding.Supervisor || execution.Launcher != execution.Supervisor ||
		execution.ScannerBinary.SHA256 != binding.ScannerBinary || !validSBOMIdentity(execution.Supervisor, 32<<20) ||
		!validSBOMIdentity(execution.ScannerBinary, 256<<20) || !validSBOMIdentity(execution.CommandLog, 80<<20) ||
		execution.ScannerIndexDigest != binding.ScannerIndex || execution.ScannerManifestDigest != binding.ScannerManifest ||
		execution.ScannerConfigDigest != binding.ScannerConfig || execution.ImageManifestDigest != binding.ManifestDigest ||
		execution.ImageConfigDigest != binding.ConfigDigest {
		return errors.New("SBOM execution recorded payload or image identities differ from the supplied binding")
	}
	if !lowerHex(execution.ContainerID, 64) || !validSBOMContainerName(execution.Name) ||
		(execution.LoadedScannerID != binding.ScannerIndex && execution.LoadedScannerID != binding.ScannerManifest && execution.LoadedScannerID != binding.ScannerConfig) {
		return errors.New("SBOM execution recorded container/scanner identity is invalid")
	}
	started, startErr := time.Parse(time.RFC3339Nano, execution.Started)
	finished, finishErr := time.Parse(time.RFC3339Nano, execution.Finished)
	if startErr != nil || finishErr != nil || !finished.After(started) {
		return errors.New("SBOM execution recorded timestamps are invalid or unordered")
	}
	if err := checkSBOMRecordedInspection(execution.Before, execution, "created"); err != nil {
		return err
	}
	return checkSBOMRecordedInspection(execution.After, execution, "exited")
}

func checkSBOMRecordedInspection(body []byte, execution sbomExecution, status string) error {
	object, err := sbomObject(body, "ID Name Image Config Mounts State NetworkSettings HostConfig", "")
	if err != nil {
		return err
	}
	if jsonString(object, "ID") != execution.ContainerID || jsonString(object, "Name") != "/"+execution.Name ||
		jsonString(object, "Image") != execution.LoadedScannerID {
		return errors.New("SBOM recorded inspection container identity differs")
	}
	config, err := sbomObject(object["Config"], "Image User WorkingDir Entrypoint Cmd Env OnBuild Labels Volumes ExposedPorts Healthcheck StopTimeout StopSignal Tty OpenStdin", "")
	if err != nil {
		return err
	}
	var labels map[string]string
	if err := json.Unmarshal(config["Labels"], &labels); err != nil || len(labels) != 1 ||
		labels["dev.cordana.clrs-sbom-owner"] != execution.Name || jsonString(config, "Image") != execution.LoadedScannerID {
		return errors.New("SBOM recorded inspection owner label or configured image differs")
	}
	stateObject, err := sbomObject(object["State"], "Running Paused Restarting OOMKilled Dead Status Error ExitCode Pid", "")
	if err != nil {
		return err
	}
	for _, field := range []string{"Running", "Paused", "Restarting", "OOMKilled", "Dead", "Status", "Error", "ExitCode", "Pid"} {
		if string(stateObject[field]) == "null" {
			return errors.New("SBOM recorded state fields must not be null")
		}
	}
	var state sbomRecordedState
	if err := json.Unmarshal(object["State"], &state); err != nil {
		return err
	}
	if state != (sbomRecordedState{Status: status}) {
		return fmt.Errorf("SBOM recorded inspection must claim stopped %s state without errors", status)
	}
	// Preserve but do not interpret resource, network, or mount policy payloads.
	for _, field := range []string{"HostConfig", "NetworkSettings"} {
		var value map[string]json.RawMessage
		if err := json.Unmarshal(object[field], &value); err != nil || len(value) == 0 {
			return errors.New("SBOM recorded inspection requires nonempty configuration objects")
		}
	}
	var mounts []json.RawMessage
	if err := json.Unmarshal(object["Mounts"], &mounts); err != nil || len(mounts) != 2 {
		return errors.New("SBOM recorded inspection requires its two recorded mount entries")
	}
	return nil
}

func validSBOMContainerName(name string) bool {
	if len(name) > 128 || !strings.HasPrefix(name, "clrs20w-sbom-") || len(name) == len("clrs20w-sbom-") {
		return false
	}
	for _, character := range name {
		if character != '-' && (character < 'a' || character > 'z') && (character < '0' || character > '9') {
			return false
		}
	}
	return true
}
