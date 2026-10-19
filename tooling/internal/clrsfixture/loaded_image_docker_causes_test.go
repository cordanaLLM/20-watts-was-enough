package clrsfixture

import (
	"errors"
	"os/exec"
	"testing"
)

func TestLoadedImageExitCausesBoundAndVariations(t *testing.T) {
	cmd := exec.Command("sh", "-c", "exit 1")
	exit1 := cmd.Run()
	if _, ok := exit1.(*exec.ExitError); !ok {
		t.Skip("exec exit 1 did not produce ExitError")
	}

	cmd2 := exec.Command("sh", "-c", "exit 2")
	exit2 := cmd2.Run()

	remaining := 16
	if loadedImageExitCauses(nil, &remaining) {
		t.Fatal("nil error must return false")
	}

	remaining = 0
	if loadedImageExitCauses(exit1, &remaining) {
		t.Fatal("zero remaining must return false")
	}

	remaining = 16
	if !loadedImageExitCauses(exit1, &remaining) {
		t.Fatal("exit 1 error must return true")
	}

	remaining = 16
	if loadedImageExitCauses(exit2, &remaining) {
		t.Fatal("exit 2 error must return false")
	}

	remaining = 16
	joined := errors.Join(exit1, exit1)
	if !loadedImageExitCauses(joined, &remaining) {
		t.Fatal("joined exit 1 errors must return true")
	}

	remaining = 16
	joinedBad := errors.Join(exit1, errors.New("other"))
	if loadedImageExitCauses(joinedBad, &remaining) {
		t.Fatal("joined with non-exit error must return false")
	}

	// Boundary test: remaining = 4
	// root unwrap (1) + 3 leaves = 4 steps -> succeeds
	remaining = 4
	threeLeaves := errors.Join(exit1, exit1, exit1)
	if !loadedImageExitCauses(threeLeaves, &remaining) {
		t.Fatal("three leaves with remaining 4 must succeed")
	}

	// root unwrap (1) + 4 leaves = 5 steps -> exceeds remaining 4
	remaining = 4
	fourLeaves := errors.Join(exit1, exit1, exit1, exit1)
	if loadedImageExitCauses(fourLeaves, &remaining) {
		t.Fatal("four leaves with remaining 4 must fail closed")
	}
}
