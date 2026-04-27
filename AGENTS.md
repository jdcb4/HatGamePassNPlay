# Agent Instructions

This file is for AI coding agents working on Hat Game.

## Versioning Is Mandatory

Before every commit, determine whether the work changes app behavior, user-visible UX, deployment behavior, dependencies, persistence, or documentation in a way that should be tracked.

If yes, increment the version in both:

- `package.json`
- `app.json`

Both versions must match and must use `MAJOR.MINOR.PATCH`.

Rules:

- `PATCH`: fixes, small polish, docs that affect usage, dependency compatibility.
- `MINOR`: new features, meaningful UX changes, new screens/settings, additive game behavior, deployment capability changes.
- `MAJOR`: breaking persistence/schema changes, removed capabilities, or incompatible release changes.

Current baseline is `0.1.0`.

Do not commit feature work without either:

- incrementing the version, or
- explicitly noting why the change is version-neutral.

## Docker Builds

Use only:

```bash
npm run docker:build
```

The script must build both:

- `jdcb4/hat-game-pass-n-play:<package version>`
- `jdcb4/hat-game-pass-n-play:latest`

Do not build or document a Docker image that only has `latest`.

## Verification Before Commit

Run the relevant checks before committing:

```bash
npm run typecheck
npm test
npm run build:web
```

For deployment-related changes, also run:

```bash
npm run docker:build
```

Keep the domain engine in `src/domain/hatGame` free of React Native imports.
