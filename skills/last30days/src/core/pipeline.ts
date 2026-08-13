import { resolveEntity } from "./entity";
import { dedupeItems, discoveryConfidenceFloor, scoreItems } from "./ranking";
import type { ResearchOptions, ResearchReport, Source, SourceItem, SourceResult, SourceStatus } from "./types";

const SOURCE_ALIASES: Record<string, string> = {
  hn: "hackernews",
  x: "x",
  twitter: "x",
  github: "github",
  web: "web",
  youtube: "youtube",
};

function activeSources(options: ResearchOptions, sources: Source[]): Source[] {
  if (!options.sources) return sources;
  const requested = new Set(options.sources.map((value) => SOURCE_ALIASES[value.toLowerCase()] ?? value.toLowerCase()));
  return sources.filter((source) => requested.has(source.name.toLowerCase()));
}

function failedResult(source: Source, error: unknown, durationMs: number): SourceResult {
  return {
    source: source.name,
    backend: source.name,
    status: "error",
    items: [],
    error: error instanceof Error ? error.message : String(error),
    durationMs,
  };
}

function aggregateStatus(results: SourceResult[], itemCount: number): SourceStatus {
  const states = new Set(results.map((result) => result.status));
  const complete = [...states].every((status) => status === "ok" || status === "no-results");
  if (itemCount > 0) return complete ? "ok" : "partial";
  const priority: SourceStatus[] = ["auth-failed", "rate-limited", "timeout", "error", "partial", "unavailable", "no-results"];
  return priority.find((status) => states.has(status)) ?? "no-results";
}

function aggregateResults(results: SourceResult[]): SourceResult[] {
  const bySource = new Map<string, SourceResult[]>();
  for (const result of results) {
    const group = bySource.get(result.source) ?? [];
    group.push(result);
    bySource.set(result.source, group);
  }
  return [...bySource.entries()].map(([source, group]) => {
    const items = group.flatMap((result) => result.items);
    const errors = group.map((result) => result.error).filter((value): value is string => Boolean(value));
    const topicStatuses = Object.fromEntries(group.map((result) => [result.researchTopic ?? "unknown", result.status]));
    return {
      source,
      backend: [...new Set(group.map((result) => result.backend))].join("→"),
      status: aggregateStatus(group, items.length),
      items,
      durationMs: Math.max(...group.map((result) => result.durationMs ?? 0)),
      ...(group.length > 1 ? { topicStatuses } : {}),
      ...(errors.length ? { error: errors.join("; ") } : {}),
    };
  });
}

async function runSource(source: Source, topic: string, options: ResearchOptions, perSourceLimit: number, entity: Awaited<ReturnType<typeof resolveEntity>>): Promise<SourceResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeoutMs = options.depth === "deep" ? 180_000 : options.depth === "quick" ? 60_000 : 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await source.search({
      topic,
      mode: options.mode,
      window: options.window,
      depth: options.depth,
      limit: perSourceLimit,
      entity,
      signal: controller.signal,
    });
    const today = new Date().toISOString().slice(0, 10);
    const historical = options.window.to < today;
    const items = result.items
      .filter((item) => historical ? Boolean(item.publishedAt) : true)
      .filter((item) => !item.publishedAt || (item.publishedAt >= options.window.from && item.publishedAt <= options.window.to))
      .map((item): SourceItem => ({
        ...item,
        metadata: { ...item.metadata, researchTopic: topic },
      }));
    const status = result.status === "ok" && items.length === 0 ? "no-results" : result.status;
    return { ...result, researchTopic: topic, status, items, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        source: source.name,
        backend: source.name,
        status: "timeout",
        items: [],
        error: `Source exceeded ${timeoutMs}ms wall-clock deadline`,
        durationMs: Math.round(performance.now() - started),
        researchTopic: topic,
      };
    }
    return { ...failedResult(source, error, Math.round(performance.now() - started)), researchTopic: topic };
  } finally {
    clearTimeout(timer);
  }
}

export async function runResearch(options: ResearchOptions, sources: Source[]): Promise<ResearchReport> {
  const active = activeSources(options, sources);
  const perSourceLimit = Math.max(1, Math.ceil(options.limit / Math.max(1, active.length)));
  const needsEntityResolution = active.some((source) => source.name === "github");
  const entities = new Map(await Promise.all(options.topics.map(async (topic) => [
    topic,
    needsEntityResolution ? await resolveEntity(topic) : { kind: "topic" as const, confidence: 0 },
  ] as const)));
  const jobs = options.topics.flatMap((topic) => active.map((source) => ({ topic, source })));
  const rawResults: SourceResult[] = [];
  const concurrency = 6;
  let nextJob = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob++];
      if (!job) break;
      rawResults.push(await runSource(job.source, job.topic, options, perSourceLimit, entities.get(job.topic)!));
    }
  }));
  const results = aggregateResults(rawResults);
  const query = options.topics.join(" ");
  const rawItems = results.flatMap((result) => result.items);
  const globalDiscovery = options.mode === "discover" && options.topics.length === 1 && options.topics[0] === "trending";
  const scored = globalDiscovery
    ? rawItems.flatMap((item) => scoreItems(item.title, [item], options.window))
    : scoreItems(query, rawItems, options.window);
  let items: SourceItem[];
  if (options.mode === "comparison") {
    const perTopic = options.topics.map((topic) => dedupeItems(scored.filter((item) => item.metadata?.researchTopic === topic && (item.relevance ?? 0) > 0)));
    items = [];
    for (let index = 0; items.length < options.limit; index += 1) {
      let added = false;
      for (const group of perTopic) {
        const candidate = group[index];
        if (candidate && items.length < options.limit) {
          items.push(candidate);
          added = true;
        }
      }
      if (!added) break;
    }
  } else if (options.mode === "discover") {
    const relevant = globalDiscovery ? scored : scored.filter((item) => (item.relevance ?? 0) > 0);
    items = dedupeItems(discoveryConfidenceFloor(relevant)).slice(0, options.limit);
  } else {
    items = dedupeItems(scored).filter((item) => (item.relevance ?? 0) > 0).slice(0, options.limit);
  }
  return {
    schemaVersion: 1,
    mode: options.mode,
    topics: options.topics,
    window: options.window,
    generatedAt: new Date().toISOString(),
    items,
    sources: results,
  };
}
