# Hat Game Pass N Play

Client-only Expo React Native + Web app for a pass-and-play version of **Celebrity**, called **Hat Game**.

Players split into teams, privately submit clue names, then reuse the same clue pool across three phases: **Describe**, **One Word**, and **Charades**. The app runs without a server. Web, iOS, and Android all share the same TypeScript domain engine and Expo UI.

## Current Status

- Expo React Native + Web app.
- Client-only local persistence with AsyncStorage.
- Wizard setup with only player count and team count as user-facing settings.
- Themed default team/player names from bundled JSON.
- Private clue-entry handoffs.
- Local clue suggestions from bundled JSON.
- Timed turns, scoring, skips, returned skipped clues, phase rollover, final results.
- Landing page with explicit resume/new-game recovery.
- Unit tests for core game mechanics.
- Dockerfile for self-hosting the web build.

## Quick Start

```bash
npm install
npm run web
```

Useful commands:

```bash
npm run typecheck
npm test
npm run build:web
npm run docker:build
npm run docker:run
```

After `npm run docker:run`, open `http://localhost:8080`.

## Project Layout

- `App.tsx`: current single-file Expo UI shell, setup wizard, gameplay views, and landing/recovery flow.
- `src/domain/hatGame`: pure TypeScript game engine, setup helpers, time helpers, and tests.
- `src/config/gameDefaults.ts`: hidden game defaults such as turn length, clues per player, and skips per turn.
- `src/data`: bundled local JSON for name packs and clue suggestions.
- `src/services/storage.ts`: AsyncStorage persistence wrapper.
- `docs`: architecture, game engine, and deployment notes for contributors.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Game Engine](docs/GAME_ENGINE.md)
- [Contributor Guide](docs/CONTRIBUTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Versioning](docs/VERSIONING.md)

## Distribution

Web is intended to be self-hosted as a static Expo export served by Docker/Nginx. iOS and Android builds are configured for Expo/EAS, but store deployment requires Apple Developer and Google Play Console setup.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the next steps and what account/API access is needed.
