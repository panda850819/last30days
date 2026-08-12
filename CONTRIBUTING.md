# Contributing

## Setup

Bun 1.3 or newer is required.

```bash
bun install --frozen-lockfile
bun run check
```

## Development

```bash
bun skills/last30days/src/cli.ts "Bun runtime" --json
bun skills/last30days/src/cli.ts doctor
bun test test/pipeline.test.ts
bun run typecheck
bun audit
bun pm pack --dry-run
```

Add or update focused Bun tests for every retained behavior or high-risk failure mode.

## Pull requests

1. Make the change and add regression coverage.
2. Run `bun run check`, `bun audit`, `bun pm pack --dry-run`, and `git diff --check`.
3. Add a changelog fragment when users will notice the change:

   ```text
   changelog.d/<issue-or-slug>.<type>.md
   ```

   Types: `added`, `changed`, `fixed`, `removed`, `deprecated`, `security`.
4. Do not edit `CHANGELOG.md` or bump versions in a feature PR.
5. Fill out `.github/PULL_REQUEST_TEMPLATE.md`.

## Security

Never commit real API keys, browser cookies, auth tokens, or `.env` contents. Use obvious dummy values in tests. New network and subprocess behavior must include bounded deadlines, truthful errors, and tests for its trust boundaries.
