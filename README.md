# last30days

A focused Bun and TypeScript engine for researching recent public evidence across X, Reddit, YouTube, Hacker News, GitHub, Polymarket, and the web.

This fork uses a small Bun CLI while preserving the Agent Skill workflow. It ranks evidence using relevance, recency, engagement, and first-party signals, then emits Markdown or structured JSON for an agent to synthesize.

Repository: <https://github.com/panda850819/last30days>

## Current status

The Bun engine and Skill are implemented and tested locally. The npm package is not published yet.

Supported workflows:

- General topic research
- Person and company research with first-party lanes
- Multi-entity comparison
- Listing-based trending discovery
- Historical windows with `--as-of`
- Source diagnostics with `doctor`
- Explicit X browser-cookie consent with `setup`

The repository is Bun-only. The Skill and package use `skills/last30days/src/cli.ts`.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer

Optional local CLIs enable additional sources:

| CLI | Purpose |
|---|---|
| [`xbird`](https://github.com/panda850819/xbird) | X search, trends, and first-party posts |
| [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) | YouTube search, metadata, comments, and transcripts |
| [`gh`](https://cli.github.com/) | Authenticated GitHub search and first-party activity |
| [`summarize`](https://github.com/steipete/summarize) | Future bounded page extraction; currently disabled pending redirect-safe enforcement |
| `arxiv-pp-cli` | Optional arXiv results |
| `techmeme-pp-cli` | Optional Techmeme results |

Public HTTP sources such as Reddit, Hacker News, Polymarket, DuckDuckGo web search, and StockTwits need no API key. GitHub requires an existing authenticated `gh` session.

## Install

### From this repository

```bash
git clone https://github.com/panda850819/last30days.git
cd last30days
bun install
bun link
last30days skill install
```

### npm package

After `@panda850819/last30days` is published:

```bash
bun add -g @panda850819/last30days
last30days skill list
```

Package installation does not write outside the package directory. Create Skill links explicitly with `last30days skill install`.

For a one-off package invocation:

```bash
bunx @panda850819/last30days skill install
```

### Agent Skill links

The package can link its bundled Skill into both supported host locations:

```text
~/.agents/skills/last30days
~/.pi/agent/skills/last30days
```

Inspect or create those links with:

```bash
last30days skill list
last30days skill install
last30days skill install --agents
last30days skill install --pi
```

Links are relative, and installation is idempotent. The installer refuses to replace an existing directory, file, or unrelated symlink.

You can also install the repository through a compatible Agent Skills host:

```bash
npx skills add panda850819/last30days -g
```

For Claude Code marketplace installation:

```text
/plugin marketplace add panda850819/last30days
/plugin install last30days
```

## Quick start

Check source availability first:

```bash
last30days doctor
last30days doctor --json
```

Run research:

```bash
last30days "Bun runtime"
last30days "Bun runtime" --json
last30days "Codex vs Claude Code" --json
last30days --discover "AI agents" --json
```

Run the source file directly when developing without `bun link`:

```bash
bun skills/last30days/src/cli.ts "Bun runtime" --json
```

## CLI

```text
last30days <topic> [options]
last30days <topic A> vs <topic B> [options]
last30days --discover [domain] [options]
last30days doctor [--json]
last30days setup [--allow-browser-cookies] [--allow-paid-x-fallback]
last30days skill list [--agents|--pi]
last30days skill install [--agents|--pi]
```

Research options:

| Option | Description |
|---|---|
| `--emit md` | Markdown output, the default |
| `--emit json`, `--json` | Structured JSON evidence report |
| `--quick` | Lower-latency retrieval with less enrichment |
| `--deep` | Higher-recall retrieval with more enrichment |
| `--days <n>` | Lookback window, default 30 days |
| `--as-of <YYYY-MM-DD>` | Inclusive historical-window end date |
| `--search <sources>` | Comma-separated source allowlist |
| `--limit <n>` | Final evidence limit, from 1 to 500 |

Supported source names:

```text
x, reddit, youtube, hackernews, github, polymarket, web,
arxiv, techmeme, stocktwits
```

Aliases: `twitter` maps to `x`; `hn` maps to `hackernews`.

## Examples

### Select sources

```bash
last30days "Bun runtime" --search x,reddit,youtube,hackernews,github,web --json
```

### Compare entities

The CLI runs every entity through the same sources and date window:

```bash
last30days "Bun vs Node" --deep --json
```

Comparison evidence includes `metadata.researchTopic` so an agent can group findings by entity.

### Discover emerging topics

```bash
last30days --discover "AI agents" --json
```

Discovery uses listing and feed surfaces such as X trends, Hacker News front page, and Reddit top listings. A confidence floor removes weak, uncorroborated candidates. An empty result is valid.

### Historical research

```bash
last30days "Bun runtime" --as-of 2025-12-31 --days 30 --json
```

The pipeline centrally removes evidence outside the date window. Historical windows also reject undated evidence. Individual sources can still return `partial`, `no-results`, or `unavailable` when they cannot provide reliable historical coverage.

## Sources

| Source | Backend | Behavior |
|---|---|---|
| X | `xbird` | Search, trends, first-party posts, and about lane; browser session use requires consent |
| Reddit | Public RSS | Search/listings, engagement, post body, and bounded top comments |
| YouTube | `yt-dlp` | Date-filtered discovery, metadata, bounded comments, and transcripts |
| Hacker News | Algolia API | Topic search and front-page discovery |
| GitHub | Authenticated `gh` | Issues, pull requests, repositories, and resolved-user public events |
| Polymarket | Gamma API | Free read-only market and odds data; no wallet and no trading |
| Web | DuckDuckGo HTML | Search snippets plus bounded extraction of top public pages |
| Page extraction | `summarize` | Temporarily disabled until redirect-by-redirect public-address enforcement is available |
| arXiv | `arxiv-pp-cli` | Optional source when installed |
| Techmeme | `techmeme-pp-cli` | Optional source when installed |
| StockTwits | Public API | Enabled only for detected finance and cryptocurrency topics |

Every source returns one status:

```text
ok, partial, no-results, auth-failed, rate-limited,
timeout, unavailable, error
```

`no-results` means the source completed successfully and found nothing. Other non-`ok` states mean coverage was incomplete.

## Historical source limits

Historical `--as-of` windows require point-in-time evidence:

- Reddit RSS is reported as `unavailable` because its time filters are relative to today.
- Polymarket is reported as `unavailable` because Gamma public search exposes current odds, not historical price snapshots.
- DuckDuckGo web search and StockTwits are reported as `unavailable` because their public results do not provide reliable arbitrary point-in-time coverage.
- Sources with date-addressable search still run, but may report `partial`, `no-results`, or `unavailable` according to their backend limits.

The engine never labels current market odds or current relative feeds as historical evidence.

## X consent

X uses `xbird` only. The engine does not silently fall back to a paid X API.

Browser-cookie access is disabled by default. Inspect policy without reading cookies:

```bash
last30days doctor --json
```

Record explicit consent before allowing `xbird` to resolve an existing browser session:

```bash
last30days setup --allow-browser-cookies
```

Disable consent again:

```bash
last30days setup
```

`setup` only writes policy. It does not install tools, read browser cookies, perform research, or make paid calls. `--allow-paid-x-fallback` records separate future-facing consent, but this engine currently ships no paid X backend.

Configuration is stored at:

```text
~/.config/last30days/bun.json
```

The file is written with mode `0600`. Set `LAST30DAYS_CONFIG_PATH` to override its location.

## JSON contract

JSON output has this top-level shape:

```ts
{
  schemaVersion: 1,
  mode: "research" | "comparison" | "discover",
  topics: string[],
  window: { from: string, to: string, days: number },
  generatedAt: string,
  items: SourceItem[],
  sources: SourceResult[]
}
```

Evidence items carry source, title, URL, optional publication date, engagement, optional body or snippet, relevance, score, and source-specific metadata.

## Safety and privacy

- Research is read-only.
- X browser-session access requires recorded consent.
- Paid X fallback requires separate explicit consent and is not implemented.
- Polymarket access is free and read-only. The engine never connects a wallet or trades.
- Subprocess and HTTP sources have bounded wall-clock deadlines.
- Timed-out subprocesses terminate their process group.
- Web extraction rejects credentialed URLs, non-HTTP schemes, localhost, private IPs, and hosts resolving to private addresses.
- Automatic `summarize` URL extraction is disabled because the caller cannot enforce public-address validation before every redirect is followed.
- Page extraction is limited to a small number of top-ranked web results.
- The engine does not publish, manage watchlists, or search private local corpora.

## Development

```bash
bun install
bun run typecheck
bun test
bun run check
```

Current focused suite covers CLI parsing and E2E behavior, source contracts, ranking and pipeline behavior, entity resolution, date windows, setup/doctor, Skill links, subprocess termination, URL safety, and historical-window integrity.

## Future work

The focused Bun engine does not implement these yet. They are candidates for later work, not current capabilities:

- TikTok discovery and engagement
- Instagram posts and Reels
- LinkedIn public activity
- Threads, Bluesky, and Xiaohongshu sources
- Perplexity-backed retrieval or synthesis
- Digg and other curated feeds
- Local/private corpus search
- Saved watchlists and scheduled delivery
- Publishing workflows

Any future source must fit the internal `Source` contract, report honest coverage status, preserve date-window integrity, and avoid implicit paid fallback. Private-session access requires explicit consent. Publishing and other outward-facing writes require a separate safety design.

Package preview:

```bash
bun pm pack --dry-run
```

## License

MIT. See [LICENSE](LICENSE).
