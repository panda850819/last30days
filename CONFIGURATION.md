# last30days configuration

The focused Bun engine keeps configuration intentionally small. It has no `.env` loader, API-key store, publishing settings, corpus, or watchlist configuration.

## Per-run options

```bash
last30days <topic> [options]
```

| Option | Effect |
|---|---|
| `--emit md`, `--emit json`, `--json` | Select Markdown or structured JSON output |
| `--quick`, `--deep` | Select retrieval and enrichment depth |
| `--days <n>` | Set the inclusive lookback window |
| `--as-of <YYYY-MM-DD>` | Set the inclusive historical-window end date |
| `--search <sources>` | Restrict retrieval to a comma-separated source allowlist |
| `--limit <n>` | Limit final evidence to 1 through 500 items |

Supported sources:

```text
x, reddit, youtube, hackernews, github, polymarket, web,
arxiv, techmeme, stocktwits
```

Aliases: `twitter` maps to `x`; `hn` maps to `hackernews`.

## Consent policy

The config file stores only explicit consent policy:

```json
{
  "schemaVersion": 1,
  "allowBrowserCookies": false,
  "allowPaidXFallback": false
}
```

Default path:

```text
~/.config/last30days/bun.json
```

Override it for testing or isolated profiles:

```bash
LAST30DAYS_CONFIG_PATH=/path/to/bun.json last30days doctor
```

The file is written with mode `0600`.

Record browser-cookie consent for `xbird`:

```bash
last30days setup --allow-browser-cookies
```

Disable it again:

```bash
last30days setup
```

`setup` does not read browser cookies, install software, or make network requests. The focused engine ships no paid X backend. `--allow-paid-x-fallback` only records separate future-facing consent and spends nothing.

## Source availability

Inspect local CLI and authentication evidence without running research:

```bash
last30days doctor
last30days doctor --json
```

Optional commands must resolve on the process `PATH`:

- `xbird` for X
- `yt-dlp` for YouTube
- authenticated `gh` for GitHub
- `summarize` is detected for future bounded extraction, but automatic URL extraction remains disabled until redirects can be enforced safely
- `arxiv-pp-cli` for arXiv
- `techmeme-pp-cli` for Techmeme

Public HTTP sources need no stored API key. StockTwits activates only for detected stock or cryptocurrency topics.

## X credentials

The engine does not store X credentials. `xbird` resolves its own explicit cookie credentials or existing browser session. Browser-session access remains blocked until `allowBrowserCookies` is true.

There is no silent alternate or paid X fallback.

## Historical limits

Historical `--as-of` runs reject undated evidence centrally. Reddit RSS and Polymarket Gamma public search are reported as `unavailable` for past windows because they cannot provide reliable point-in-time results. Other sources report their own `partial`, `no-results`, or `unavailable` status when a historical window exceeds backend capability.

## Agent Skill links

Inspect or create links to the bundled Skill:

```bash
last30days skill list
last30days skill install
last30days skill install --agents
last30days skill install --pi
```

Targets:

```text
~/.agents/skills/last30days
~/.pi/agent/skills/last30days
```

Installation is explicit and refuses to replace an existing path or unrelated symlink.
