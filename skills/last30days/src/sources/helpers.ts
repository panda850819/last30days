import type { SourceResult, SourceStatus } from "../core/types";

export function unavailable(source: string, backend: string, error: string): SourceResult {
  return { source, backend, status: "unavailable", items: [], error };
}

export function statusFromExit(exitCode: number, stderr = ""): SourceStatus {
  if (exitCode === 3 || /auth|unauthorized|forbidden|login/i.test(stderr)) return "auth-failed";
  if (exitCode === 5) return "partial";
  if (exitCode === 6 || /rate.?limit|429/i.test(stderr)) return "rate-limited";
  if (exitCode === 124 || /timed? out|timeout/i.test(stderr)) return "timeout";
  return "error";
}

export function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function isoDate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || value.length < 8) return undefined;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  const twitter = value.match(/^[A-Za-z]{3}\s([A-Za-z]{3})\s(\d{1,2})\s\d{2}:\d{2}:\d{2}\s[+-]\d{4}\s(\d{4})$/);
  if (twitter) {
    const reparsed = Date.parse(`${twitter[1]} ${twitter[2]}, ${twitter[3]} UTC`);
    if (Number.isFinite(reparsed)) return new Date(reparsed).toISOString().slice(0, 10);
  }
  return undefined;
}
