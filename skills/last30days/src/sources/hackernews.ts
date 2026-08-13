import { fetchWithDeadline, isTimeoutError } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { numberValue } from "./helpers";

type Fetcher = typeof fetch;

interface AlgoliaHit {
  objectID?: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  author?: string;
  created_at?: string;
  points?: number;
  num_comments?: number;
  story_text?: string;
  comment_text?: string;
}

export function parseHackerNewsHits(hits: AlgoliaHit[]): SourceItem[] {
  return hits.flatMap((hit): SourceItem[] => {
    const id = String(hit.objectID ?? "").trim();
    const title = (hit.title || hit.story_title || "").trim();
    if (!id || !title) return [];
    return [{
      id,
      source: "hackernews",
      title,
      url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${id}`,
      ...(hit.created_at ? { publishedAt: hit.created_at.slice(0, 10) } : {}),
      ...(hit.author ? { author: hit.author } : {}),
      snippet: (hit.story_text || hit.comment_text || "").replace(/<[^>]+>/g, " ").slice(0, 500),
      engagement: { points: numberValue(hit.points), comments: numberValue(hit.num_comments) },
      metadata: { discussionUrl: `https://news.ycombinator.com/item?id=${id}` },
    }];
  });
}

export class HackerNewsSource implements Source {
  readonly name = "hackernews";
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async availability(): Promise<SourceAvailability> {
    return { available: true, backend: "hn-algolia" };
  }

  async search(request: SourceRequest): Promise<SourceResult> {
    const from = Math.floor(new Date(`${request.window.from}T00:00:00Z`).getTime() / 1000);
    const to = Math.floor(new Date(`${request.window.to}T23:59:59Z`).getTime() / 1000);
    const count = Math.min(request.limit, request.depth === "deep" ? 60 : request.depth === "quick" ? 15 : 30);
    const params = new URLSearchParams({
      tags: request.mode === "discover" ? "front_page" : "story",
      numericFilters: `created_at_i>=${from},created_at_i<=${to}`,
      hitsPerPage: String(count),
    });
    if (request.mode !== "discover" || request.topic !== "trending") params.set("query", request.topic);
    try {
      const response = await fetchWithDeadline(this.fetcher, `https://hn.algolia.com/api/v1/search?${params}`, {}, { timeoutMs: 20_000, signal: request.signal });
      if (!response.ok) {
        return { source: this.name, backend: "hn-algolia", status: response.status === 429 ? "rate-limited" : "error", items: [], error: `HTTP ${response.status}` };
      }
      const payload = await response.json() as { hits?: AlgoliaHit[] };
      const items = parseHackerNewsHits(payload.hits ?? []);
      return { source: this.name, backend: "hn-algolia", status: items.length ? "ok" : "no-results", items };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: this.name, backend: "hn-algolia", status: isTimeoutError(error) ? "timeout" : "error", items: [], error: message };
    }
  }
}
