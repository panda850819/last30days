See `AGENTS.md` for repository-wide guidance.

## Tests

- Use `bun:test` for generated tests.
- Inject fake command runners or fetchers instead of calling live services.
- Run `bun run check`, `bun audit`, `bun pm pack --dry-run`, and `git diff --check` before proposing a PR.

## Skill integration

A CLI capability is incomplete until `skills/last30days/SKILL.md` documents the agent workflow. Test the direct CLI with JSON output:

```bash
bun skills/last30days/src/cli.ts "Bun runtime" --json
```

Do not weaken consent, historical-window, subprocess timeout, or public-URL protections.
