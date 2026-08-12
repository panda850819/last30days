import { fetchWithDeadline, isTimeoutError } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";

type Fetcher = typeof fetch;

function text(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? text(match[1]) : "";
}

function link(block: string): string {
  const atom = block.match(/<link[^>]+href="([^"]+)"/i)?.[1];
  return atom || tag(block, "link");
}

export function parseRedditRss(xml: string): SourceItem[] {
  const blocks = [...xml.matchAll(/<(?:entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/(?:entry|item)>/gi)].map((match) => match[1] ?? "");
  return blocks.flatMap((block, index): SourceItem[] => {
    const url = link(block);
    const title = tag(block, "title");
    if (!url || !title || !/reddit\.com/i.test(url)) return [];
    const id = tag(block, "id") || url.match(/\/comments\/([a-z0-9]+)/i)?.[1] || `reddit-${index + 1}`;
    const author = tag(block, "name") || tag(block, "author");
    const published = tag(block, "updated") || tag(block, "published") || tag(block, "pubDate");
    const content = tag(block, "content") || tag(block, "description") || tag(block, "summary");
    return [{
      id,
      source: "reddit",
      title,
      url,
      ...(published ? { publishedAt: new Date(published).toISOString().slice(0, 10) } : {}),
      ...(author ? { author } : {}),
      snippet: content.slice(0, 500),
      engagement: {},
      metadata: { retrieval: "reddit-rss" },
    }];
  });
}

interface RedditListing {
  data?: { children?: Array<{ data?: Record<string, unknown> }> };
}

export function parseRedditThreadJson(payload: unknown): {
  score: number;
  comments: number;
  body: string;
  topComments: Array<{ author: string; body: string; score: number }>;
} | undefined {
  if (!Array.isArray(payload)) return undefined;
  const post = (payload[0] as RedditListing | undefined)?.data?.children?.[0]?.data;
  if (!post) return undefined;
  const commentChildren = (payload[1] as RedditListing | undefined)?.data?.children ?? [];
  const topComments = commentChildren.flatMap((child) => {
    const data = child.data;
    if (!data || typeof data.body !== "string") return [];
    return [{ author: String(data.author ?? ""), body: data.body, score: Number(data.score ?? 0) || 0 }];
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  return {
    score: Number(post.score ?? 0) || 0,
    comments: Number(post.num_comments ?? 0) || 0,
    body: String(post.selftext ?? ""),
    topComments,
  };
}

export class RedditSource implements Source {
  readonly name = "reddit";
  constructor(private readonly fetcher: Fetcher = fetch) {}
  async availability(): Promise<SourceAvailability> {
    return { available: true, backend: "reddit-rss" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    const today = new Date().toISOString().slice(0, 10);
    if (request.window.to < today) {
      return {
        source: this.name,
        backend: "reddit-rss",
        status: "unavailable",
        items: [],
        error: "Reddit RSS time filters are relative to today and cannot reproduce an arbitrary historical window",
      };
    }
    const params = new URLSearchParams({ q: request.topic, sort: "top", t: request.window.days <= 7 ? "week" : request.window.days <= 31 ? "month" : "year" });
    const endpoint = request.mode === "discover"
      ? `https://www.reddit.com/r/all/top.rss?t=${request.window.days <= 7 ? "week" : "month"}`
      : `https://www.reddit.com/search.rss?${params}`;
    try {
      const response = await fetchWithDeadline(this.fetcher, endpoint, {
        headers: { "User-Agent": "last30days-bun/0.1 (public research)" },
      }, { timeoutMs: 20_000, signal: request.signal });
      if (!response.ok) return { source: this.name, backend: "reddit-rss", status: response.status === 429 ? "rate-limited" : response.status === 403 ? "unavailable" : "error", items: [], error: `HTTP ${response.status}` };
      let items = parseRedditRss(await response.text())
        .filter((item) => !item.publishedAt || (item.publishedAt >= request.window.from && item.publishedAt <= request.window.to))
        .slice(0, request.limit);
      let enrichmentFailed = false;
      const enrichLimit = request.depth === "quick" ? 1 : request.depth === "deep" ? 8 : 5;
      items = await Promise.all(items.map(async (item, index) => {
        if (index >= enrichLimit || !/\/comments\//.test(item.url)) return item;
        const jsonUrl = `${item.url.replace(/\/?$/, "/")}.json?limit=10&sort=top&raw_json=1`;
        try {
          const detailResponse = await fetchWithDeadline(this.fetcher, jsonUrl, {
            headers: { "User-Agent": "last30days-bun/0.1 (public research)" },
          }, { timeoutMs: 15_000, signal: request.signal });
          if (!detailResponse.ok) { enrichmentFailed = true; return item; }
          const detail = parseRedditThreadJson(await detailResponse.json());
          if (!detail) { enrichmentFailed = true; return item; }
          return {
            ...item,
            ...(detail.body || item.snippet ? { body: detail.body || item.snippet! } : {}),
            engagement: { score: detail.score, comments: detail.comments },
            metadata: { ...item.metadata, topComments: detail.topComments },
          };
        } catch { enrichmentFailed = true; return item; }
      }));
      return {
        source: this.name,
        backend: "reddit-rss",
        status: enrichmentFailed ? "partial" : items.length ? "ok" : "no-results",
        items,
        ...(enrichmentFailed ? { error: "One or more Reddit thread enrichments failed" } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: this.name, backend: "reddit-rss", status: isTimeoutError(error) ? "timeout" : "error", items: [], error: message };
    }
  }
}
