# Contributor Guide

## Setup

```bash
npm install
npm run web
```

Use `npm run typecheck` and `npm test` before committing.

Read [Versioning](VERSIONING.md) before committing feature or fix work. Version bumps are required when behavior, UX, deployment, dependencies, persistence, or usage documentation changes.

## Development Workflow

1. Keep domain logic in `src/domain/hatGame` framework-independent.
2. Keep React Native UI and persistence in `App.tsx` or future `src/ui` modules.
3. Put hidden defaults in `src/config/gameDefaults.ts`.
4. Put local static content in `src/data`.
5. Add tests for any game-rule change.

## Coding Notes

- The app is TypeScript strict.
- The domain reducer returns `{ error }` instead of throwing for user-facing invalid actions.
- Timers should use `endsAt`; do not store a decrementing countdown as source of truth.
- Persistence should remain schema-versioned.
- Avoid adding server dependencies unless the product direction changes.

## UX Principles

- Keep setup short.
- Prefer wizard steps over dense configuration screens.
- Keep pass-and-play handoffs explicit.
- Keep active turn controls fixed at the bottom.
- Make the presenter and active team visible during turns.

## Git Hygiene

Do not commit:

- `node_modules`
- Expo cache folders.
- web build output.
- generated native `ios`/`android` folders unless intentionally ejecting/prebuilding.
- local env files or signing credentials.
