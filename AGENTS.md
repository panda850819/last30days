# last30days Skill

Focused Agent Skill and Bun/TypeScript CLI for researching recent public evidence.

## Structure

- `skills/last30days/SKILL.md`: canonical agent-facing runtime contract
- `skills/last30days/src/cli.ts`: Bun CLI entrypoint
- `skills/last30days/src/core/`: source contract, pipeline, ranking, rendering, safety, and date windows
- `skills/last30days/src/sources/`: source implementations
- `skills/last30days/src/readers/`: bounded public-page extraction
- `test/`: Bun contract, pipeline, safety, and E2E tests
- `CONFIGURATION.md`: user-facing flags, consent, source availability, and Skill links
- `changelog.d/`: release-note fragments

## Orientation

- The product is the `/last30days <topic>` Agent Skill. The Bun CLI implements it and is also the direct scripting surface.
- Feature design starts from the Skill workflow. A CLI feature without `SKILL.md` integration is incomplete.
- The engine is requirements-driven. Broad legacy sources remain future work until deliberately designed and tested.
- Slash commands do not pass shell mechanics through. Use a slash command without pipes or invoke `last30days` from a real shell.

## Commands

```bash
bun install --frozen-lockfile
bun skills/last30days/src/cli.ts "test query" --json
bun skills/last30days/src/cli.ts doctor
bun run check
bun audit
bun pm pack --dry-run
```

Bun 1.3+ is required. No secondary runtime or test framework is supported.

## Rules

- Use the internal `Source` interface and normalized source statuses.
- One source failure must not terminate an otherwise useful run.
- Historical runs must not present current or undated evidence as point-in-time data.
- X uses `xbird`; do not add implicit paid fallback.
- GitHub uses an authenticated `gh` session.
- Polymarket is public, read-only, and never connects a wallet or trades.
- Browser-session access requires recorded consent.
- New network paths need source-level deadlines and honest failure statuses.
- New subprocess paths use argument arrays, process-group termination, and no shell interpolation.
- Public page extraction must preserve URL and private-network protections.
- Skill-link installation must remain explicit, idempotent, and non-overwriting.
- Never commit API keys, browser cookies, tokens, or `.env` contents.

## Changelog and releases

Feature and fix PRs add `changelog.d/<issue-or-slug>.<type>.md`. Supported types are `added`, `changed`, `fixed`, `removed`, `deprecated`, and `security`.

Do not edit `CHANGELOG.md` or bump lockstep versions in a feature PR. Releases update `package.json`, `SKILL.md`, and plugin manifests together.

## GitHub

- Remote: `https://github.com/panda850819/last30days`
- Canonical requirements: GitHub Spec Issue #1

## verbs

tracker: github
