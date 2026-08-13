import { fetchWithDeadline, isTimeoutError } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { numberValue } from "./helpers";

type Fetcher = typeof fetch;

const FINANCIAL = /(?:\$[A-Z]{1,5}\b|\b(?:stock|stocks|ticker|earnings|bullish|bearish|crypto|bitcoin|btc|ethereum|solana|dogecoin|xrp)\b)/i;
const CRYPTO: Record<string, string> = { bitcoin: "BTC.X", btc: "BTC.X", ethereum: "ETH.X", solana: "SOL.X", dogecoin: "DOGE.X", xrp: "XRP.X" };

export function financialSymbol(topic: string): string | undefined {
  const cashtag = topic.match(/\$([A-Z]{1,5}(?:\.X)?)/i)?.[1];
  if (cashtag) return cashtag.toUpperCase();
  const bareTicker = topic.trim().match(/^([A-Z]{1,5})(?:\s+(?:stock|stocks|ticker|earnings|shares))?$/)?.[1];
  if (bareTicker) return bareTicker;
  if (!FINANCIAL.test(topic)) return undefined;
  const lowered = topic.toLowerCase();
  for (const [name, symbol] of Object.entries(CRYPTO)) if (new RegExp(`\\b${name}\\b`).test(lowered)) return symbol;
  return undefined;
}

interface StocktwitsMessage {
  id?: unknown;
  body?: unknown;
  created_at?: unknown;
  user?: { username?: unknown };
  likes?: { total?: unknown };
  entities?: { sentiment?: { basic?: unknown } };
}

export function parseStocktwitsMessages(messages: StocktwitsMessage[], symbol: string): SourceItem[] {
  return messages.flatMap((message): SourceItem[] => {
    const id = String(message.id ?? "").trim();
    const body = String(message.body ?? "").trim();
    const author = String(message.user?.username ?? "").trim();
    if (!id || !body) return [];
    return [{
      id,
      source: "stocktwits",
      title: body.slice(0, 160),
      url: `https://stocktwits.com/${author || "symbol"}/message/${id}`,
      publishedAt: String(message.created_at ?? "").slice(0, 10),
      ...(author ? { author: `@${author}` } : {}),
      body,
      engagement: { likes: numberValue(message.likes?.total) },
      metadata: { symbol, sentiment: message.entities?.sentiment?.basic || "unlabeled" },
    }];
  });
}

export class StocktwitsSource implements Source {
  readonly name = "stocktwits";
  constructor(private readonly fetcher: Fetcher = fetch) {}
  async availability(): Promise<SourceAvailability> {
    return { available: true, backend: "stocktwits-public" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    const today = new Date().toISOString().slice(0, 10);
    if (request.window.to < today) {
      return { source: this.name, backend: "stocktwits-public", status: "unavailable", items: [], error: "StockTwits public streams expose current messages, not arbitrary historical windows" };
    }
    const symbol = financialSymbol(request.topic);
    if (!symbol) return { source: this.name, backend: "stocktwits-public", status: "no-results", items: [] };
    try {
      const response = await fetchWithDeadline(this.fetcher, `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`, {
        headers: { "User-Agent": "last30days-bun/0.1" },
      }, { timeoutMs: 20_000, signal: request.signal });
      if (!response.ok) return { source: this.name, backend: "stocktwits-public", status: response.status === 429 ? "rate-limited" : "error", items: [], error: `HTTP ${response.status}` };
      const payload = await response.json() as { messages?: StocktwitsMessage[] };
      const items = parseStocktwitsMessages(payload.messages ?? [], symbol)
        .filter((item) => !item.publishedAt || (item.publishedAt >= request.window.from && item.publishedAt <= request.window.to))
        .slice(0, request.limit);
      return { source: this.name, backend: "stocktwits-public", status: items.length ? "ok" : "no-results", items };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: this.name, backend: "stocktwits-public", status: isTimeoutError(error) ? "timeout" : "error", items: [], error: message };
    }
  }
}
