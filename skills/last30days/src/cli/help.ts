export const HELP = `last30days - recent public research powered by Bun

Usage:
  last30days <topic> [options]
  last30days <topic A> vs <topic B> [options]
  last30days --discover [domain] [options]
  last30days doctor [--json]
  last30days setup [--allow-browser-cookies] [--allow-paid-x-fallback]
  last30days skill list [--agents|--pi]
  last30days skill install [--agents|--pi]

Options:
  --emit <md|json>       Output format (default: md)
  --json                 Alias for --emit json
  --quick                Lower-latency retrieval
  --deep                 Higher-recall retrieval
  --days <n>             Lookback window (default: 30)
  --as-of <YYYY-MM-DD>   End date for a historical window
  --search <sources>     Comma-separated source list
  --limit <n>            Final evidence limit (default: 50)
  --agents               Target ~/.agents/skills only
  --pi                   Target ~/.pi/agent/skills only
  -h, --help             Show help
`;
