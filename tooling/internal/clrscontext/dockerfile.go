package clrscontext

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func requirements(wheels clrsfixture.GeneratorWheelhouseManifest) []byte {
	var out strings.Builder
	for _, wheel := range wheels.Artifacts {
		fmt.Fprintf(&out, "%s==%s --hash=sha256:%s\n", wheel.Package, wheel.Version, wheel.SHA256)
	}
	return []byte(out.String())
}

func dockerfile(input clrsfixture.GeneratorLockInput, image clrsfixture.GeneratorImageContract) []byte {
	var out strings.Builder
	// The pinned BuildKit's bundled frontend owns syntax; no mutable #syntax pull.
	fmt.Fprintf(&out, "FROM %s\n", input.Python.BaseImage)
	fmt.Fprintf(&out, "ENV SOURCE_DATE_EPOCH=%d PYTHONDONTWRITEBYTECODE=1\n", image.Builder.SourceDateEpoch)
	out.WriteString("RUN --network=none [\"python\", \"-m\", \"venv\", \"/opt/venv\"]\n")
	out.WriteString("RUN --network=none --mount=type=bind,source=wheels,target=/wheelhouse,ro --mount=type=bind,source=requirements.txt,target=/requirements.txt,ro ")
	install := []string{"/opt/venv/bin/python", "-m", "pip", "--isolated", "--disable-pip-version-check", "install", "--no-index", "--no-deps", "--no-compile", "--require-hashes", "--only-binary=:all:", "--find-links=/wheelhouse", "-r", "/requirements.txt"}
	body, _ := json.Marshal(install)
	out.Write(body)
	out.WriteByte('\n')
	fmt.Fprintf(&out, "COPY source/ %s/\n", image.Runtime.SourceRoot)
	fmt.Fprintf(&out, "COPY source/LICENSE %s\n", image.LicenseMaterial.DestinationPath)
	for _, environment := range image.Runtime.Environment {
		key, value, _ := strings.Cut(environment, "=")
		fmt.Fprintf(&out, "ENV %s=%s\n", key, strconv.Quote(value))
	}
	fmt.Fprintf(&out, "WORKDIR %s\nUSER %d:%d\n", image.Runtime.WorkingDirectory, image.Runtime.UID, image.Runtime.GID)
	entrypoint, _ := json.Marshal(image.Runtime.Entrypoint)
	fmt.Fprintf(&out, "ENTRYPOINT %s\n", entrypoint)
	return []byte(out.String())
}
