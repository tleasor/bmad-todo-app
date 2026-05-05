const processes = [
  Bun.spawn(["bun", "run", "--cwd", "apps/api", "dev"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(["bun", "run", "--cwd", "apps/web", "dev"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
];

const KILL_TIMEOUT_MS = 5000;
const SIGNAL_EXIT_CODES: Record<string, number> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

let shuttingDown = false;
let signalExitCode: number | null = null;

const stopAll = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const proc of processes) {
    proc.kill();
  }
  // Escalate to SIGKILL for any child that ignores SIGTERM.
  setTimeout(() => {
    for (const proc of processes) {
      proc.kill("SIGKILL");
    }
  }, KILL_TIMEOUT_MS).unref();
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    signalExitCode = SIGNAL_EXIT_CODES[signal];
    stopAll();
  });
}

// Wait for ALL children to exit (not just the first), so neither is orphaned.
const exits = await Promise.all(
  processes.map(async (proc) => {
    const code = await proc.exited;
    stopAll();
    return code ?? 1;
  }),
);

if (signalExitCode !== null) process.exit(signalExitCode);

const firstFailure = exits.find((c) => c !== 0);
process.exit(firstFailure ?? 0);
