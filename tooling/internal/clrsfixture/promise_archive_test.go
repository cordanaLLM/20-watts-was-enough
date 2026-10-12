package clrsfixture

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

type promiseTestTarMember struct {
	header tar.Header
	body   []byte
}

func TestPromiseSourceCanonicalizesGNUHeadersAndPadding(t *testing.T) {
	t.Parallel()
	members, source := promiseTestSource(t)
	padded := append(promiseTestTar(t, members), make([]byte, 9*promiseTarBlockBytes)...)
	canonical, err := preparePromiseSource(promiseTestGzip(t, padded), source)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(members)
	for index := range members {
		members[index].header.ModTime = time.Unix(123, 0)
		members[index].header.Uid = 42
		members[index].header.Gid = 43
		members[index].header.Mode = 0o700
		if members[index].header.Typeflag == tar.TypeDir {
			members[index].header.Name = strings.TrimSuffix(members[index].header.Name, "/")
		}
	}
	reordered, err := preparePromiseSource(promiseTestGzip(t, promiseTestTar(t, members)), source)
	if err != nil || !bytes.Equal(canonical, reordered) {
		t.Fatalf("source metadata/order changed canonical tar: %v", err)
	}
	entries, err := readPromiseTar(canonical, promiseArchiveBytes)
	if err != nil || len(entries) != len(members) {
		t.Fatalf("canonical tar entries = %d, error = %v", len(entries), err)
	}
	wantBodies := make(map[string][]byte, len(members))
	for _, member := range members {
		name := member.header.Name
		if member.header.Typeflag == tar.TypeDir {
			name += "/"
		}
		wantBodies[name] = member.body
	}
	previous := ""
	for _, entry := range entries {
		header := entry.header
		mode := int64(0o644)
		if header.Typeflag == tar.TypeDir {
			mode = 0o755
		}
		if header.Format != tar.FormatUSTAR || header.Mode != mode || header.Uid != 65532 || header.Gid != 65532 ||
			header.ModTime.Unix() != generatorSourceDateEpoch || header.Uname != "" || header.Gname != "" ||
			len(header.PAXRecords) != 0 || header.Name <= previous {
			t.Fatalf("canonical header = %#v", header)
		}
		if !bytes.Equal(entry.body, wantBodies[header.Name]) {
			t.Fatalf("canonical member bytes changed: %s", header.Name)
		}
		previous = header.Name
	}
}

func TestPromiseSourceRejectsUnsafeMembers(t *testing.T) {
	t.Parallel()
	valid, source := promiseTestSource(t)
	tests := map[string]struct {
		member promiseTestTarMember
		want   string
	}{
		"parent escape":  {promiseTestFile("promise-2.3/../escape", nil), "unsafe"},
		"absolute":       {promiseTestFile("/promise-2.3/escape", nil), "unsafe"},
		"backslash":      {promiseTestFile("promise-2.3/dir\\escape", nil), "unsafe"},
		"foreign root":   {promiseTestFile("other/file", nil), "foreign"},
		"dot segment":    {promiseTestFile("promise-2.3/./file", nil), "unsafe"},
		"double slash":   {promiseTestFile("promise-2.3//file", nil), "unsafe"},
		"duplicate":      {valid[1], "duplicate"},
		"missing parent": {promiseTestFile("promise-2.3/missing/file", nil), "missing or non-directory"},
		"file parent":    {promiseTestFile("promise-2.3/LICENSE/file", nil), "non-directory"},
		"deep path":      {promiseTestFile("promise-2.3/"+strings.Repeat("d/", promiseArchiveDepth)+"file", nil), "unsafe"},
		"large member":   {promiseTestFile("promise-2.3/large", make([]byte, promiseArchiveFileBytes+1)), "invalid size"},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			members := append(slices.Clone(valid), test.member)
			promiseRequireSourceError(t, promiseTestGzip(t, promiseTestTar(t, members)), source, test.want)
		})
	}
}

