package clrsfixture

import (
	"crypto/sha256"
	"encoding/binary"
	"testing"
)

func TestIdentityBuilderHashesTheLengthPrefixedEncoding(t *testing.T) {
	t.Parallel()
	var want []byte
	for _, part := range [][]byte{[]byte("20w/test/v1"), []byte("ab"), {}, {1}} {
		want = binary.BigEndian.AppendUint64(want, uint64(len(part)))
		want = append(want, part...)
	}
	builder := newIdentityBuilder("20w/test/v1")
	builder.addString("ab")
	builder.addBytes(nil)
	builder.addBool(true)
	if got := builder.sum(); got != sha256.Sum256(want) {
		t.Fatalf("sum() = %x, want %x", got, sha256.Sum256(want))
	}
	other := newIdentityBuilder("20w/test/v1")
	other.addString("a")
	other.addString("b")
	if other.sum() == builder.sum() {
		t.Fatal("length prefixes must separate adjacent fields")
	}
}
