// Package releasetag owns the exact final and release-candidate tag grammar.
package releasetag

// Pattern accepts final tags and canonical, nonnegative release-candidate numbers.
const Pattern = `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.(0|[1-9][0-9]*))?$`