func TestPromiseSourceRejectsLinksSpecialModesAndMetadata(t *testing.T) {
	t.Parallel()
	valid, source := promiseTestSource(t)
	for _, kind := range []byte{tar.TypeLink, tar.TypeSymlink, tar.TypeFifo, tar.TypeChar, tar.TypeBlock} {
		t.Run(fmt.Sprintf("type-%c", kind), func(t *testing.T) {
			t.Parallel()
			member := promiseTestFile("promise-2.3/special", nil)
			member.header.Typeflag = kind
			if kind == tar.TypeLink || kind == tar.TypeSymlink {
				member.header.Linkname = "promise-2.3/LICENSE"
			}
			members := append(slices.Clone(valid), member)
			promiseRequireSourceError(t, promiseTestGzip(t, promiseTestTar(t, members)), source, "special entry")
		})
	}
	for name, mutate := range map[string]func(*tar.Header){
		"setuid": func(header *tar.Header) { header.Mode = 0o4644 },
		"PAX": func(header *tar.Header) {
			header.Format = tar.FormatPAX
			header.PAXRecords = map[string]string{"vendor.key": "value"}
		},
		"GNU long name": func(header *tar.Header) {
			header.Name = "promise-2.3/" + strings.Repeat("a", 110)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			member := promiseTestFile("promise-2.3/metadata", nil)
			mutate(&member.header)
			promiseRequireSourceError(t, promiseTestGzip(t, promiseTestTar(t, append(slices.Clone(valid), member))), source, "metadata")
		})
	}
}

func TestPromiseSourceRejectsMissingAuthorityAndExhaustion(t *testing.T) {
	t.Parallel()
	valid, source := promiseTestSource(t)
	withoutRoot := slices.Clone(valid[1:])
	withoutLicense := append(slices.Clone(valid[:1]), valid[2:]...)
	wrongLicense := slices.Clone(valid)
	wrongLicense[1].body = []byte("different license")
	tooMany := slices.Clone(valid)
	for index := len(tooMany); index <= promiseArchiveEntries; index++ {
		tooMany = append(tooMany, promiseTestFile(fmt.Sprintf("promise-2.3/file-%d", index), nil))
	}
	for name, test := range map[string]struct {
		members []promiseTestTarMember
		want    string
	}{
		"missing root":    {withoutRoot, "root directory"},
		"missing license": {withoutLicense, "LICENSE is missing"},
		"wrong license":   {wrongLicense, "does not match provenance"},
		"entry count":     {tooMany, "entry count limit"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			promiseRequireSourceError(t, promiseTestGzip(t, promiseTestTar(t, test.members)), source, test.want)
		})
	}
	changed := source
	changed.Provenance.LicenseSHA256 = strings.Repeat("0", 64)
	promiseRequireSourceError(t, promiseTestGzip(t, promiseTestTar(t, valid)), changed, "does not match provenance")
	promiseRequireSourceError(t, make([]byte, promiseArchiveBytes+1), source, "compressed byte limit")
	promiseRequireSourceError(t, promiseTestGzip(t, make([]byte, promiseArchiveBytes+1)), source, "expanded byte limit")
}

func TestPromiseSourceRejectsMalformedFramingAndGzipTail(t *testing.T) {
	t.Parallel()
	members, source := promiseTestSource(t)
	valid := promiseTestTar(t, members)
	checksum := bytes.Clone(valid)
	checksum[0] ^= 1
	padding := bytes.Clone(valid)
	padding[2*promiseTarBlockBytes+int(promiseLicenseSize)] = 1
	for name, body := range map[string][]byte{
		"checksum":           checksum,
		"file padding":       padding,
		"one terminator":     valid[:len(valid)-promiseTarBlockBytes],
		"missing terminator": valid[:len(valid)-2*promiseTarBlockBytes],
		"fractional block":   valid[:len(valid)-1],
		"appended tar":       append(bytes.Clone(valid), valid...),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			promiseRequireSourceError(t, promiseTestGzip(t, body), source, "tar")
		})
	}
	compressed := promiseTestGzip(t, valid)
	badCRC := bytes.Clone(compressed)
	badCRC[len(badCRC)-8] ^= 1
	for name, body := range map[string][]byte{
		"CRC":           badCRC,
		"truncated":     compressed[:len(compressed)-5],
		"second member": append(bytes.Clone(compressed), promiseTestGzip(t, nil)...),
		"trailing zero": append(bytes.Clone(compressed), 0),
		"trailing data": append(bytes.Clone(compressed), 'x'),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			promiseRequireSourceError(t, body, source, "gzip")
		})
	}
}

