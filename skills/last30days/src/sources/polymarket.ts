import { fetchWithDeadline, isTimeoutError } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { numberValue } from "./helpers";

type Fetcher = typeof fetch;

interface GammaMarket {
  id?: unknown;
  question?: unknown;
  slug?: unknown;
  description?: unknown;
  createdAt?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  volume?: unknown;
  liquidity?: unknown;
  active?: unknown;
  closed?: unknown;
}

interface GammaEvent {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  creationDate?: unknown;
  createdAt?: unknown;
  volume?: unknown;
  markets?: GammaMarket[];
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parsePolymarketEvents(events: GammaEvent[]): SourceItem[] {
  return events.flatMap((event): SourceItem[] => {
    const id = String(event.id ?? "").trim();
    const title = String(event.title ?? "").trim();
    const slug = String(event.slug ?? "").trim();
    if (!id || !title || !slug) return [];
    const markets = Array.isArray(event.markets) ? event.markets : [];
    const activeMarkets = markets.filter((market) => market.active !== false && market.closed !== true);
    const lead = [...activeMarkets].sort((a, b) => numberValue(b.volume) - numberValue(a.volume))[0];
    if (!lead) return [];
    const outcomes = jsonArray(lead?.outcomes).map(String);
    const prices = jsonArray(lead?.outcomePrices).map(numberValue);
    const topIndex = prices.reduce((best, value, index) => value > (prices[best] ?? -1) ? index : best, 0);
    const probability = prices[topIndex] ?? 0;
    return [{
      id,
      source: "polymarket",
      title,
      url: `https://polymarket.com/event/${slug}`,
      publishedAt: new Date().toISOString().slice(0, 10),
      snippet: String(lead?.question || event.description || "").slice(0, 500),
      engagement: {
        volume: numberValue(event.volume) || markets.reduce((sum, market) => sum + numberValue(market.volume), 0),
        liquidity: numberValue(lead?.liquidity),
        probability,
      },
      metadata: {
        outcome: outcomes[topIndex] ?? "",
        probability,
        marketCount: activeMarkets.length,
        readOnly: true,
        marketCreatedAt: String(event.creationDate || event.createdAt || "").slice(0, 10),
        oddsRetrievedAt: new Date().toISOString(),
      },
    }];
  });
}

export class PolymarketSource implements Source {
  readonly name = "polymarket";
  constructor(private readonly fetcher: Fetcher = fetch) {}
  async availability(): Promise<SourceAvailability> {
    return { available: true, backend: "polymarket-gamma" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    const today = new Date().toISOString().slice(0, 10);
    if (request.window.to < today) {
      return {
        source: this.name,
        backend: "polymarket-gamma",
        status: "unavailable",
        items: [],
        error: "Gamma public search exposes current odds, not point-in-time historical prices",
      };
    }
    const params = new URLSearchParams({ q: request.topic });
    try {
      const response = await fetchWithDeadline(this.fetcher, `https://gamma-api.polymarket.com/public-search?${params}`, {
        headers: { "User-Agent": "last30days-bun/0.1" },
      }, { timeoutMs: 20_000, signal: request.signal });
      if (!response.ok) return { source: this.name, backend: "polymarket-gamma", status: response.status === 429 ? "rate-limited" : "error", items: [], error: `HTTP ${response.status}` };
      const payload = await response.json() as { events?: GammaEvent[] };
      const items = parsePolymarketEvents(payload.events ?? []).slice(0, request.limit);
      return { source: this.name, backend: "polymarket-gamma", status: items.length ? "ok" : "no-results", items };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: this.name, backend: "polymarket-gamma", status: isTimeoutError(error) ? "timeout" : "error", items: [], error: message };
    }
  }
}
