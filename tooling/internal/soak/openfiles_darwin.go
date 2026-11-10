//go:build darwin

package soak

// descriptorDirectory lists one entry per open descriptor of this process.
const descriptorDirectory = "/dev/fd"
