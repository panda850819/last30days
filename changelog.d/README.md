# Changelog fragments

User-visible feature and fix PRs add a Markdown fragment here. Do not edit `CHANGELOG.md` or bump versions in a feature PR.

Naming:

```text
changelog.d/<issue-or-slug>.<type>.md
```

Types:

- `added`
- `changed`
- `fixed`
- `removed`
- `deprecated`
- `security`

Write one or two sentences describing behavior users will notice. Release maintenance can assemble these fragments into release notes without adding a runtime dependency to this repository.
