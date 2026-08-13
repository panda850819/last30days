import { commandExists, runCommand, type CommandRunner } from "../core/command";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { numberValue, statusFromExit, unavailable } from "./helpers";

interface ArxivEntry {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  published?: unknown;
  updated?: unknown;
  authors?: Array<{ name?: unknown }>;
  links?: Array<{ href?: unknown; rel?: unknown }>;
}

interface TechmemeEntry {
  num?: unknown;
  source?: unknown;
  headline?: unknown;
  link?: unknown;
  date?: unknown;
}

export function parseArxivEntries(entries: ArxivEntry[]): SourceItem[] {
  return entries.flatMap((entry): SourceItem[] => {
    const id = String(entry.id ?? "").trim();
    const title = String(entry.title ?? "").replace(/\s+/g, " ").trim();
    if (!id || !title) return [];
    const url = String(entry.links?.find((link) => link.rel === "alternate")?.href || id);
    return [{
      id,
      source: "arxiv",
      title,
      url,
      publishedAt: String(entry.published || entry.updated || "").slice(0, 10),
      author: (entry.authors ?? []).map((author) => String(author.name ?? "")).filter(Boolean).join(", "),
      snippet: String(entry.summary ?? "").replace(/\s+/g, " ").slice(0, 500),
      engagement: {},
    }];
  });
}

export function parseTechmemeEntries(entries: TechmemeEntry[]): SourceItem[] {
  return entries.flatMap((entry, index): SourceItem[] => {
    const title = String(entry.headline ?? "").trim();
    const url = String(entry.link ?? "").trim();
    if (!title || !url) return [];
    return [{
      id: `techmeme-${entry.num ?? index + 1}-${Bun.hash(url)}`,
      source: "techmeme",
      title,
      url,
      ...(String(entry.date ?? "") ? { publishedAt: String(entry.date).slice(0, 10) } : {}),
      author: String(entry.source ?? ""),
      engagement: { rank: Math.max(0, 100 - numberValue(entry.num)) },
    }];
  });
}

export class ArxivSource implements Source {
  readonly name = "arxiv";
  constructor(private readonly runner: CommandRunner = runCommand) {}
  async availability(): Promise<SourceAvailability> {
    return commandExists("arxiv-pp-cli") ? { available: true, backend: "arxiv-pp-cli" } : { available: false, backend: "arxiv-pp-cli", detail: "arxiv-pp-cli is not on PATH" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    if (!commandExists("arxiv-pp-cli")) return unavailable(this.name, "arxiv-pp-cli", "arxiv-pp-cli is not on PATH");
    const result = await this.runner(["arxiv-pp-cli", "query", "--search-query", `all:\"${request.topic.replaceAll('"', "")}\"`, "--sort-by", "relevance", "--max-results", String(request.limit), "--agent"], { timeoutMs: 30_000, signal: request.signal });
    if (result.exitCode !== 0) return { source: this.name, backend: "arxiv-pp-cli", status: statusFromExit(result.exitCode, result.stderr), items: [], error: result.stderr };
    try {
      const payload = JSON.parse(result.stdout) as { results?: { entries?: ArxivEntry[] } | ArxivEntry[] };
      const entries = Array.isArray(payload.results) ? payload.results : payload.results?.entries ?? [];
      const items = parseArxivEntries(entries).slice(0, request.limit);
      return { source: this.name, backend: "arxiv-pp-cli", status: items.length ? "ok" : "no-results", items };
    } catch { return { source: this.name, backend: "arxiv-pp-cli", status: "error", items: [], error: "arxiv-pp-cli returned invalid JSON" }; }
  }
}

export class TechmemeSource implements Source {
  readonly name = "techmeme";
  constructor(private readonly runner: CommandRunner = runCommand) {}
  async availability(): Promise<SourceAvailability> {
    return commandExists("techmeme-pp-cli") ? { available: true, backend: "techmeme-pp-cli" } : { available: false, backend: "techmeme-pp-cli", detail: "techmeme-pp-cli is not on PATH" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    if (!commandExists("techmeme-pp-cli")) return unavailable(this.name, "techmeme-pp-cli", "techmeme-pp-cli is not on PATH");
    const result = await this.runner(["techmeme-pp-cli", "search", request.topic, "--json"], { timeoutMs: 30_000, signal: request.signal });
    if (result.exitCode !== 0) return { source: this.name, backend: "techmeme-pp-cli", status: statusFromExit(result.exitCode, result.stderr), items: [], error: result.stderr };
    try {
      const payload = JSON.parse(result.stdout) as TechmemeEntry[] | { results?: TechmemeEntry[] };
      const entries = Array.isArray(payload) ? payload : payload.results ?? [];
      const items = parseTechmemeEntries(entries)
        .filter((item) => !item.publishedAt || (item.publishedAt >= request.window.from && item.publishedAt <= request.window.to))
        .slice(0, request.limit);
      return { source: this.name, backend: "techmeme-pp-cli", status: items.length ? "ok" : "no-results", items };
    } catch { return { source: this.name, backend: "techmeme-pp-cli", status: "error", items: [], error: "techmeme-pp-cli returned invalid JSON" }; }
  }
}
