import { commandExists, runCommand, type CommandRunner } from "../core/command";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { isoDate, numberValue, statusFromExit, unavailable } from "./helpers";

interface XbirdTweet {
  id?: unknown;
  text?: unknown;
  author?: { username?: unknown; name?: unknown };
  createdAt?: unknown;
  likeCount?: unknown;
  retweetCount?: unknown;
  replyCount?: unknown;
}

interface XbirdNewsItem {
  id?: unknown;
  headline?: unknown;
  category?: unknown;
  timeAgo?: unknown;
  postCount?: unknown;
  description?: unknown;
  url?: unknown;
  tweets?: XbirdTweet[];
}

export interface XbirdEnvelope {
  ok?: boolean;
  data?: XbirdTweet[] | XbirdNewsItem[] | { tweets?: XbirdTweet[] };
  error?: { code?: string; message?: string };
  meta?: { partial?: boolean };
}

export function parseXbirdEnvelope(payload: XbirdEnvelope): SourceItem[] {
  const tweets: XbirdTweet[] = Array.isArray(payload.data)
    ? payload.data.filter((entry): entry is XbirdTweet => "author" in entry || "text" in entry)
    : payload.data?.tweets ?? [];
  return tweets.flatMap((tweet): SourceItem[] => {
    const id = String(tweet.id ?? "").trim();
    const username = String(tweet.author?.username ?? "").replace(/^@/, "").trim();
    if (!id || !username) return [];
    const text = String(tweet.text ?? "").trim();
    const publishedAt = isoDate(tweet.createdAt);
    return [{
      id,
      source: "x",
      title: text.slice(0, 160) || `Post by @${username}`,
      url: `https://x.com/${username}/status/${id}`,
      ...(publishedAt ? { publishedAt } : {}),
      author: `@${username}`,
      body: text,
      engagement: {
        likes: numberValue(tweet.likeCount),
        reposts: numberValue(tweet.retweetCount),
        replies: numberValue(tweet.replyCount),
      },
    }];
  });
}

export function parseXbirdNews(payload: XbirdEnvelope): SourceItem[] {
  const entries = Array.isArray(payload.data) ? payload.data as XbirdNewsItem[] : [];
  return entries.flatMap((entry, index): SourceItem[] => {
    const headline = String(entry.headline ?? "").trim();
    if (!headline) return [];
    const related = parseXbirdEnvelope({ ok: true, data: entry.tweets ?? [] });
    return [{
      id: String(entry.id || `x-news-${index + 1}-${Bun.hash(headline)}`),
      source: "x",
      title: headline,
      url: String(entry.url || related[0]?.url || "https://x.com/explore"),
      snippet: String(entry.description ?? "").slice(0, 500),
      engagement: { posts: numberValue(entry.postCount) },
      metadata: {
        kind: "trend",
        category: String(entry.category ?? ""),
        timeAgo: String(entry.timeAgo ?? ""),
        relatedTweets: related,
      },
    }];
  });
}

function exclusiveUntil(inclusiveEnd: string): string {
  const date = new Date(`${inclusiveEnd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export class XbirdSource implements Source {
  readonly name = "x";
  constructor(
    private readonly runner: CommandRunner = runCommand,
    private readonly allowBrowserCookies = false,
    private readonly hasCredentials: () => boolean = () => Boolean((process.env.AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN) && (process.env.CT0 || process.env.TWITTER_CT0)),
    private readonly isAvailable: () => boolean = () => commandExists("xbird"),
  ) {}

  private hasExplicitCredentials(): boolean {
    return this.hasCredentials();
  }

  async availability(): Promise<SourceAvailability> {
    if (!this.isAvailable()) return { available: false, backend: "xbird", detail: "xbird is not on PATH" };
    if (this.hasExplicitCredentials()) return { available: true, authenticated: true, backend: "xbird", detail: "explicit cookie credentials" };
    if (!this.allowBrowserCookies) return { available: false, authenticated: false, backend: "xbird", detail: "browser-cookie access has not been approved; run last30days setup --allow-browser-cookies" };
    return { available: true, backend: "xbird", detail: "browser-cookie access approved; authentication is verified on first search" };
  }

  async search(request: SourceRequest): Promise<SourceResult> {
    if (!this.isAvailable()) return unavailable(this.name, "xbird", "xbird is not on PATH");
    if (!this.hasExplicitCredentials() && !this.allowBrowserCookies) {
      return { source: this.name, backend: "xbird", status: "auth-failed", items: [], error: "Browser-cookie access has not been approved; run last30days setup --allow-browser-cookies" };
    }
    const count = request.depth === "quick" ? Math.min(request.limit, 12) : request.depth === "deep" ? Math.min(request.limit, 60) : Math.min(request.limit, 30);
    const until = exclusiveUntil(request.window.to);
    const query = `${request.topic} since:${request.window.from} until:${until}`;
    const command = request.mode === "discover"
      ? ["xbird", "news", "--trending-only", "--with-tweets", "--tweets-per-item", "3", "--count", String(count), "--json"]
      : ["xbird", "search", query, "--count", String(count), "--json"];
    const result = await this.runner(command, { timeoutMs: 60_000, signal: request.signal });
    if (result.timedOut) return { source: this.name, backend: "xbird", status: "timeout", items: [], error: result.stderr };
    let payload: XbirdEnvelope;
    try {
      payload = JSON.parse(result.stdout) as XbirdEnvelope;
    } catch {
      return { source: this.name, backend: "xbird", status: statusFromExit(result.exitCode, result.stderr), items: [], error: result.stderr || "xbird returned invalid JSON" };
    }
    let items = request.mode === "discover" ? parseXbirdNews(payload) : parseXbirdEnvelope(payload);
    let laneError: string | undefined;
    if (request.mode !== "discover" && request.entity?.xHandle && payload.ok && result.exitCode === 0) {
      const handle = request.entity.xHandle.replace(/^@/, "");
      const firstParty = await this.runner([
        "xbird", "search", `from:${handle} since:${request.window.from} until:${until}`,
        "--count", String(Math.min(20, count)), "--json",
      ], { timeoutMs: 60_000, signal: request.signal });
      try {
        const firstPartyPayload = JSON.parse(firstParty.stdout) as XbirdEnvelope;
        if (firstParty.timedOut || firstParty.exitCode !== 0 || !firstPartyPayload.ok) {
          laneError = firstPartyPayload.error?.message || firstParty.stderr || "first-party X lane failed";
        } else {
          items = [
            ...parseXbirdEnvelope(firstPartyPayload).map((item) => ({ ...item, metadata: { ...item.metadata, lane: "first-party" } })),
            ...items.map((item) => ({ ...item, metadata: { ...item.metadata, lane: "about" } })),
          ];
          if (firstPartyPayload.meta?.partial) laneError = "first-party X lane returned partial results";
        }
      } catch {
        laneError = firstParty.stderr || "first-party X lane returned invalid JSON";
      }
    }
    if (!payload.ok || result.exitCode !== 0) {
      const message = payload.error?.message || result.stderr || "xbird search failed";
      return { source: this.name, backend: "xbird", status: statusFromExit(result.exitCode, `${payload.error?.code ?? ""} ${message}`), items, error: message };
    }
    if (laneError) return { source: this.name, backend: "xbird", status: "partial", items, error: laneError };
    return { source: this.name, backend: "xbird", status: payload.meta?.partial ? "partial" : items.length ? "ok" : "no-results", items };
  }
}
