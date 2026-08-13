import { commandExists, runCommand, type CommandRunner } from "../core/command";
import { fetchWithDeadline } from "../core/http";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { isoDate, numberValue, statusFromExit, unavailable } from "./helpers";

type Fetcher = typeof fetch;

interface YoutubeEntry {
  id?: unknown;
  title?: unknown;
  webpage_url?: unknown;
  url?: unknown;
  channel?: unknown;
  uploader?: unknown;
  upload_date?: unknown;
  timestamp?: unknown;
  description?: unknown;
  view_count?: unknown;
  like_count?: unknown;
  comment_count?: unknown;
  duration?: unknown;
  comments?: Array<{ text?: unknown; author?: unknown; like_count?: unknown }>;
  automatic_captions?: Record<string, Array<{ url?: string; ext?: string }>>;
  subtitles?: Record<string, Array<{ url?: string; ext?: string }>>;
}

function uploadDate(entry: YoutubeEntry): string | undefined {
  const raw = String(entry.upload_date ?? "");
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (typeof entry.timestamp === "number") return new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
  return isoDate(entry.timestamp);
}

export function parseYoutubeEntries(entries: YoutubeEntry[]): SourceItem[] {
  return entries.flatMap((entry): SourceItem[] => {
    const id = String(entry.id ?? "").trim();
    const title = String(entry.title ?? "").trim();
    if (!id || !title) return [];
    const url = String(entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${id}`);
    const publishedAt = uploadDate(entry);
    return [{
      id,
      source: "youtube",
      title,
      url: url.startsWith("http") ? url : `https://www.youtube.com/watch?v=${id}`,
      ...(publishedAt ? { publishedAt } : {}),
      author: String(entry.channel || entry.uploader || ""),
      snippet: String(entry.description ?? "").replace(/\s+/g, " ").slice(0, 500),
      engagement: {
        views: numberValue(entry.view_count),
        likes: numberValue(entry.like_count),
        comments: numberValue(entry.comment_count),
      },
      metadata: {
        durationSeconds: numberValue(entry.duration),
        comments: (entry.comments ?? []).slice(0, 10).map((comment) => ({
          text: String(comment.text ?? ""),
          author: String(comment.author ?? ""),
          likes: numberValue(comment.like_count),
        })),
        captionTracks: entry.subtitles || entry.automatic_captions || {},
      },
    }];
  });
}

function cleanVtt(vtt: string): string {
  const seen = new Set<string>();
  return vtt.split(/\r?\n/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter((line) => line && line !== "WEBVTT" && !line.includes("-->") && !/^\d+$/.test(line))
    .filter((line) => seen.has(line) ? false : (seen.add(line), true))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export class YoutubeSource implements Source {
  readonly name = "youtube";
  constructor(private readonly runner: CommandRunner = runCommand, private readonly fetcher: Fetcher = fetch) {}
  async availability(): Promise<SourceAvailability> {
    return commandExists("yt-dlp")
      ? { available: true, backend: "yt-dlp" }
      : { available: false, backend: "yt-dlp", detail: "yt-dlp is not on PATH" };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    if (!commandExists("yt-dlp")) return unavailable(this.name, "yt-dlp", "yt-dlp is not on PATH");
    const count = Math.min(request.limit, request.depth === "quick" ? 5 : request.depth === "deep" ? 20 : 10);
    const result = await this.runner([
      "yt-dlp",
      "--dump-single-json",
      "--skip-download",
      "--write-comments",
      "--extractor-args",
      "youtube:max_comments=10,all,100,10;comment_sort=top",
      `ytsearch${count}:${request.topic} after:${request.window.from} before:${request.window.to}`,
    ], { timeoutMs: 120_000, signal: request.signal });
    if (result.exitCode !== 0) return { source: this.name, backend: "yt-dlp", status: statusFromExit(result.exitCode, result.stderr), items: [], error: result.stderr || "yt-dlp search failed" };
    let payload: { entries?: YoutubeEntry[] };
    try { payload = JSON.parse(result.stdout) as { entries?: YoutubeEntry[] }; }
    catch { return { source: this.name, backend: "yt-dlp", status: "error", items: [], error: "yt-dlp returned invalid JSON" }; }
    let items = parseYoutubeEntries(payload.entries ?? [])
      .filter((item) => !item.publishedAt || (item.publishedAt >= request.window.from && item.publishedAt <= request.window.to));
    let enrichmentFailed = false;
    const transcriptLimit = request.depth === "quick" ? 1 : request.depth === "deep" ? 5 : 3;
    items = await Promise.all(items.map(async (item, index) => {
      if (index >= transcriptLimit) return item;
      const tracks = item.metadata?.captionTracks as Record<string, Array<{ url?: string; ext?: string }>> | undefined;
      const options = tracks?.en || tracks?.["en-US"] || Object.values(tracks ?? {})[0] || [];
      const track = options.find((option) => option.ext === "vtt") || options[0];
      if (!track?.url) return item;
      try {
        const response = await fetchWithDeadline(this.fetcher, track.url, {}, { timeoutMs: 20_000, signal: request.signal });
        if (!response.ok) { enrichmentFailed = true; return item; }
        return { ...item, body: cleanVtt(await response.text()).slice(0, 20_000) };
      } catch { enrichmentFailed = true; return item; }
    }));
    return {
      source: this.name,
      backend: "yt-dlp",
      status: enrichmentFailed ? "partial" : items.length ? "ok" : "no-results",
      items,
      ...(enrichmentFailed ? { error: "One or more YouTube transcript enrichments failed" } : {}),
    };
  }
}
