import type { DateWindow, SourceItem } from "./types";

const STOP = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "is", "are", "vs", "versus", "about", "what"]);

export function tokens(value: string): string[] {
  return [...new Set(value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((token) => token.length > 1 && !STOP.has(token));
}

export function lexicalRelevance(topic: string, item: SourceItem): number {
  const query = tokens(topic);
  if (query.length === 0) return 0.5;
  const document = new Set(tokens(`${item.title} ${item.snippet ?? ""} ${item.body?.slice(0, 2000) ?? ""}`));
  const matches = query.filter((token) => document.has(token)).length;
  return Math.min(1, matches / Math.max(1, Math.min(query.length, 5)));
}

export function engagementScore(item: SourceItem): number {
  const weights: Record<string, number> = {
    likes: 1,
    reposts: 2,
    replies: 1.5,
    comments: 1.5,
    views: 0.02,
    points: 2,
    volume: 0.002,
    liquidity: 0.002,
    stars: 1,
    forks: 2,
    rank: 1,
  };
  const weighted = Object.entries(item.engagement).reduce((sum, [key, value]) => {
    return sum + (typeof value === "number" ? Math.max(0, value) * (weights[key] ?? 0.25) : 0);
  }, 0);
  return Math.min(1, Math.log1p(weighted) / Math.log(100_001));
}

function recencyScore(publishedAt: string | undefined, window: DateWindow): number {
  if (!publishedAt) return 0.35;
  const published = new Date(`${publishedAt}T00:00:00Z`).getTime();
  const end = new Date(`${window.to}T00:00:00Z`).getTime();
  if (!Number.isFinite(published)) return 0.35;
  const age = Math.max(0, (end - published) / 86_400_000);
  return Math.max(0, 1 - age / Math.max(1, window.days));
}

export function scoreItems(topic: string, items: SourceItem[], window: DateWindow): SourceItem[] {
  return items.map((item) => {
    const lexical = lexicalRelevance(topic, item);
    const relevance = item.metadata?.lane === "first-party" ? Math.max(0.8, lexical) : lexical;
    const score = 100 * (relevance * 0.55 + engagementScore(item) * 0.3 + recencyScore(item.publishedAt, window) * 0.15);
    return { ...item, relevance: Number(relevance.toFixed(3)), score: Number(score.toFixed(2)) };
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["ref", "source", "feature"].includes(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

export function dedupeItems(items: SourceItem[]): SourceItem[] {
  const seenUrls = new Set<string>();
  const seenTitles: Set<string>[] = [];
  return items.filter((item) => {
    const url = canonicalUrl(item.url);
    if (seenUrls.has(url)) return false;
    const titleTokens = new Set(tokens(item.title));
    const duplicateTitle = seenTitles.some((known) => {
      const intersection = [...titleTokens].filter((token) => known.has(token)).length;
      return intersection >= 3 && intersection / Math.max(1, Math.min(titleTokens.size, known.size)) >= 0.8;
    });
    if (duplicateTitle) return false;
    seenUrls.add(url);
    seenTitles.push(titleTokens);
    return true;
  });
}

export function discoveryConfidenceFloor(items: SourceItem[]): SourceItem[] {
  return items.filter((item) => {
    const own = new Set(tokens(item.title));
    const corroboratingSources = new Set(items.filter((other) => {
      if (other === item || other.source === item.source) return false;
      const overlap = tokens(other.title).filter((token) => own.has(token)).length;
      return overlap >= 2;
    }).map((other) => other.source));
    const engagement = Object.entries(item.engagement).reduce((sum, [key, value]) => {
      if (typeof value !== "number" || key === "probability" || key === "rank") return sum;
      return sum + Math.max(0, value);
    }, 0);
    return corroboratingSources.size > 0 || (engagement >= 200 && (item.relevance ?? 0) >= 0.5);
  });
}
