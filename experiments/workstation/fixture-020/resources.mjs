import { readText } from "./storage.mjs";

export async function processCounters() {
  if (process.platform !== "linux") return { peak_resident_bytes: null,
    bytes_read: null, bytes_written: null, counter_mode: "unavailable-on-this-platform",
    current_resident_bytes: process.memoryUsage().rss };
  const status = await readText("/proc/self/status");
  const io = await readText("/proc/self/io");
  const peak = /^VmHWM:\s+(\d+) kB$/m.exec(status);
  const reads = /^rchar: (\d+)$/m.exec(io);
  const writes = /^wchar: (\d+)$/m.exec(io);
  if (!peak || !reads || !writes) throw new Error("ICP-T01 Linux process counters unavailable.");
  return { peak_resident_bytes: Number(peak[1]) * 1024, bytes_read: Number(reads[1]),
    bytes_written: Number(writes[1]), counter_mode: "linux-self-process-high-water-and-syscall-bytes",
    current_resident_bytes: process.memoryUsage().rss };
}
