import { describe, expect, test } from "bun:test";
import { runResearch } from "../skills/last30days/src/core/pipeline";
import { createDateWindow } from "../skills/last30days/src/core/window";
import type { ResearchOptions, Source, SourceItem, SourceRequest, SourceResult } from "../skills/last30days/src/core/types";

function item(id: string, source: string, title: string, url: string, likes = 0): SourceItem {
  return { id, source, title, url, publishedAt: "2026-08-10", engagement: { likes } };
}

class FakeSource implements Source {
  constructor(readonly name: string, private readonly response: (request: SourceRequest) => SourceResult | Promise<SourceResult>) {}
  async availability() { return { available: true, backend: this.name }; }
  async search(request: SourceRequest) { return this.response(request); }
}

function options(overrides: Partial<ResearchOptions> = {}): ResearchOptions {
  return {
    mode: "research",
    topics: ["Bun runtime"],
    window: createDateWindow(30, "2026-08-12"),
    depth: "default",
    emit: "json",
    limit: 20,
    ...overrides,
  };
}

describe("research pipeline", () => {
  test("isolates source failures and ranks successful evidence", async () => {
    const good = new FakeSource("good", () => ({ source: "good", backend: "fixture", status: "ok", items: [item("1", "good", "Bun runtime gets faster", "https://example.com/1", 500)] }));
    const bad = new FakeSource("bad", () => { throw new Error("offline"); });
    const report = await runResearch(options(), [bad, good]);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.score).toBeGreaterThan(50);
    expect(report.sources.find((source) => source.source === "bad")?.status).toBe("error");
  });

  test("deduplicates canonical URLs", async () => {
    const source = new FakeSource("web", () => ({ source: "web", backend: "fixture", status: "ok", items: [
      item("1", "web", "Bun runtime launch", "https://example.com/post?utm_source=x"),
      item("2", "web", "Bun runtime launch duplicate", "https://example.com/post"),
    ] }));
    const report = await runResearch(options(), [source]);
    expect(report.items).toHaveLength(1);
  });

  test("runs each comparison entity through every source", async () => {
    const seen: string[] = [];
    const source = new FakeSource("x", (request) => {
      seen.push(request.topic);
      return { source: "x", backend: "fixture", status: "ok", items: [item(request.topic, "x", `${request.topic} release`, `https://x.com/${encodeURIComponent(request.topic)}`)] };
    });
    const report = await runResearch(options({ mode: "comparison", topics: ["Bun", "Node"] }), [source]);
    expect(seen).toEqual(["Bun", "Node"]);
    expect(report.items.map((entry) => entry.metadata?.researchTopic)).toEqual(expect.arrayContaining(["Bun", "Node"]));
  });

  test("preserves shared comparison evidence for every entity", async () => {
    const source = new FakeSource("web", (request) => ({
      source: "web",
      backend: "fixture",
      status: "ok",
      items: [item(request.topic, "web", `${request.topic} runtime comparison`, "https://example.com/shared")],
    }));
    const report = await runResearch(options({ mode: "comparison", topics: ["Bun", "Node"] }), [source]);
    expect(report.items).toHaveLength(2);
    expect(report.items.map((entry) => entry.metadata?.researchTopic)).toEqual(["Bun", "Node"]);
  });

  test("interleaves comparison evidence before applying the limit", async () => {
    const source = new FakeSource("web", (request) => ({
      source: "web",
      backend: "fixture",
      status: "ok",
      items: Array.from({ length: 5 }, (_, index) => item(`${request.topic}-${index}`, "web", `${request.topic} release ${index}`, `https://example.com/${request.topic}/${index}`)),
    }));
    const report = await runResearch(options({ mode: "comparison", topics: ["Bun", "Node"], limit: 4 }), [source]);
    expect(report.items.map((entry) => entry.metadata?.researchTopic)).toEqual(["Bun", "Node", "Bun", "Node"]);
  });

  test("preserves comparison statuses for empty entities", async () => {
    const source = new FakeSource("web", (request) => ({ source: "web", backend: "fixture", status: request.topic === "Bun" ? "ok" : "no-results", items: request.topic === "Bun" ? [item("bun", "web", "Bun release", "https://example.com/bun")] : [] }));
    const report = await runResearch(options({ mode: "comparison", topics: ["Bun", "Node"] }), [source]);
    expect(report.sources[0]?.status).toBe("ok");
    expect(report.sources[0]?.topicStatuses).toEqual({ Bun: "ok", Node: "no-results" });
  });

  test("preserves zero-item partial coverage", async () => {
    const source = new FakeSource("x", () => ({ source: "x", backend: "fixture", status: "partial", items: [], error: "lane failed" }));
    const report = await runResearch(options(), [source]);
    expect(report.sources[0]?.status).toBe("partial");
  });

  test("discovery drops weak uncorroborated evidence", async () => {
    const weak = new FakeSource("reddit", () => ({ source: "reddit", backend: "fixture", status: "ok", items: [item("1", "reddit", "AI agents trend", "https://reddit.com/1", 6)] }));
    const report = await runResearch(options({ mode: "discover", topics: ["AI agents"] }), [weak]);
    expect(report.items).toEqual([]);
  });

  test("bare discovery does not require the literal word trending", async () => {
    const strong = new FakeSource("hackernews", () => ({ source: "hackernews", backend: "fixture", status: "ok", items: [item("1", "hackernews", "Bun 2.0 released", "https://news.ycombinator.com/item?id=1", 500)] }));
    const report = await runResearch(options({ mode: "discover", topics: ["trending"] }), [strong]);
    expect(report.items).toHaveLength(1);
  });

  test("discovery keeps corroborated low-engagement evidence", async () => {
    const first = new FakeSource("reddit", () => ({ source: "reddit", backend: "fixture", status: "ok", items: [item("1", "reddit", "AI agents breakthrough", "https://reddit.com/1", 5)] }));
    const second = new FakeSource("hackernews", () => ({ source: "hackernews", backend: "fixture", status: "ok", items: [item("2", "hackernews", "AI agents breakthrough", "https://news.ycombinator.com/2", 5)] }));
    const report = await runResearch(options({ mode: "discover", topics: ["AI agents"] }), [first, second]);
    expect(report.items).toHaveLength(1);
  });

  test("discovery keeps strong uncorroborated evidence", async () => {
    const strong = new FakeSource("reddit", () => ({ source: "reddit", backend: "fixture", status: "ok", items: [item("1", "reddit", "AI agents trend", "https://reddit.com/1", 200)] }));
    const report = await runResearch(options({ mode: "discover", topics: ["AI agents"] }), [strong]);
    expect(report.items).toHaveLength(1);
  });

  test("bounds concurrent source execution", async () => {
    let running = 0;
    let peak = 0;
    const sources = Array.from({ length: 10 }, (_, index) => new FakeSource(`source-${index}`, async (request) => {
      running += 1;
      peak = Math.max(peak, running);
      await Bun.sleep(5);
      running -= 1;
      return { source: `source-${index}`, backend: "fixture", status: "ok", items: [item(`${request.topic}-${index}`, `source-${index}`, `${request.topic} release`, `https://example.com/${request.topic}/${index}`)] };
    }));
    await runResearch(options({ mode: "comparison", topics: ["A", "B", "C", "D", "E"] }), sources);
    expect(peak).toBeLessThanOrEqual(6);
  });
});
