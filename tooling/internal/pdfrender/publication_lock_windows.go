//go:build windows

package pdfrender

import (
	"errors"
	"math"
	"syscall"
)

const (
	processQueryLimitedInformation = 0x1000
	// OpenProcess reports a missing process as ERROR_INVALID_PARAMETER (87);
	// psutil reads the same code the same way (psutil/arch/windows/proc_utils.c).
	errorInvalidParameter syscall.Errno = 87
)

// processExited reports true only when Windows rejects the identifier as
// naming no process. Access denial means some process holds it.
func processExited(pid int) (bool, error) {
	if pid <= 0 || pid > math.MaxUint32 {
		return false, nil
	}
	handle, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(pid))
	if err == nil {
		return false, syscall.CloseHandle(handle)
	}
	if errors.Is(err, errorInvalidParameter) {
		return true, nil
	}
	if errors.Is(err, syscall.ERROR_ACCESS_DENIED) {
		return false, nil
	}
	return false, err
}
