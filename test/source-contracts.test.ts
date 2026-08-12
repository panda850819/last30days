import { describe, expect, test } from "bun:test";
import { parseGitHubEvents, parseGitHubResults } from "../skills/last30days/src/sources/github";
import { parseHackerNewsHits } from "../skills/last30days/src/sources/hackernews";
import { parsePolymarketEvents, PolymarketSource } from "../skills/last30days/src/sources/polymarket";
import { parseArxivEntries, parseTechmemeEntries } from "../skills/last30days/src/sources/printing-press";
import { parseRedditRss, parseRedditThreadJson, RedditSource } from "../skills/last30days/src/sources/reddit";
import { isoDate } from "../skills/last30days/src/sources/helpers";
import { financialSymbol, parseStocktwitsMessages } from "../skills/last30days/src/sources/stocktwits";
import { parseDuckDuckGoHtml } from "../skills/last30days/src/sources/web";
import { parseXbirdEnvelope, parseXbirdNews, XbirdSource } from "../skills/last30days/src/sources/xbird";
import { parseYoutubeEntries } from "../skills/last30days/src/sources/youtube";
import { parseSummarizeOutput } from "../skills/last30days/src/readers/summarize";

describe("source contracts", () => {
  test("normalizes xbird JSON", () => {
    const items = parseXbirdEnvelope({ ok: true, data: [{ id: "1", text: "hello", author: { username: "panda" }, createdAt: "2026-08-10T00:00:00Z", likeCount: 7 }] });
    expect(items[0]?.url).toBe("https://x.com/panda/status/1");
    expect(items[0]?.engagement.likes).toBe(7);
  });

  test("marks a failed first-party X lane as partial", async () => {
    const responses = [
      { exitCode: 0, stdout: JSON.stringify({ ok: true, data: [{ id: "about", text: "Bun news", author: { username: "news" }, createdAt: "2026-08-10T00:00:00Z" }] }), stderr: "", timedOut: false },
      { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "AUTH", message: "first-party failed" } }), stderr: "", timedOut: false },
    ];
    const runner = async (command: string[]) => ({ command, ...responses.shift()! });
    const source = new XbirdSource(runner, true, () => false, () => true);
    const result = await source.search({ topic: "Bun", mode: "research", window: { from: "2026-07-14", to: "2026-08-12", days: 30 }, depth: "quick", limit: 5, entity: { kind: "company", xHandle: "oven_sh", confidence: 1 } });
    expect(result.status).toBe("partial");
    expect(result.items).toHaveLength(1);
    expect(result.error).toContain("first-party failed");
  });

  test("parses xbird's Twitter timestamp format", () => {
    expect(isoDate("Wed Aug 12 15:55:18 +0000 2026")).toBe("2026-08-12");
  });

  test("normalizes xbird trends", () => {
    const items = parseXbirdNews({ ok: true, data: [{ id: "trend-1", headline: "Bun is trending", postCount: 1200, tweets: [{ id: "1", text: "Bun", author: { username: "panda" } }] }] });
    expect(items[0]?.metadata?.kind).toBe("trend");
    expect(items[0]?.engagement.posts).toBe(1200);
  });

  test("normalizes Hacker News hits", () => {
    const items = parseHackerNewsHits([{ objectID: "42", title: "Bun research", points: 10, num_comments: 3 }]);
    expect(items[0]?.url).toBe("https://news.ycombinator.com/item?id=42");
    expect(items[0]?.engagement.points).toBe(10);
  });

  test("normalizes Polymarket event odds", () => {
    const items = parsePolymarketEvents([{ id: "e1", title: "Will Bun win?", slug: "will-bun-win", creationDate: "2026-08-01T00:00:00Z", volume: 1000, markets: [{ id: "m1", question: "Will Bun win?", outcomes: '["Yes","No"]', outcomePrices: '["0.72","0.28"]', volume: "900" }] }]);
    expect(items[0]?.metadata?.outcome).toBe("Yes");
    expect(items[0]?.engagement.probability).toBe(0.72);
    expect(items[0]?.metadata?.readOnly).toBe(true);
  });

  test("timestamps current Polymarket odds at retrieval time", () => {
    const old = parsePolymarketEvents([{ id: "old", title: "Old active market", slug: "old", creationDate: "2020-01-01T00:00:00Z", markets: [{ active: true, closed: false, outcomes: '["Yes","No"]', outcomePrices: '["0.6","0.4"]' }] }])[0];
    expect(old?.publishedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(old?.metadata?.marketCreatedAt).toBe("2020-01-01");
    expect(old?.metadata?.oddsRetrievedAt).toBeString();
  });

  test("excludes closed Polymarket odds from current evidence", () => {
    const items = parsePolymarketEvents([{ id: "closed", title: "Resolved market", slug: "closed", markets: [{ active: false, closed: true, outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' }] }]);
    expect(items).toEqual([]);
  });

  test("does not present current Polymarket odds as historical", async () => {
    let called = false;
    const fetcher = Object.assign(async () => { called = true; return new Response("{}"); }, { preconnect() {} }) as typeof fetch;
    const source = new PolymarketSource(fetcher);
    const result = await source.search({ topic: "Bun", mode: "research", window: { from: "2025-12-02", to: "2025-12-31", days: 30 }, depth: "quick", limit: 5 });
    expect(result.status).toBe("unavailable");
    expect(called).toBe(false);
  });

  test("normalizes gh issue, repo, and first-party event output", () => {
    const items = parseGitHubResults(
      [{ id: "i1", title: "Issue", url: "https://github.com/a/b/issues/1", commentsCount: 4 }],
      [{ id: "r1", fullName: "a/b", url: "https://github.com/a/b", stargazersCount: 99 }],
    );
    expect(items).toHaveLength(2);
    expect(items[1]?.engagement.stars).toBe(99);
    const events = parseGitHubEvents([{ id: "e1", type: "PushEvent", repo: { name: "a/b" }, created_at: "2026-08-01T00:00:00Z", payload: { ref: "main" } }], "panda");
    expect(events[0]?.metadata?.lane).toBe("first-party");
    const organizationEvents = parseGitHubEvents([{ id: "e2", type: "PushEvent", actor: { login: "contributor" }, repo: { name: "oven-sh/bun" }, created_at: "2026-08-01T00:00:00Z" }], "oven-sh", "organization");
    expect(organizationEvents[0]?.author).toBe("contributor");
    expect(organizationEvents[0]?.metadata?.lane).toBe("organization-activity");
  });

  test("normalizes yt-dlp entries", () => {
    const items = parseYoutubeEntries([{ id: "v1", title: "Video", channel: "Channel", upload_date: "20260801", view_count: 123 }]);
    expect(items[0]?.publishedAt).toBe("2026-08-01");
    expect(items[0]?.engagement.views).toBe(123);
  });

  test("parses Reddit Atom entries", () => {
    const xml = `<feed><entry><id>t3_abc</id><title>Topic</title><link href="https://www.reddit.com/r/test/comments/abc/topic/"/><updated>2026-08-01T00:00:00Z</updated><content><![CDATA[<p>Body</p>]]></content></entry></feed>`;
    const items = parseRedditRss(xml);
    expect(items[0]?.id).toBe("t3_abc");
    expect(items[0]?.snippet).toBe("Body");
  });

  test("reports historical Reddit RSS as unavailable", async () => {
    let called = false;
    const fetcher = Object.assign(async () => { called = true; return new Response(""); }, { preconnect() {} }) as typeof fetch;
    const source = new RedditSource(fetcher);
    const result = await source.search({ topic: "Bun", mode: "research", window: { from: "2025-12-02", to: "2025-12-31", days: 30 }, depth: "quick", limit: 5 });
    expect(result.status).toBe("unavailable");
    expect(called).toBe(false);
  });

  test("parses Reddit engagement and top comments", () => {
    const detail = parseRedditThreadJson([
      { data: { children: [{ data: { score: 100, num_comments: 2, selftext: "Post body" } }] } },
      { data: { children: [{ data: { author: "u1", body: "Top", score: 50 } }, { data: { author: "u2", body: "Second", score: 20 } }] } },
    ]);
    expect(detail?.score).toBe(100);
    expect(detail?.topComments[0]?.body).toBe("Top");
  });

  test("parses DuckDuckGo redirect URLs", () => {
    const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpost">Example &amp; post</a>`;
    const items = parseDuckDuckGoHtml(html, 5);
    expect(items[0]?.url).toBe("https://example.com/post");
    expect(items[0]?.title).toBe("Example & post");
  });

  test("parses summarize extract JSON", () => {
    const result = parseSummarizeOutput(JSON.stringify({ extracted: { url: "https://example.com/", title: "Example", content: "Article body", truncated: false } }), "https://example.com");
    expect(result.ok).toBe(true);
    expect(result.content).toBe("Article body");
  });

  test("normalizes optional Printing Press sources", () => {
    expect(parseArxivEntries([{ id: "https://arxiv.org/abs/1", title: " Agent Paper ", published: "2026-08-01", summary: "Abstract" }])[0]?.source).toBe("arxiv");
    expect(parseTechmemeEntries([{ num: 1, source: "Example", headline: "A useful technology headline", link: "https://example.com/story", date: "2026-08-02" }])[0]?.engagement.rank).toBe(99);
  });

  test("gates and normalizes StockTwits", () => {
    expect(financialSymbol("AAPL")).toBe("AAPL");
    expect(financialSymbol("NVDA earnings")).toBe("NVDA");
    expect(financialSymbol("bitcoin price")).toBe("BTC.X");
    expect(financialSymbol("share a file")).toBeUndefined();
    const items = parseStocktwitsMessages([{ id: "1", body: "Bullish", user: { username: "trader" }, likes: { total: 5 } }], "BTC.X");
    expect(items[0]?.metadata?.sentiment).toBe("unlabeled");
  });
});