func TestPromiseWheelInspectsContentsAndIndependentLicense(t *testing.T) {
	t.Parallel()
	license := promiseTestLicense(t)
	valid := []promiseTestZipMember{{promiseWheelLicense, license, 0o644}, {"promise/example.py", []byte("pass\n"), 0o644}}
	if err := checkPromiseWheelContents(promiseTestZip(t, valid)); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		members []promiseTestZipMember
		want    string
	}{
		"missing license": {valid[1:], "LICENSE is missing"},
		"wrong license":   {[]promiseTestZipMember{{promiseWheelLicense, []byte("different license"), 0o644}}, "pinned license"},
		"duplicate":       {append(slices.Clone(valid), valid[0]), "duplicate"},
		"parent escape":   {append(slices.Clone(valid), promiseTestZipMember{"../escape", nil, 0o644}), "unsafe"},
		"backslash":       {append(slices.Clone(valid), promiseTestZipMember{"promise\\escape", nil, 0o644}), "unsafe"},
		"absolute":        {append(slices.Clone(valid), promiseTestZipMember{"/escape", nil, 0o644}), "unsafe"},
		"directory":       {append(slices.Clone(valid), promiseTestZipMember{"promise/", nil, fs.ModeDir | 0o755}), "unsafe"},
		"symlink":         {append(slices.Clone(valid), promiseTestZipMember{"promise/link", []byte("LICENSE"), fs.ModeSymlink | 0o777}), "unsafe"},
		"setuid":          {append(slices.Clone(valid), promiseTestZipMember{"promise/setuid", nil, fs.ModeSetuid | 0o755}), "unsafe"},
		"file parent":     {append(slices.Clone(valid), promiseTestZipMember{"promise", nil, 0o644}), "non-directory"},
		"member limit":    {append(slices.Clone(valid), promiseTestZipMember{"promise/large", make([]byte, promiseArchiveFileBytes+1), 0o644}), "byte limit"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			err := checkPromiseWheelContents(promiseTestZip(t, test.members))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("wheel error = %v, want %q", err, test.want)
			}
		})
	}
	if err := verifyPromiseWheel(promiseTestZip(t, valid)); err == nil || !strings.Contains(err.Error(), "selected wheel") {
		t.Fatalf("synthetic wheel acquired exact artifact authority: %v", err)
	}
}

func TestPromiseWheelRejectsCountExpansionAndTrailingData(t *testing.T) {
	t.Parallel()
	valid := []promiseTestZipMember{{promiseWheelLicense, promiseTestLicense(t), 0o644}}
	tooMany := slices.Clone(valid)
	for index := len(tooMany); index <= promiseArchiveEntries; index++ {
		tooMany = append(tooMany, promiseTestZipMember{fmt.Sprintf("promise/file-%d", index), nil, 0o644})
	}
	tooLarge := slices.Clone(valid)
	for index := range 4 {
		tooLarge = append(tooLarge, promiseTestZipMember{fmt.Sprintf("promise/large-%d", index), make([]byte, promiseArchiveFileBytes), 0o644})
	}
	encoded := promiseTestZip(t, valid)
	badCRC := bytes.Clone(encoded)
	directoryOffset := binary.LittleEndian.Uint32(badCRC[len(badCRC)-6 : len(badCRC)-2])
	badCRC[int(directoryOffset)+16] ^= 1
	for name, body := range map[string][]byte{
		"count":     promiseTestZip(t, tooMany),
		"expansion": promiseTestZip(t, tooLarge),
		"prefix":    append([]byte("prefix"), encoded...),
		"trailing":  append(bytes.Clone(encoded), 'x'),
		"oversized": make([]byte, promiseArchiveBytes+1),
		"truncated": encoded[:len(encoded)-1],
		"CRC":       badCRC,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := checkPromiseWheelContents(body); err == nil {
				t.Fatal("invalid wheel ZIP accepted")
			}
		})
	}
}

