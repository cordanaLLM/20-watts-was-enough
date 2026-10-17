package workstationrunner

import "github.com/cordanaLLM/20-watts-was-enough/tooling/internal/testtmp"

// TestMain in runner_test.go dispatches helper subprocesses, so the pin runs
// from init, before it.
func init() {
	if err := testtmp.Pin(); err != nil {
		panic(err)
	}
}
