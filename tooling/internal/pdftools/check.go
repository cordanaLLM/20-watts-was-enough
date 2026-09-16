package pdftools

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
)

const contractRelativePath = "tooling/pdf-tools/contract.json"

type checkedAuthority struct {
	root             string
	rootInformation  os.FileInfo
	contract         Contract
	contractSHA256   string
	lockSHA256       string
	renderer         pdfrender.Configuration
	retention        retentionManifest
	packages         int
	notices          int
	retainedAPKBytes int64
}

// Check validates the complete committed PDF-tools authority without network or containers.
func Check(repositoryRoot string) (Result, error) {
	authority, err := checkAuthority(repositoryRoot)
	if err != nil {
		return Result{}, err
	}
	return Result{
		ContractSHA256: authority.contractSHA256,
		LockSHA256:     authority.lockSHA256,
		Packages:       authority.packages,
		Notices:        authority.notices,
		RetainedBytes:  authority.retainedAPKBytes,
	}, nil
}

func checkAuthority(repositoryRoot string) (checkedAuthority, error) {
	root, rootInformation, err := cleanRoot(repositoryRoot)
	if err != nil {
		return checkedAuthority{}, err
	}
	contractBody, err := readRelative(root, contractRelativePath, "PDF-tools contract", 64*1024)
	if err != nil {
		return checkedAuthority{}, err
	}
	contract, err := decodeCanonical[Contract](contractBody, 8, "PDF-tools contract")
	if err != nil {
		return checkedAuthority{}, err
	}
	if err := validateContract(contract); err != nil {
		return checkedAuthority{}, fmt.Errorf("validate PDF-tools contract: %w", err)
	}
	configBody, err := checkConfig(root, contract)
	if err != nil {
		return checkedAuthority{}, err
	}
	locked, err := loadLock(root, contract, configBody)
	if err != nil {
		return checkedAuthority{}, err
	}
	retention, err := loadRetention(root, contract, locked)
	if err != nil {
		return checkedAuthority{}, err
	}
	if err := checkNoticesAndRecipe(root, contract); err != nil {
		return checkedAuthority{}, err
	}
	renderer, err := pdfrender.Check(root)
	if err != nil {
		return checkedAuthority{}, fmt.Errorf("validate notice-layer BuildKit authority: %w", err)
	}
	buildKitAuthority, err := json.Marshal(struct {
		Builder  pdfrender.Builder  `json:"builder"`
		Exporter pdfrender.Exporter `json:"exporter"`
	}{Builder: renderer.Lock.Builder, Exporter: renderer.Lock.Exporter})
	if err != nil {
		return checkedAuthority{}, fmt.Errorf("encode notice-layer BuildKit authority: %w", err)
	}
	if rawDigest(buildKitAuthority) != contract.NoticeLayer.BuildKitAuthoritySHA256 {
		return checkedAuthority{}, errors.New("notice-layer BuildKit authority digest does not match contract.json")
	}
	return checkedAuthority{
		root:             root,
		rootInformation:  rootInformation,
		contract:         contract,
		contractSHA256:   rawDigest(contractBody),
		lockSHA256:       contract.Apko.LockSHA256,
		renderer:         renderer,
		retention:        retention,
		packages:         len(locked),
		notices:          len(contract.NoticeLayer.Entries),
		retainedAPKBytes: retention.TotalBytes,
	}, nil
}

func checkConfig(root string, contract Contract) ([]byte, error) {
	relative := "tooling/pdf-tools/" + contract.Apko.Config
	body, err := readRelative(root, relative, "PDF-tools apko config", 64*1024)
	if err != nil {
		return nil, err
	}
	if rawDigest(body) != contract.Apko.ConfigSHA256 {
		return nil, errors.New("PDF-tools apko config digest does not match contract.json")
	}
	wanted := renderApko(contract)
	if !bytes.Equal(body, wanted) {
		return nil, errors.New("PDF-tools apko config is not the canonical contract projection")
	}
	return body, nil
}

func checkNoticesAndRecipe(root string, contract Contract) error {
	var total int64
	for _, entry := range contract.NoticeLayer.Entries {
		relative := "tooling/pdf-tools/" + entry.Source
		body, err := readRelative(root, relative, "Poppler notice "+entry.Source, contract.Limits.NoticeBytes)
		if err != nil {
			return err
		}
		if int64(len(body)) != entry.Size || rawDigest(body) != entry.SHA256 {
			return fmt.Errorf("Poppler notice %s does not match its source identity", entry.Source)
		}
		total += int64(len(body))
	}
	if total > contract.Limits.NoticeBytes {
		return errors.New("Poppler notices exceed the aggregate notice bound")
	}
	recipe := contract.Upstream.WolfiRecipe
	body, err := readRelative(root, "tooling/pdf-tools/"+recipe.Snapshot, "pinned Wolfi Poppler recipe", 64*1024)
	if err != nil {
		return err
	}
	if int64(len(body)) != recipe.Size || rawDigest(body) != recipe.SHA256 {
		return errors.New("pinned Wolfi Poppler recipe does not match contract.json")
	}
	license := recipe.License
	body, err = readRelative(root, "tooling/pdf-tools/"+license.Snapshot, "pinned Wolfi recipe licence", 64*1024)
	if err != nil {
		return err
	}
	if int64(len(body)) != license.Size || rawDigest(body) != license.SHA256 {
		return errors.New("pinned Wolfi recipe licence does not match contract.json")
	}
	return nil
}

func renderApko(contract Contract) []byte {
	version := contract.Runtime.RequiredTools[0].Version
	packages := strings.Join(contract.Apko.DirectPackages, "\n    - ")
	body := fmt.Sprintf(`contents:
  repositories:
    - %s
  keyring:
    - %s
  packages:
    - %s

accounts:
  groups:
    - groupname: nonroot
      gid: %d
  users:
    - username: nonroot
      uid: %d
  run-as: nonroot

environment:
  PATH: %s

archs:
  - amd64

annotations:
  org.opencontainers.image.title: 20 Watts Was Enough PDF tools
  org.opencontainers.image.description: Locked Poppler tools for bounded publication audits
  org.opencontainers.image.source: https://github.com/lusoris/20-watts-was-enough
  io.github.lusoris.20-watts-was-enough.image-name: %s
  io.github.lusoris.20-watts-was-enough.poppler-version: %s
  io.github.lusoris.20-watts-was-enough.result-authority: %s
`, contract.Apko.Repository, contract.Apko.Keyring, packages, contract.Runtime.GID,
		contract.Runtime.UID, contract.Runtime.Path, contract.Image, version, contract.ResultAuthority)
	return []byte(body)
}
