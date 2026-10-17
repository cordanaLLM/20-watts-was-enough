package pdftools

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"time"
)

const (
	candidatePublicationBundleFormat  = "20w-pdf-tools-candidate-bundle-v1"
	candidateBundleSPDXMember         = "candidate/apko.spdx.json"
	candidateBundleFinalArchiveMember = "candidate/final-image.tar"
	candidateBundleSourceBundleMember = "candidate/source-bundle.tar.gz"
	candidateBundleReceiptMember      = "receipt.json"
	candidateBundleTarBlockBytes      = int64(512)
)

var candidateBundleMemberOrder = []string{
	candidateBundleSPDXMember,
	candidateBundleFinalArchiveMember,
	candidateBundleSourceBundleMember,
	candidateBundleReceiptMember,
}

// CandidateBundleVerification is the identity recovered by reading every
// member of one authoritative local candidate bundle.
type CandidateBundleVerification struct {
	Receipt ReproductionReceipt
	SHA256  string
	Bytes   int64
}

type candidateBundleMemberIdentity struct {
	SHA256 string
	Bytes  int64
}

type candidateBundleMaximumWriter struct {
	destination io.Writer
	maximum     int64
	written     int64
}

func (writer *candidateBundleMaximumWriter) Write(body []byte) (int, error) {
	if writer.maximum <= 0 || int64(len(body)) > writer.maximum-writer.written {
		return 0, errors.New("candidate publication bundle exceeds its byte boundary")
	}
	written, err := writer.destination.Write(body)
	writer.written += int64(written)
	return written, err
}

func stageCandidatePublicationBundle(
	authority checkedAuthority,
	plan *candidateOutputPlan,
	staged *stagedCandidate,
	receipt ReproductionReceipt,
) (_ *stagedCandidateArtifact, returnError error) {
	if plan == nil || staged == nil || len(staged.artifacts) != 3 {
		return nil, errors.New("candidate publication bundle has no output plan")
	}
	wantCandidate := staged.receipt(authority)
	if receipt.Candidate == nil || *receipt.Candidate != *wantCandidate {
		return nil, errors.New("candidate publication receipt differs from the staged source authority")
	}
	maximum, err := candidatePublicationBundleMaximum(authority.contract.Limits)
	if err != nil {
		return nil, err
	}
	artifact, output, err := newStagedCandidateArtifact(plan.repository, plan.publicationBundle)
	if err != nil {
		return nil, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, artifact.cleanup())
		}
	}()
	identity, err := writeDeterministicCandidatePublicationBundle(
		output, staged, receipt, authority.contract.SourceDateEpoch,
		authority.contract.Limits.ReceiptBytes, maximum,
	)
	if err != nil {
		return nil, err
	}
	second, err := writeDeterministicCandidatePublicationBundle(
		io.Discard, staged, receipt, authority.contract.SourceDateEpoch,
		authority.contract.Limits.ReceiptBytes, maximum,
	)
	if err != nil || identity != second {
		return nil, errors.New("candidate publication bundle did not reproduce deterministically")
	}
	if err := finishStagedCandidateArtifact(artifact, output, identity.Bytes, identity.SHA256); err != nil {
		return nil, err
	}
	return artifact, nil
}

