import type { Last30DaysConfig } from "./config";
import { commandExists } from "./core/command";
import { defaultSources } from "./sources";

export interface DoctorEntry {
  source: string;
  backend: string;
  state: "available" | "unavailable" | "unverified";
  authenticated?: boolean;
  detail?: string;
  paid: boolean;
}

export interface DoctorReport {
  schemaVersion: 1;
  generatedAt: string;
  sources: DoctorEntry[];
  policy: {
    browserCookiesApproved: boolean;
    paidXFallbackApproved: boolean;
  };
}

export async function runDoctor(config: Last30DaysConfig): Promise<DoctorReport> {
  const entries = await Promise.all(defaultSources(config).map(async (source): Promise<DoctorEntry> => {
    const availability = await source.availability();
    const unverified = availability.available && availability.authenticated === undefined && source.name === "x";
    return {
      source: source.name,
      backend: availability.backend,
      state: unverified ? "unverified" : availability.available ? "available" : "unavailable",
      ...(availability.authenticated === undefined ? {} : { authenticated: availability.authenticated }),
      ...(availability.detail ? { detail: availability.detail } : {}),
      paid: false,
    };
  }));
  entries.push({
    source: "page-reader",
    backend: "summarize",
    state: "unavailable",
    detail: commandExists("summarize") ? "installed, but automatic URL extraction is disabled until redirect-safe public-address enforcement is available" : "summarize is not on PATH; web results use snippets",
    paid: false,
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: entries,
    policy: {
      browserCookiesApproved: config.allowBrowserCookies,
      paidXFallbackApproved: config.allowPaidXFallback,
    },
  };
}

export function renderDoctor(report: DoctorReport): string {
  const lines = ["last30days doctor", ""];
  for (const source of report.sources) {
    const marker = source.state === "available" ? "✓" : source.state === "unverified" ? "?" : "✗";
    lines.push(`${marker} ${source.source} via ${source.backend}: ${source.state}${source.detail ? ` - ${source.detail}` : ""}`);
  }
  lines.push("", `Browser cookies approved: ${report.policy.browserCookiesApproved ? "yes" : "no"}`);
  lines.push(`Paid X fallback approved: ${report.policy.paidXFallbackApproved ? "yes" : "no"}`);
  return lines.join("\n");
}
