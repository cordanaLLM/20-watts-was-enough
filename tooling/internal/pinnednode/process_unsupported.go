//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris

package pinnednode

import (
	"errors"
	"os/exec"
)

func configureProcess(_ *exec.Cmd) (func() error, error) {
	return nil, errors.New("the pinned-node pre-push gate needs Unix process-group cleanup and refuses this platform; push from Linux or macOS (decision 0129)")
}
