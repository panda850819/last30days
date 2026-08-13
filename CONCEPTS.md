# Concepts

## Skill

The Agent Skills package rooted at `skills/last30days/SKILL.md`. It tells a host agent how to run the bundled Bun CLI and synthesize its evidence without inventing unsupported claims.

## Engine

The Bun and TypeScript runtime under `skills/last30days/src/`. The CLI is the direct scripting surface; internal modules are not a public npm library contract.

## Source

An internal retrieval implementation following the shared `Source` interface. A source accepts one topic, mode, date window, depth, limit, optional entity metadata, and abort signal. It returns normalized evidence plus an honest status.

## Source status

One of `ok`, `partial`, `no-results`, `auth-failed`, `rate-limited`, `timeout`, `unavailable`, or `error`. `no-results` means retrieval completed successfully and found nothing. Other non-`ok` states mean coverage was incomplete.

## Evidence item

A normalized public record with source, title, URL, optional date and content, engagement, ranking fields, and source metadata. Comparison evidence carries its `researchTopic`.

## First-party lane

Recent activity published by the researched person or company, distinct from third-party discussion about it. X and GitHub expose first-party lanes when entity resolution finds a sufficiently confident account.

## Discovery

Listing-based topic discovery using trend, front-page, or top-feed surfaces. Candidates must pass an absolute confidence floor based on independent corroboration or strong engagement. An empty result is valid.

## Historical window

An inclusive date range ending at `--as-of`. Undated evidence is rejected for historical runs. Sources that cannot provide point-in-time evidence report `unavailable` instead of presenting current data as historical.

## Consent policy

The small private JSON config recording whether browser-cookie access or a future paid X fallback is approved. `setup` records policy only; it does not read cookies, install software, or perform research.

## Skill link

A relative symlink from a supported host directory to the Skill bundled inside the package. Installation is explicit and refuses to replace occupied paths.
