import { fetchWithDeadline, isTimeoutError } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { SummarizeReader } from "../readers/summarize";

type Fetcher = typeof fetch;

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function resultUrl(raw: string): string {
  const decoded = raw.replaceAll("&amp;", "&");
  try {
    const url = new URL(decoded, "https://html.duckduckgo.com");
    return url.searchParams.get("uddg") || url.toString();
  } catch {
    return decoded;
  }
}

export function parseDuckDuckGoHtml(html: string, limit: number): SourceItem[] {
  const anchors = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  return anchors.slice(0, limit).flatMap((match, index): SourceItem[] => {
    const url = resultUrl(match[1] ?? "");
    const title = decodeHtml(match[2] ?? "");
    if (!url.startsWith("http") || !title) return [];
    return [{
      id: `web-${index + 1}-${Bun.hash(url)}`,
      source: "web",
      title,
      url,
      snippet: "",
      engagement: {},
      metadata: { searchBackend: "duckduckgo-html" },
    }];
  });
}

export class WebSource implements Source {
  readonly name = "web";
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly reader = new SummarizeReader(),
  ) {}
  async availability(): Promise<SourceAvailability> {
    return { available: true, backend: this.reader.available() ? "duckduckgo+summarize" : "duckduckgo" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    const today = new Date().toISOString().slice(0, 10);
    if (request.window.to < today) {
      return { source: this.name, backend: "duckduckgo", status: "unavailable", items: [], error: "DuckDuckGo HTML results do not provide verifiable point-in-time publication dates" };
    }
    try {
      const response = await fetchWithDeadline(this.fetcher, "https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 last30days-bun/0.1",
        },
        body: new URLSearchParams({ q: `${request.topic} after:${request.window.from} before:${request.window.to}` }),
      }, { timeoutMs: 20_000, signal: request.signal });
      if (!response.ok) return { source: this.name, backend: "duckduckgo", status: response.status === 429 ? "rate-limited" : "error", items: [], error: `HTTP ${response.status}` };
      const items = parseDuckDuckGoHtml(await response.text(), request.limit);
      const enrichmentLimit = request.depth === "quick" ? 1 : request.depth === "deep" ? 5 : 3;
      let extractionFailed = false;
      const enriched = await Promise.all(items.map(async (item, index) => {
        if (index >= enrichmentLimit || !this.reader.available()) return item;
        const page = await this.reader.read(item.url, 20_000, request.signal);
        if (!page.ok) {
          extractionFailed = true;
          return { ...item, metadata: { ...item.metadata, extractionError: page.error } };
        }
        const content = page.content ?? "";
        return {
          ...item,
          title: page.title || item.title,
          body: content,
          snippet: content.slice(0, 500),
          metadata: {
            ...item.metadata,
            pageBackend: page.backend,
            ...(page.truncated === undefined ? {} : { truncated: page.truncated }),
          },
        };
      }));
      return {
        source: this.name,
        backend: this.reader.available() ? "duckduckgo+summarize" : "duckduckgo",
        status: extractionFailed ? "partial" : enriched.length ? "ok" : "no-results",
        items: enriched,
        ...(extractionFailed ? { error: "One or more page extractions failed; search snippets remain available" } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: this.name, backend: "duckduckgo", status: isTimeoutError(error) ? "timeout" : "error", items: [], error: message };
    }
  }
}
