package clrsfixture

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"hash"
)

// SourceID binds one validated upstream source record.
type SourceID [sha256.Size]byte

// ContractID binds one validated generation contract to its exact source.
type ContractID [sha256.Size]byte

// CandidateID binds candidate-visible input without incorporating its answer.
type CandidateID [sha256.Size]byte

// VerifierID binds one candidate identity to its verifier-only reference.
type VerifierID [sha256.Size]byte

func (id SourceID) String() string {
	return "sha256:" + hex.EncodeToString(id[:])
}

func (id ContractID) String() string {
	return "sha256:" + hex.EncodeToString(id[:])
}

func (id CandidateID) String() string {
	return "sha256:" + hex.EncodeToString(id[:])
}

func (id VerifierID) String() string {
	return "sha256:" + hex.EncodeToString(id[:])
}

type identityBuilder struct {
	hash    hash.Hash
	scratch [8]byte
}

func newIdentityBuilder(domain string) identityBuilder {
	builder := identityBuilder{hash: sha256.New()}
	builder.addString(domain)
	return builder
}

func (builder *identityBuilder) addBytes(value []byte) {
	binary.BigEndian.PutUint64(builder.scratch[:], uint64(len(value)))
	_, _ = builder.hash.Write(builder.scratch[:])
	_, _ = builder.hash.Write(value)
}

func (builder *identityBuilder) addString(value string) {
	builder.addBytes([]byte(value))
}

func (builder *identityBuilder) addInt64(value int64) {
	var encoded [8]byte
	binary.BigEndian.PutUint64(encoded[:], uint64(value)) //#nosec G115 -- two's complement bitcast of int64 to 8 big-endian bytes for hashing
	builder.addBytes(encoded[:])
}

func (builder *identityBuilder) addUint64(value uint64) {
	var encoded [8]byte
	binary.BigEndian.PutUint64(encoded[:], value)
	builder.addBytes(encoded[:])
}

func (builder *identityBuilder) addBool(value bool) {
	if value {
		builder.addBytes([]byte{1})
		return
	}
	builder.addBytes([]byte{0})
}

func (builder *identityBuilder) sum() [sha256.Size]byte {
	return [sha256.Size]byte(builder.hash.Sum(nil))
}
