import os from "node:os";
import test from "node:test";

export const HOST_LOAD_PER_CPU_LIMIT = 2;

export function hostDeadlineFailure(budgetMs, loadPerCpu) {
  const prefix = loadPerCpu > HOST_LOAD_PER_CPU_LIMIT ? "UNDECIDED: host starved; " : "";
  return new Error(`${prefix}test exceeded ${budgetMs} wall ms; load per available CPU ${loadPerCpu}`);
}

// Parent CPU usage excludes the isolated children. Keep the wall deadline,
// abort through node:test, and identify overload rather than undercount CPU.
export function testWithHostDeadline(name, { timeout }, run) {
  const controller = new AbortController();
  return test(name, { signal: controller.signal }, async (context) => {
    const loadPerCpu = () => os.loadavg()[0] / os.availableParallelism();
    const initialLoad = loadPerCpu();
    const timer = setTimeout(() => {
      controller.abort(hostDeadlineFailure(timeout, Math.max(initialLoad, loadPerCpu())));
    }, timeout);
    try {
      await run(context);
    } finally {
      clearTimeout(timer);
    }
  });
}
