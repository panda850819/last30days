export interface CommandResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandRunner = (
  command: string[],
  options?: { timeoutMs?: number; env?: Record<string, string | undefined>; signal?: AbortSignal | undefined },
) => Promise<CommandResult>;

function signalTree(rootPid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/PID", String(rootPid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  // detached:true makes rootPid the process-group leader. A negative pid sends
  // one signal to the whole group, including descendants that inherited pipes.
  try { process.kill(-rootPid, signal); } catch { /* process group already exited */ }
}

export const runCommand: CommandRunner = async (command, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...options.env }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const processHandle = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", env, detached: true });
  let timedOut = false;
  let terminationReason = `Timed out after ${timeoutMs}ms`;
  let hardKill: ReturnType<typeof setTimeout> | undefined;
  const terminate = (reason: string) => {
    if (timedOut) return;
    timedOut = true;
    terminationReason = reason;
    signalTree(processHandle.pid, "SIGTERM");
    hardKill = setTimeout(() => signalTree(processHandle.pid, "SIGKILL"), 250);
  };
  const timer = setTimeout(() => terminate(`Timed out after ${timeoutMs}ms`), timeoutMs);
  const abort = () => terminate("Aborted by source wall-clock deadline");
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
      processHandle.exited,
    ]);
    return timedOut
      ? { command, exitCode: 124, stdout, stderr: stderr || terminationReason, timedOut: true }
      : { command, exitCode, stdout, stderr, timedOut: false };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (hardKill && !timedOut) clearTimeout(hardKill);
  }
};

export function commandExists(command: string): boolean {
  return Bun.which(command) !== null;
}