func TestPromiseOutputRejectsUnexpectedMembersAndIdentity(t *testing.T) {
	t.Parallel()
	wheel := promiseTestFile(promiseWheelFilename, []byte("not the pinned wheel"))
	root := promiseTestDirectory("./")
	for name, test := range map[string]struct {
		members []promiseTestTarMember
		want    string
	}{
		"foreign directory": {[]promiseTestTarMember{promiseTestDirectory("output/")}, "unexpected"},
		"foreign file":      {[]promiseTestTarMember{promiseTestFile("other.whl", nil)}, "unexpected"},
		"parent escape":     {[]promiseTestTarMember{promiseTestFile("../"+promiseWheelFilename, nil)}, "unexpected"},
		"double dot prefix": {[]promiseTestTarMember{promiseTestFile("././"+promiseWheelFilename, nil)}, "unexpected"},
		"duplicate root":    {[]promiseTestTarMember{root, promiseTestDirectory(".")}, "duplicate"},
		"duplicate wheel":   {[]promiseTestTarMember{wheel, wheel}, "duplicate"},
		"directory wheel":   {[]promiseTestTarMember{promiseTestDirectory(promiseWheelFilename)}, "unexpected"},
		"wrong wheel":       {[]promiseTestTarMember{root, wheel}, "selected wheel"},
		"missing wheel":     {[]promiseTestTarMember{root}, "selected wheel"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			body, err := parsePromiseOutput(promiseTestTar(t, test.members))
			if err == nil || body != nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("output bytes = %d, error = %v, want %q", len(body), err, test.want)
			}
		})
	}
	if _, err := parsePromiseOutput(make([]byte, promiseMaximumOutputTarBytes+1)); err == nil {
		t.Fatal("oversized Docker output accepted")
	}
}

func TestRetainedPromiseArchiveInputs(t *testing.T) {
	sourcePath := os.Getenv("CLRS_PROMISE_TEST_SOURCE")
	wheelPath := os.Getenv("CLRS_PROMISE_TEST_WHEEL")
	if sourcePath == "" && wheelPath == "" {
		if RetainedInputsRequired() {
			t.Fatal(RetainedInputsRequiredVariable + "=1 but CLRS_PROMISE_TEST_SOURCE and CLRS_PROMISE_TEST_WHEEL are unset")
		}
		t.Skip("set explicit CLRS_PROMISE_TEST_SOURCE and CLRS_PROMISE_TEST_WHEEL for retained-byte inspection")
	}
	if sourcePath == "" || wheelPath == "" {
		t.Fatal("both retained artifact paths are required")
	}
	manifest, _, _, _ := trackedGeneratorWheelhouseManifest(t)
	source := promiseReadTestInput(t, sourcePath)
	if int64(len(source)) != manifest.SourceBuild.SourceSizeBytes || rawSHA256(source) != manifest.SourceBuild.SourceSHA256 {
		t.Fatal("retained source differs from locked identity")
	}
	canonical, err := preparePromiseSource(source, manifest.SourceBuild)
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(canonical)) != promiseCanonicalTarSize || rawSHA256(canonical) != promiseCanonicalTarSHA256 {
		t.Fatal("retained source canonical transfer differs from its frozen identity")
	}
	entries, err := readPromiseTar(canonical, promiseArchiveBytes)
	if err != nil || len(entries) != 32 {
		t.Fatalf("retained source canonical entries = %d: %v", len(entries), err)
	}
	wheel := promiseReadTestInput(t, wheelPath)
	if err := verifyPromiseWheel(wheel); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{promiseWheelFilename, "./" + promiseWheelFilename} {
		output := promiseTestTar(t, []promiseTestTarMember{promiseTestDirectory("./"), promiseTestFile(name, wheel)})
		parsed, err := parsePromiseOutput(output)
		if err != nil || !bytes.Equal(parsed, wheel) {
			t.Fatalf("retained wheel Docker output %q differs: %v", name, err)
		}
	}
	t.Logf("canonical source tar: bytes=%d SHA256=%s entries=%d; pinned wheel bytes=%d SHA256=%s",
		len(canonical), rawSHA256(canonical), len(entries), len(wheel), rawSHA256(wheel))
}

