package clrsfixture

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
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

// identityBuilder collects the length-prefixed encoding and hashes it once in
// sum, so no fallible hash write sits between the fields and the identity.
type identityBuilder struct {
	encoded []byte
}

func newIdentityBuilder(domain string) identityBuilder {
	builder := identityBuilder{}
	builder.addString(domain)
	return builder
}

func (builder *identityBuilder) addBytes(value []byte) {
	builder.encoded = binary.BigEndian.AppendUint64(builder.encoded, uint64(len(value)))
	builder.encoded = append(builder.encoded, value...)
}

func (builder *identityBuilder) addString(value string) {
	builder.addBytes([]byte(value))
}

func (builder *identityBuilder) addInt64(value int64) {
	var encoded [8]byte
	binary.BigEndian.PutUint64(encoded[:], uint64(value))
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
	return sha256.Sum256(builder.encoded)
}
