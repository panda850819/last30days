import { runCommand, type CommandRunner } from "../core/command";
import { resolvePublicHttpUrl } from "../core/network";

export interface PageContent {
  ok: boolean;
  backend: "summarize";
  url: string;
  title?: string;
  content?: string;
  error?: string;
  truncated?: boolean;
}

interface SummarizeJson {
  extracted?: {
    url?: unknown;
    title?: unknown;
    content?: unknown;
    truncated?: unknown;
  };
  error?: unknown;
}

export function parseSummarizeOutput(stdout: string, requestedUrl: string): PageContent {
  let payload: SummarizeJson;
  try {
    payload = JSON.parse(stdout) as SummarizeJson;
  } catch {
    return { ok: false, backend: "summarize", url: requestedUrl, error: "summarize returned invalid JSON" };
  }
  const content = String(payload.extracted?.content ?? "").trim();
  if (!content) return { ok: false, backend: "summarize", url: requestedUrl, error: String(payload.error ?? "summarize returned no content") };
  return {
    ok: true,
    backend: "summarize",
    url: String(payload.extracted?.url || requestedUrl),
    title: String(payload.extracted?.title ?? ""),
    content,
    truncated: Boolean(payload.extracted?.truncated),
  };
}

export class SummarizeReader {
  constructor(private readonly runner: CommandRunner = runCommand) {}
  available(): boolean {
    // Disabled until redirect-by-redirect public-address enforcement can be
    // guaranteed by the process that owns the HTTP connection.
    return false;
  }
  async read(url: string, maxCharacters = 20_000, signal?: AbortSignal): Promise<PageContent> {
    const publicUrl = await resolvePublicHttpUrl(url);
    if (!publicUrl) return { ok: false, backend: "summarize", url, error: "Refusing to extract a local, private-network, credentialed, or non-HTTP URL" };
    if (!this.available()) return { ok: false, backend: "summarize", url, error: "summarize is not on PATH" };
    const result = await this.runner([
      "summarize",
      publicUrl.toString(),
      "--extract",
      "--format",
      "md",
      "--markdown-mode",
      "readability",
      "--preprocess",
      "off",
      "--max-extract-characters",
      String(maxCharacters),
      "--json",
      "--timeout",
      "45s",
    ], { timeoutMs: 60_000, signal });
    if (result.timedOut) return { ok: false, backend: "summarize", url, error: result.stderr || "summarize timed out" };
    if (result.exitCode !== 0 && !result.stdout) return { ok: false, backend: "summarize", url, error: result.stderr || `summarize exited ${result.exitCode}` };
    const page = parseSummarizeOutput(result.stdout, publicUrl.toString());
    if (!page.ok) return page;
    const extractedUrl = await resolvePublicHttpUrl(page.url);
    if (!extractedUrl) return { ok: false, backend: "summarize", url, error: "summarize redirected to a local, private-network, credentialed, or non-HTTP URL" };
    return { ...page, url: extractedUrl.toString() };
  }
}