func promiseTestSource(t *testing.T) ([]promiseTestTarMember, GeneratorWheelSourceBuild) {
	t.Helper()
	return []promiseTestTarMember{
		promiseTestDirectory("promise-2.3/"),
		promiseTestFile("promise-2.3/LICENSE", promiseTestLicense(t)),
		promiseTestDirectory("promise-2.3/promise/"),
		promiseTestFile("promise-2.3/promise/example.py", []byte("pass\n")),
		promiseTestFile("promise-2.3/promise/py.typed", nil),
	}, GeneratorWheelSourceBuild{Provenance: GeneratorWheelSourceProvenance{
		SourceLicensePath: "LICENSE", LicenseSizeBytes: promiseLicenseSize, LicenseSHA256: promiseLicenseSHA256,
	}}
}

func promiseTestLicense(t *testing.T) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(trackedRepositoryRoot(t), promiseLicensePath))
	if err != nil {
		t.Fatal(err)
	}
	if int64(len(body)) != promiseLicenseSize || rawSHA256(body) != promiseLicenseSHA256 {
		t.Fatal("tracked Promise MIT license differs from pinned bytes")
	}
	return body
}

func promiseTestFile(name string, body []byte) promiseTestTarMember {
	return promiseTestTarMember{header: tar.Header{
		Name: name, Typeflag: tar.TypeReg, Mode: 0o644, Uid: 501, Gid: 20,
		Uname: "source-owner", Gname: "source-group", ModTime: time.Unix(1_576_657_474, 0), Format: tar.FormatGNU,
	}, body: body}
}

func promiseTestDirectory(name string) promiseTestTarMember {
	member := promiseTestFile(name, nil)
	member.header.Typeflag = tar.TypeDir
	member.header.Mode = 0o755
	return member
}

func promiseTestTar(t *testing.T, members []promiseTestTarMember) []byte {
	t.Helper()
	var body bytes.Buffer
	writer := tar.NewWriter(&body)
	for _, member := range members {
		header := member.header
		header.Size = int64(len(member.body))
		if err := writer.WriteHeader(&header); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(member.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func promiseTestGzip(t *testing.T, body []byte) []byte {
	t.Helper()
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	writer.Name = "dist/promise-2.3.tar"
	if _, err := writer.Write(body); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return compressed.Bytes()
}

func promiseRequireSourceError(t *testing.T, body []byte, source GeneratorWheelSourceBuild, want string) {
	t.Helper()
	output, err := preparePromiseSource(body, source)
	if err == nil || output != nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("source output bytes = %d, error = %v, want %q", len(output), err, want)
	}
}

type promiseTestZipMember struct {
	name string
	body []byte
	mode fs.FileMode
}

func promiseTestZip(t *testing.T, members []promiseTestZipMember) []byte {
	t.Helper()
	var body bytes.Buffer
	writer := zip.NewWriter(&body)
	for _, member := range members {
		header := &zip.FileHeader{Name: member.name, Method: zip.Deflate}
		header.SetMode(member.mode)
		file, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(member.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func promiseReadTestInput(t *testing.T, name string) []byte {
	t.Helper()
	file, err := os.Open(name)
	if err != nil {
		t.Fatal(err)
	}
	body, readErr := io.ReadAll(io.LimitReader(file, promiseArchiveBytes+1))
	closeErr := file.Close()
	if readErr != nil || closeErr != nil || len(body) > promiseArchiveBytes {
		t.Fatalf("read retained input %q: read=%v close=%v bytes=%d", name, readErr, closeErr, len(body))
	}
	return body
}
