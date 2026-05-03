# Versioning Rules

Current version: `0.3.0`.

Hat Game uses semantic versioning in `MAJOR.MINOR.PATCH` format.

## Version Format

```text
MAJOR.MINOR.PATCH
```

Examples:

- `0.1.0`
- `0.2.0`
- `0.2.1`
- `1.0.0`

## When To Increment

- Increment `PATCH` for bug fixes, small UI fixes, documentation corrections that affect usage, dependency compatibility fixes, and non-breaking polish.
- Increment `MINOR` for new user-visible features, meaningful UX changes, new settings, new screens, new deployment capabilities, or additive domain behavior.
- Increment `MAJOR` for breaking changes to saved-game persistence, incompatible data/schema changes, removed user-facing capabilities, or a production release line reset.

While the app is pre-1.0, use `MINOR` for meaningful feature milestones and `PATCH` for fixes.

## Required Files To Update

Every feature/fix commit must check whether a version increment is required. If required, update both:

- `package.json`
- `app.json`

The values must match exactly.

If a change is intentionally version-neutral, mention that in the commit message or PR notes.

## Docker Tags

Docker web builds must always produce both tags:

- `jdcb4/hat-game-pass-n-play:<version>`
- `jdcb4/hat-game-pass-n-play:latest`

Use:

```bash
npm run docker:build
```

Do not hand-build only `latest`.

## Release Checklist

Before pushing a release-oriented commit:

```bash
npm run typecheck
npm test
npm run build:web
npm run docker:build
```

Then confirm:

- `package.json` version matches `app.json` Expo version.
- Docker image has both the version tag and `latest`.
- Documentation still reflects the current workflow.
