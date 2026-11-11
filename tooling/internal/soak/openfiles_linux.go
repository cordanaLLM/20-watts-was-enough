//go:build linux

package soak

// descriptorDirectory lists one entry per open descriptor of this process.
const descriptorDirectory = "/proc/self/fd"
