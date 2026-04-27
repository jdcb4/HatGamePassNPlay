import { describe, expect, it } from 'vitest';
import { GAME_DEFAULTS } from '../../config/gameDefaults';
import { applyHatGameAction, createHatGameSession, getHatGameContext } from './engine';
import { buildDefaultSetup, getHatGameSetupError } from './setup';
import type { ClueSubmissionMap, HatGameSession } from './types';

const fixedNow = Date.UTC(2026, 0, 1, 12, 0, 0);
const actionOptions = {
  rng: () => 0.5,
  nowMs: () => fixedNow,
  toIso: (timestamp: number) => new Date(timestamp).toISOString(),
  makeTimestamp: () => new Date(fixedNow).toISOString(),
  isPast: () => false
};

const unwrap = (result: ReturnType<typeof applyHatGameAction>) => {
  if ('error' in result) {
    throw new Error(result.error);
  }
  return result;
};

const makeSession = ({ cluesPerPlayer = 1, skipsPerTurn = 1 } = {}) => {
  const { teams, players } = buildDefaultSetup(4, 2);
  const clueSubmissions: ClueSubmissionMap = Object.fromEntries(
    players.map((player, playerIndex) => [
      player.id,
      {
        clues: Array.from({ length: cluesPerPlayer }, (_, clueIndex) => `Clue ${playerIndex}-${clueIndex}`)
      }
    ])
  );

  return createHatGameSession({
    teams,
    players,
    clueSubmissions,
    config: {
      ...GAME_DEFAULTS,
      cluesPerPlayer,
      skipsPerTurn
    },
    rng: () => 0.5
  });
};

describe('Hat Game engine', () => {
  it('plays a full game across describe, one-word, and charades', () => {
    let session: HatGameSession = makeSession({ cluesPerPlayer: 3 });

    while (session.stage !== 'results') {
      if (session.stage === 'ready') {
        session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));
      }
      session = unwrap(applyHatGameAction(session, { type: 'mark-correct' }, actionOptions));
    }

    expect(session.results?.totalClues).toBe(12);
    expect(session.results?.leaderboard).toHaveLength(2);
    expect(session.results?.bestTurn?.describerName).toBeTruthy();
  });

  it('rolls into the next phase without resetting the active turn timer', () => {
    let session = makeSession({ cluesPerPlayer: 1 });
    session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));
    const endsAt = session.activeTurn?.endsAt;

    for (let index = 0; index < 4; index += 1) {
      session = unwrap(applyHatGameAction(session, { type: 'mark-correct' }, actionOptions));
    }

    expect(session.stage).toBe('turn');
    expect(session.phaseNumber).toBe(2);
    expect(session.activeTurn?.endsAt).toBe(endsAt);
  });

  it('returns skipped and unfinished clues on the next turn', () => {
    let session = makeSession({ cluesPerPlayer: 1 });
    session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));
    const firstQueue = session.activeTurn?.clueQueue.map((clue) => clue.text) ?? [];

    session = unwrap(applyHatGameAction(session, { type: 'mark-correct' }, actionOptions));
    const skippedClue = session.activeTurn?.clueQueue[session.activeTurn.queueIndex]?.text;
    const unfinishedClue = session.activeTurn?.clueQueue[session.activeTurn.queueIndex + 1]?.text;
    session = unwrap(applyHatGameAction(session, { type: 'skip-clue' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'end-turn' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));

    const nextQueue = session.activeTurn?.clueQueue.map((clue) => clue.text) ?? [];
    expect(nextQueue).toContain(skippedClue);
    expect(nextQueue).toContain(unfinishedClue);
    expect(nextQueue).not.toContain(firstQueue[0]);
  });

  it('restores skip capacity after a returned skipped clue is guessed', () => {
    let session = makeSession({ cluesPerPlayer: 1, skipsPerTurn: 1 });
    session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'skip-clue' }, actionOptions));

    expect(session.activeTurn?.skipsRemaining).toBe(0);

    session = unwrap(
      applyHatGameAction(
        session,
        {
          type: 'return-skipped-clue',
          payload: { poolIndex: session.activeTurn?.skippedClues[0].poolIndex }
        },
        actionOptions
      )
    );
    session = unwrap(applyHatGameAction(session, { type: 'mark-correct' }, actionOptions));

    expect(session.activeTurn?.currentSkippedCluePoolIndex).toBeNull();
    expect(session.activeTurn?.skipsRemaining).toBe(1);
  });

  it('supports selecting one of multiple skipped clues', () => {
    let session = makeSession({ cluesPerPlayer: 2, skipsPerTurn: 3 });
    session = unwrap(applyHatGameAction(session, { type: 'start-turn' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'skip-clue' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'skip-clue' }, actionOptions));
    session = unwrap(applyHatGameAction(session, { type: 'skip-clue' }, actionOptions));

    const target = session.activeTurn?.skippedClues[1];
    session = unwrap(
      applyHatGameAction(
        session,
        { type: 'return-skipped-clue', payload: { poolIndex: target?.poolIndex } },
        actionOptions
      )
    );

    expect(session.activeTurn?.clueQueue[session.activeTurn.queueIndex].text).toBe(target?.text);
    expect(session.activeTurn?.skippedClues).toHaveLength(2);
  });

  it('validates setup bounds and team sizes', () => {
    expect(getHatGameSetupError({ playerCount: 3, teamCount: 2 })).toBe('Choose 4-12 players.');
    expect(getHatGameSetupError({ playerCount: 4, teamCount: 3 })).toBe('Each team needs at least 2 players.');

    const { teams, players } = buildDefaultSetup(4, 2);
    expect(getHatGameSetupError({ playerCount: 4, teamCount: 2, teams, players })).toBeNull();
    expect(getHatGameContext(makeSession()).activeTeamPlayers).toHaveLength(2);
  });
});

