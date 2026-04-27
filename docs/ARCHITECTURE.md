# Architecture

Hat Game is a client-only Expo app. There is no backend, account system, API, Socket.IO room layer, or remote content service.

## Runtime Targets

- Web: Expo Web static export, intended to be hosted with Docker/Nginx.
- iOS: Expo/EAS build.
- Android: Expo/EAS build.

All targets share the same React Native UI and TypeScript game engine.

## Main Layers

### UI Shell

`App.tsx` currently owns the app flow:

- landing page and resume/new-game recovery.
- player/team setup wizard.
- private clue entry handoffs.
- ready handoff between turns.
- active turn screen.
- final results.
- bottom-pinned action bar.

This is intentionally simple for the first version. As the app grows, the natural next refactor is to split `App.tsx` into screen components while keeping the domain engine unchanged.

### Domain Engine

`src/domain/hatGame` contains framework-independent TypeScript logic. It should remain free of React Native imports.

Responsibilities:

- create sessions.
- apply game actions.
- track active team and describer.
- manage turn timers through `endsAt` timestamps.
- handle skips and returned skipped clues.
- advance phases.
- produce final results.

### Local Config And Data

- `src/config/gameDefaults.ts` stores hidden defaults that are not currently user configurable.
- `src/data/namePacks.json` supplies themed default team/player names.
- `src/data/clueSuggestions.json` supplies local clue suggestions.

These files replace the old RVLRY backend/content API approach.

### Persistence

`src/services/storage.ts` wraps AsyncStorage. The UI saves a payload with:

- `schemaVersion`
- `lastSavedAt`
- `snapshot`

Saved games are not automatically resumed. On app launch, the landing page offers `Resume game` or `New game` when a saved snapshot exists.

## Key Design Decisions

- Client-only by default.
- No multiplayer room model.
- Only player count and team count are exposed as setup settings.
- Turn length, clue count, skips, and text limits stay in local config.
- Actions are pinned to the bottom viewport for predictable pass-and-play ergonomics.
- The domain engine uses reducer-style actions so it can be tested independently.