func writeDeterministicCandidatePublicationBundle(
	destination io.Writer,
	staged *stagedCandidate,
	receipt ReproductionReceipt,
	epoch int64,
	receiptMaximum int64,
	bundleMaximum int64,
) (candidateBundleMemberIdentity, error) {
	receiptBody, err := candidatePublicationReceiptBody(staged, receipt, receiptMaximum)
	if err != nil {
		return candidateBundleMemberIdentity{}, err
	}
	hasher := sha256.New()
	bounded := &candidateBundleMaximumWriter{
		destination: io.MultiWriter(destination, hasher),
		maximum:     bundleMaximum,
	}
	writer := tar.NewWriter(bounded)
	artifacts := map[string]*stagedCandidateArtifact{
		candidateBundleSPDXMember:         staged.artifacts[1],
		candidateBundleFinalArchiveMember: staged.artifacts[0],
		candidateBundleSourceBundleMember: staged.artifacts[2],
	}
	for _, name := range candidateBundleMemberOrder {
		if name == candidateBundleReceiptMember {
			if err := writeCandidateBundleBytes(writer, name, receiptBody, epoch); err != nil {
				_ = writer.Close()
				return candidateBundleMemberIdentity{}, err
			}
			continue
		}
		if err := writeCandidateBundleArtifact(writer, name, artifacts[name], epoch); err != nil {
			_ = writer.Close()
			return candidateBundleMemberIdentity{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return candidateBundleMemberIdentity{}, fmt.Errorf("close deterministic candidate publication bundle: %w", err)
	}
	return candidateBundleMemberIdentity{
		SHA256: hex.EncodeToString(hasher.Sum(nil)),
		Bytes:  bounded.written,
	}, nil
}

func candidatePublicationReceiptBody(
	staged *stagedCandidate,
	receipt ReproductionReceipt,
	maximum int64,
) ([]byte, error) {
	if staged == nil || len(staged.artifacts) != 3 || receipt.Candidate == nil ||
		maximum <= 0 || receipt.Candidate.BundleFormat != candidatePublicationBundleFormat ||
		receipt.Candidate.StandaloneFilesAuthority != "non-authoritative-convenience" {
		return nil, errors.New("candidate publication receipt does not describe one complete bundle")
	}
	expected := []ReproductionArtifact{
		receipt.Candidate.FinalArchive,
		receipt.Candidate.CanonicalSPDX,
		receipt.Candidate.SourceBundle.ReproductionArtifact,
	}
	wantPaths := []string{
		candidateBundleFinalArchiveMember,
		candidateBundleSPDXMember,
		candidateBundleSourceBundleMember,
	}
	for index, artifact := range staged.artifacts {
		if artifact == nil || artifact.unnamed == nil || artifact.identity.Bytes <= 0 ||
			artifact.identity.SHA256 != expected[index].SHA256 || artifact.identity.Bytes != expected[index].Bytes ||
			expected[index].Path != wantPaths[index] {
			return nil, errors.New("candidate publication receipt differs from staged member identities")
		}
	}
	body, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode candidate publication receipt: %w", err)
	}
	body = append(body, '\n')
	if int64(len(body)) > maximum {
		return nil, errors.New("candidate publication receipt exceeds its byte boundary")
	}
	return body, nil
}

func writeCandidateBundleBytes(writer *tar.Writer, name string, body []byte, epoch int64) error {
	if len(body) == 0 {
		return fmt.Errorf("candidate publication bundle member %s is empty", name)
	}
	if err := writeCandidateBundleHeader(writer, name, int64(len(body)), epoch); err != nil {
		return err
	}
	if _, err := writer.Write(body); err != nil {
		return fmt.Errorf("write candidate publication bundle member %s: %w", name, err)
	}
	return nil
}

func writeCandidateBundleArtifact(
	writer *tar.Writer,
	name string,
	artifact *stagedCandidateArtifact,
	epoch int64,
) error {
	if artifact == nil || artifact.unnamed == nil || artifact.unnamedInformation == nil ||
		artifact.identity.Bytes <= 0 || !rawDigestPattern.MatchString(artifact.identity.SHA256) {
		return fmt.Errorf("candidate publication bundle member %s has no staged identity", name)
	}
	before, err := artifact.unnamed.Stat()
	if err != nil || !before.Mode().IsRegular() || !os.SameFile(before, artifact.unnamedInformation) ||
		before.Size() != artifact.identity.Bytes {
		return fmt.Errorf("candidate publication bundle member %s changed before streaming", name)
	}
	if err := writeCandidateBundleHeader(writer, name, artifact.identity.Bytes, epoch); err != nil {
		return err
	}
	hasher := sha256.New()
	reader := io.NewSectionReader(artifact.unnamed, 0, artifact.identity.Bytes)
	written, copyError := io.Copy(writer, io.TeeReader(reader, hasher))
	if copyError != nil || written != artifact.identity.Bytes ||
		hex.EncodeToString(hasher.Sum(nil)) != artifact.identity.SHA256 {
		return fmt.Errorf("candidate publication bundle member %s differs from its staged identity", name)
	}
	after, err := artifact.unnamed.Stat()
	if err != nil || !os.SameFile(before, after) || after.Size() != written || after.Mode() != before.Mode() {
		return fmt.Errorf("candidate publication bundle member %s changed while streaming", name)
	}
	return nil
}

func writeCandidateBundleHeader(writer *tar.Writer, name string, size, epoch int64) error {
	if !validBundlePath(name) || size <= 0 {
		return errors.New("candidate publication bundle member path or size is invalid")
	}
	header := &tar.Header{
		Name: name, Mode: 0o644, Size: size,
		ModTime: time.Unix(epoch, 0).UTC(), Typeflag: tar.TypeReg, Format: tar.FormatUSTAR,
	}
	if err := writer.WriteHeader(header); err != nil {
		return fmt.Errorf("write candidate publication bundle header %s: %w", name, err)
	}
	return nil
}

func candidatePublicationBundleMaximum(limits Limits) (int64, error) {
	return candidateTarArchiveSize([]int64{
		limits.SPDXBytes,
		limits.FinalArchiveBytes,
		limits.SourceBundleBytes,
		limits.ReceiptBytes,
	})
}

func candidateTarArchiveSize(sizes []int64) (int64, error) {
	total := 2 * candidateBundleTarBlockBytes
	for _, size := range sizes {
		if size <= 0 || size > math.MaxInt64-(candidateBundleTarBlockBytes-1) {
			return 0, errors.New("candidate publication bundle member size is outside its boundary")
		}
		padded := ((size + candidateBundleTarBlockBytes - 1) / candidateBundleTarBlockBytes) * candidateBundleTarBlockBytes
		if total > math.MaxInt64-candidateBundleTarBlockBytes-padded {
			return 0, errors.New("candidate publication bundle size overflows its boundary")
		}
		total += candidateBundleTarBlockBytes + padded
	}
	return total, nil
}

// VerifyCandidatePublicationBundle opens one repository-local bundle, checks
// its independently supplied identity, and rehashes every embedded stream
// against the canonical receipt before returning it to a consumer.
func VerifyCandidatePublicationBundle(
	repositoryRoot string,
	relative string,
	expectedSHA256 string,
) (CandidateBundleVerification, error) {
	if !rawDigestPattern.MatchString(expectedSHA256) {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle requires an exact SHA-256 identity")
	}
	authority, err := checkAuthority(repositoryRoot)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	destination, err := prepareCandidateOutputPath(
		authority.root, relative, ".tar", "candidate publication bundle",
	)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	parent, err := openPinnedPublicationDirectory(
		publicationRootIdentity{path: authority.root, information: authority.rootInformation},
		filepath.Dir(destination.relative), false, nil,
	)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	defer parent.close()
	return verifyCandidatePublicationBundleAtParent(authority, parent, filepath.Base(destination.relative), nil, expectedSHA256)
}

func verifyPublishedCandidatePublicationBundle(
	authority checkedAuthority,
	artifact *stagedCandidateArtifact,
) (CandidateBundleVerification, error) {
	if artifact == nil || artifact.parent == nil || artifact.publishedInformation == nil {
		return CandidateBundleVerification{}, errors.New("published candidate bundle has no stable identity")
	}
	return verifyCandidatePublicationBundleAtParent(
		authority, artifact.parent, artifact.destinationName,
		artifact.publishedInformation, artifact.identity.SHA256,
	)
}

func verifyCandidatePublicationBundleAtParent(
	authority checkedAuthority,
	parent *pinnedPublicationDirectory,
	name string,
	expectedInformation os.FileInfo,
	expectedSHA256 string,
) (_ CandidateBundleVerification, returnError error) {
	maximum, err := candidatePublicationBundleMaximum(authority.contract.Limits)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	if parent == nil || parent.root == nil || !rawDigestPattern.MatchString(expectedSHA256) {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle has no pinned read identity")
	}
	current, err := parent.root.Lstat(name)
	if err != nil || !current.Mode().IsRegular() || current.Mode()&os.ModeSymlink != 0 ||
		current.Size() <= 0 || current.Size() > maximum ||
		expectedInformation != nil && !os.SameFile(expectedInformation, current) {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle is not the expected bounded regular file")
	}
	file, err := parent.root.Open(name)
	if err != nil {
		return CandidateBundleVerification{}, fmt.Errorf("open candidate publication bundle: %w", err)
	}
	defer func() { returnError = errors.Join(returnError, file.Close()) }()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(current, opened) || opened.Size() != current.Size() {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle changed while it was opened")
	}
	verification, err := verifyCandidatePublicationBundleStream(
		file, opened.Size(), expectedSHA256, authority,
	)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	after, err := file.Stat()
	if err != nil || !os.SameFile(opened, after) || after.Size() != opened.Size() || after.Mode() != opened.Mode() {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle changed while it was read")
	}
	current, err = parent.root.Lstat(name)
	if err != nil || !os.SameFile(opened, current) {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle path changed while it was read")
	}
	if err := parent.verify(); err != nil {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle parent changed while it was read")
	}
	return verification, nil
}

func verifyCandidatePublicationBundleStream(
	input io.Reader,
	totalBytes int64,
	expectedSHA256 string,
	authority checkedAuthority,
) (CandidateBundleVerification, error) {
	maximum, err := candidatePublicationBundleMaximum(authority.contract.Limits)
	if err != nil || totalBytes <= 0 || totalBytes == math.MaxInt64 || totalBytes > maximum ||
		!rawDigestPattern.MatchString(expectedSHA256) {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle identity is outside its boundary")
	}
	hasher := sha256.New()
	limited := &io.LimitedReader{R: input, N: totalBytes + 1}
	counted := &countingReader{source: io.TeeReader(limited, hasher)}
	reader := tar.NewReader(counted)
	// archive/tar deliberately accepts nonzero padding and several encodings
	// of the same header. Re-encode while streaming so canonical means exact
	// bytes, including headers, padding and the two end-of-archive blocks.
	canonicalHasher := sha256.New()
	canonicalWriter := tar.NewWriter(canonicalHasher)
	observed := make(map[string]candidateBundleMemberIdentity, len(candidateBundleMemberOrder))
	var receiptBody []byte
	sizes := make([]int64, 0, len(candidateBundleMemberOrder))
	for _, wantName := range candidateBundleMemberOrder {
		header, err := reader.Next()
		if err != nil {
			return CandidateBundleVerification{}, fmt.Errorf("read candidate publication bundle member %s: %w", wantName, err)
		}
		limit := candidateBundleMemberMaximum(wantName, authority.contract.Limits)
		if err := validateCandidateBundleHeader(header, wantName, limit, authority.contract.SourceDateEpoch); err != nil {
			return CandidateBundleVerification{}, err
		}
		if err := writeCandidateBundleHeader(canonicalWriter, wantName, header.Size, authority.contract.SourceDateEpoch); err != nil {
			return CandidateBundleVerification{}, err
		}
		sizes = append(sizes, header.Size)
		memberHasher := sha256.New()
		member := io.TeeReader(reader, io.MultiWriter(memberHasher, canonicalWriter))
		if wantName == candidateBundleReceiptMember {
			body, err := io.ReadAll(io.LimitReader(member, limit+1))
			if err != nil || int64(len(body)) != header.Size {
				return CandidateBundleVerification{}, errors.New("candidate publication receipt member is truncated or oversized")
			}
			receiptBody = body
		} else {
			written, err := io.Copy(io.Discard, io.LimitReader(member, limit+1))
			if err != nil || written != header.Size {
				return CandidateBundleVerification{}, fmt.Errorf("candidate publication bundle member %s is truncated or oversized", wantName)
			}
		}
		observed[wantName] = candidateBundleMemberIdentity{
			SHA256: hex.EncodeToString(memberHasher.Sum(nil)),
			Bytes:  header.Size,
		}
	}
	if header, err := reader.Next(); !errors.Is(err, io.EOF) || header != nil {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle contains an unexpected extra member")
	}
	wantTarBytes, err := candidateTarArchiveSize(sizes)
	if err != nil || wantTarBytes != totalBytes || counted.count != totalBytes || limited.N != 1 {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle has non-canonical padding or trailing bytes")
	}
	sha256 := hex.EncodeToString(hasher.Sum(nil))
	if sha256 != expectedSHA256 {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle differs from its independently supplied SHA-256")
	}
	if err := canonicalWriter.Close(); err != nil || hex.EncodeToString(canonicalHasher.Sum(nil)) != sha256 {
		return CandidateBundleVerification{}, errors.New("candidate publication bundle is not canonical USTAR bytes")
	}
	receipt, err := decodeCanonical[ReproductionReceipt](receiptBody, 32, "candidate publication receipt")
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	if err := validateCandidatePublicationReceipt(authority, receipt, observed); err != nil {
		return CandidateBundleVerification{}, err
	}
	return CandidateBundleVerification{Receipt: receipt, SHA256: sha256, Bytes: totalBytes}, nil
}

func candidateBundleMemberMaximum(name string, limits Limits) int64 {
	switch name {
	case candidateBundleSPDXMember:
		return limits.SPDXBytes
	case candidateBundleFinalArchiveMember:
		return limits.FinalArchiveBytes
	case candidateBundleSourceBundleMember:
		return limits.SourceBundleBytes
	case candidateBundleReceiptMember:
		return limits.ReceiptBytes
	default:
		return 0
	}
}

func validateCandidateBundleHeader(header *tar.Header, name string, maximum, epoch int64) error {
	if header == nil || header.Name != name || header.Typeflag != tar.TypeReg ||
		header.Format != tar.FormatUSTAR || header.Mode != 0o644 || header.Size <= 0 || header.Size > maximum ||
		header.Uid != 0 || header.Gid != 0 || header.Uname != "" || header.Gname != "" ||
		header.Linkname != "" || header.Devmajor != 0 || header.Devminor != 0 ||
		!header.ModTime.Equal(time.Unix(epoch, 0).UTC()) || !header.AccessTime.IsZero() || !header.ChangeTime.IsZero() ||
		len(header.PAXRecords) != 0 || len(header.Xattrs) != 0 {
		return fmt.Errorf("candidate publication bundle member %s has a non-canonical header", name)
	}
	return nil
}

func validateCandidatePublicationReceipt(
	authority checkedAuthority,
	receipt ReproductionReceipt,
	observed map[string]candidateBundleMemberIdentity,
) error {
	if receipt.Schema != reproductionReceiptSchema || receipt.Status != "local-candidate-preparation-pass" ||
		receipt.Scope != "local-pdf-tools-candidate-preparation" || receipt.Authority != "NO_RESULT" ||
		receipt.ScientificResult || receipt.Candidate == nil || receipt.Runtime == nil ||
		receipt.Contract.SHA256 != authority.contractSHA256 ||
		receipt.Contract.ResultAuthority != authority.contract.ResultAuthority ||
		receipt.Contract.Platform != authority.contract.Platform ||
		!receipt.Comparison.ConstructionMatch || !receipt.Comparison.Runtime || !receipt.Comparison.AllMatch {
		return errors.New("candidate publication receipt is not matching NO_RESULT construction evidence")
	}
	wantBlockState := ReproductionBlockState{
		RemotePublication: "blocked", DigestAdmission: "blocked",
		SourceBundle: "candidate-prepared", ScientificUse: "blocked", LegalConclusion: "not-made",
	}
	if receipt.BlockState != wantBlockState {
		return errors.New("candidate publication receipt does not preserve the NO_RESULT block state")
	}
	candidate := receipt.Candidate
	if candidate.BundleFormat != candidatePublicationBundleFormat ||
		candidate.StandaloneFilesAuthority != "non-authoritative-convenience" ||
		candidate.State != "local-bundle-prepared" || !candidate.SPDXCanonicalBuildsMatch ||
		candidate.RetainedAPKs != authority.contract.SourceDelivery.APKCount ||
		candidate.RetainedBytes != authority.retention.TotalBytes ||
		candidate.SourceBundle.Root != authority.contract.SourceDelivery.BundleLayout.Root ||
		candidate.SourceBundle.ChecksumManifest != authority.contract.SourceDelivery.BundleLayout.ChecksumManifest ||
		!rawDigestPattern.MatchString(candidate.SourceBundle.ChecksumSHA256) ||
		candidate.SourceBundle.ChecksumBytes <= 0 || candidate.SourceBundle.PayloadFiles <= 0 ||
		candidate.SourceBundle.ArchiveFiles != candidate.SourceBundle.PayloadFiles+1 ||
		candidate.SourceBundle.UncompressedFileBytes <= 0 || !candidate.SourceBundle.Deterministic {
		return errors.New("candidate publication receipt bundle metadata is invalid")
	}
	want := map[string]ReproductionArtifact{
		candidateBundleSPDXMember:         candidate.CanonicalSPDX,
		candidateBundleFinalArchiveMember: candidate.FinalArchive,
		candidateBundleSourceBundleMember: candidate.SourceBundle.ReproductionArtifact,
	}
	for name, identity := range want {
		member, ok := observed[name]
		if !ok || identity.Path != name || identity.SHA256 != member.SHA256 || identity.Bytes != member.Bytes ||
			!rawDigestPattern.MatchString(identity.SHA256) || identity.Bytes <= 0 {
			return fmt.Errorf("candidate publication bundle member %s differs from its receipt identity", name)
		}
	}
	return nil
}
