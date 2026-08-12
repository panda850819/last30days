export type Fetcher = typeof fetch;

export interface FetchDeadlineOptions {
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
}

export async function fetchWithDeadline(
  fetcher: Fetcher,
  input: Parameters<Fetcher>[0],
  init: RequestInit = {},
  options: FetchDeadlineOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signals = [timeout, options.signal, init.signal].filter((signal): signal is AbortSignal => Boolean(signal));
  const signal = signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
  return fetcher(input, { ...init, signal });
}

export function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /abort|timeout|timed out/i.test(message);
}
