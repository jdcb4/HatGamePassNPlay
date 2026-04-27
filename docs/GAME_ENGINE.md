# Game Engine

The core game logic lives in `src/domain/hatGame`.

## Important Files

- `types.ts`: domain types for players, teams, sessions, active turns, results, and actions.
- `engine.ts`: phase metadata, session creation, action reducer, scoring, phase rollover, and results.
- `setup.ts`: setup validation, default themed setup generation, and player/team balancing helpers.
- `teamUtils.ts`: team/player sorting, team context, shuffling, leaderboard helpers.
- `time.ts`: countdown calculation and formatting.
- `engine.test.ts`: unit tests for core game behavior.

## Session Model

`HatGameSession` stores:

- `players`: ordered by `seat`.
- `teams`: with id, name, and score.
- `settings`: hidden defaults copied from app config when the session starts.
- `stage`: `ready`, `turn`, or `results`.
- `phaseNumber`: 1 Describe, 2 One Word, 3 Charades.
- `teamOrder` and `teamIndex`: active team rotation.
- `describerIndexes`: per-team presenter rotation.
- `cluePool`: all submitted clues.
- `usedCluePoolIndices`: clues completed in the current phase.
- `activeTurn`: live turn state.
- `lastTurnSummary`, `bestTurnSummary`, and `results`.

## Public Engine API

### `createHatGameSession`

Creates a new session from:

- players.
- teams.
- config.
- clue submissions.

It resets scores, builds the clue pool, initializes phase 1, and sets the first team/describer.

### `applyHatGameAction`

Reducer-style function for game actions:

- `start-turn`
- `end-turn`
- `mark-correct`
- `skip-clue`
- `return-skipped-clue`

It returns either the next `HatGameSession` or `{ error }`.

### `getHatGameContext`

Returns active team and active describer information for the current session.

### `getHatGamePhaseMeta`

Returns the phase label and rule text for the current phase.

## Turn Rules

- A turn starts from `stage: ready`.
- The turn queue includes clues not yet used in the current phase.
- `endsAt` is an absolute timestamp; UI countdown is always derived from it.
- Correct clues increase active turn score and are marked used when the turn ends.
- Skipped clues are pushed to the end of the queue and tracked in `skippedClues`.
- A returned skipped clue is selected by `poolIndex`.
- Skip capacity is based on unresolved skipped clues, so capacity returns after a skipped clue is guessed.

## Phase Rules

- Phase 1: Describe.
- Phase 2: One Word.
- Phase 3: Charades.
- The same clue pool is reused in each phase.
- When a phase's clue pool is exhausted, the session advances to the next phase.
- If a phase is exhausted during a live turn and time remains, the turn continues into the next phase without resetting `endsAt`.
- After Phase 3 is exhausted, the session enters `results`.

## Tests

Run:

```bash
npm test
```

Current coverage includes:

- full three-phase game completion.
- in-turn phase rollover without timer reset.
- skipped and unfinished clue return behavior.
- skip capacity restoration.
- selectable skipped clues.
- setup validation.

