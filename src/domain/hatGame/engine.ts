import { GAME_DEFAULTS, type HatGameConfig } from '../../config/gameDefaults';
import {
  buildLeaderboard,
  getTimedTeamContext,
  normalizeText,
  shuffleArray,
  sortPlayersBySeat
} from './teamUtils';
import type {
  ActiveTurn,
  CluePoolEntry,
  ClueSubmissionMap,
  HatGameAction,
  HatGameActionResult,
  HatGameSession,
  HatGameSettings,
  Player,
  Team
} from './types';

export const HAT_GAME_PHASES = {
  1: {
    name: 'Describe',
    instruction: 'Use as many words as you want, but do not say any part of the name.'
  },
  2: {
    name: 'One Word',
    instruction: 'Say exactly one word only. No gestures.'
  },
  3: {
    name: 'Charades',
    instruction: 'Act it out silently. No words or sounds.'
  }
} as const;

export const getHatGamePhaseMeta = (phaseNumber: number) =>
  HAT_GAME_PHASES[phaseNumber as keyof typeof HAT_GAME_PHASES] ?? HAT_GAME_PHASES[1];

export const getHatGameContext = (session: HatGameSession) =>
  getTimedTeamContext({
    players: session.players,
    teams: session.teams,
    teamOrder: session.teamOrder,
    teamIndex: session.teamIndex,
    describerIndexes: session.describerIndexes
  });

export const buildHatGameCluePool = (
  players: Player[],
  clueSubmissions: ClueSubmissionMap
): CluePoolEntry[] =>
  sortPlayersBySeat(players).flatMap((player) =>
    (clueSubmissions[player.id]?.clues ?? [])
      .map((clue) => normalizeText(clue))
      .filter(Boolean)
      .map((clue) => ({
        text: clue,
        submittedBy: player.id,
        submittedByName: player.name
      }))
  );

const syncSkipState = (activeTurn: ActiveTurn, skipLimit: number): ActiveTurn => ({
  ...activeTurn,
  skipsRemaining: Math.max(skipLimit - (activeTurn.skippedClues?.length ?? 0), 0)
});

const hasUnresolvedSkippedClues = (activeTurn: ActiveTurn) =>
  activeTurn.skippedClues.length > 0 || activeTurn.currentSkippedCluePoolIndex !== null;

const collectClueQueue = (session: HatGameSession, rng: () => number) =>
  shuffleArray(
    session.cluePool
      .map((clue, index) => ({ ...clue, poolIndex: index }))
      .filter((clue) => !session.usedCluePoolIndices.includes(clue.poolIndex)),
    rng
  );

const buildResults = (session: HatGameSession) => {
  const leaderboard = buildLeaderboard(session.teams);
  const topScore = leaderboard[0]?.score ?? 0;
  const winnerTeamIds = leaderboard
    .filter((team) => team.score === topScore)
    .map((team) => team.teamId);

  return {
    leaderboard,
    winnerTeamIds,
    isTie: winnerTeamIds.length > 1,
    totalClues: session.cluePool.length,
    bestTurn: session.bestTurnSummary
  };
};

const advancePhaseWithinTurn = (
  session: HatGameSession,
  activeTurn: ActiveTurn,
  rng: () => number
): HatGameActionResult => {
  if (hasUnresolvedSkippedClues(activeTurn)) {
    return { error: 'Bring the skipped clue back before moving to the next phase' };
  }

  const nextPhaseNumber = Math.min(session.phaseNumber + 1, 3);
  const nextQueue = shuffleArray(
    session.cluePool.map((clue, index) => ({ ...clue, poolIndex: index })),
    rng
  );

  if (nextQueue.length === 0) {
    return { error: 'No clues are available for the next phase' };
  }

  return {
    ...session,
    phaseNumber: nextPhaseNumber,
    usedCluePoolIndices: [],
    activeTurn: syncSkipState(
      {
        ...activeTurn,
        clueQueue: nextQueue,
        queueIndex: 0,
        skippedClues: [],
        currentSkippedCluePoolIndex: null
      },
      session.settings.skipsPerTurn
    )
  };
};

const finishTurn = (session: HatGameSession): HatGameActionResult => {
  const context = getHatGameContext(session);
  if (!session.activeTurn || !context.activeTeamId) {
    return { error: 'No live turn is active right now' };
  }

  const activeTurn = session.activeTurn;
  const teams = session.teams.map((team) =>
    team.id === context.activeTeamId ? { ...team, score: team.score + activeTurn.score } : team
  );
  const usedCluePoolIndices = [
    ...new Set([
      ...session.usedCluePoolIndices,
      ...activeTurn.clueHistory
        .filter(
          (entry) =>
            entry.status === 'correct' &&
            (entry.phaseNumber === session.phaseNumber ||
              (entry.phaseNumber === undefined && session.phaseNumber === 1))
        )
        .map((entry) => entry.poolIndex)
    ])
  ];
  const phaseCompleted =
    session.cluePool.length > 0 && usedCluePoolIndices.length >= session.cluePool.length;
  const nextPhaseNumber = phaseCompleted ? Math.min(session.phaseNumber + 1, 3) : session.phaseNumber;
  const lastTurnSummary = {
    teamId: context.activeTeamId,
    teamName: context.activeTeam?.name ?? 'Team',
    describerId: context.activeDescriberId,
    describerName: context.activeDescriberName,
    scoreDelta: activeTurn.score,
    correctCount: activeTurn.correctCount,
    skippedCount: activeTurn.skippedCount,
    clues: activeTurn.clueHistory,
    phaseCompleted,
    completedPhaseNumber: phaseCompleted ? session.phaseNumber : null,
    nextPhaseNumber: phaseCompleted && session.phaseNumber < 3 ? nextPhaseNumber : null,
    nextPhaseName:
      phaseCompleted && session.phaseNumber < 3 ? getHatGamePhaseMeta(nextPhaseNumber).name : null
  };
  const currentTurnHighlight = {
    teamId: context.activeTeamId,
    teamName: context.activeTeam?.name ?? 'Team',
    describerId: context.activeDescriberId,
    describerName: context.activeDescriberName,
    score: activeTurn.score,
    phaseNumber: session.phaseNumber,
    phaseName: getHatGamePhaseMeta(session.phaseNumber).name
  };
  const bestTurnSummary =
    !session.bestTurnSummary || currentTurnHighlight.score > session.bestTurnSummary.score
      ? currentTurnHighlight
      : session.bestTurnSummary;
  const currentDescriberIndex = session.describerIndexes[context.activeTeamId] ?? 0;
  const describerIndexes = {
    ...session.describerIndexes,
    [context.activeTeamId]:
      context.activeTeamPlayers.length === 0
        ? 0
        : (currentDescriberIndex + 1) % context.activeTeamPlayers.length
  };

  let teamIndex = session.teamIndex + 1;
  let roundNumber = session.roundNumber;
  if (teamIndex >= session.teamOrder.length) {
    teamIndex = 0;
    roundNumber += 1;
  }

  const nextSession: HatGameSession = {
    ...session,
    teams,
    stage: 'ready',
    activeTurn: null,
    lastTurnSummary,
    bestTurnSummary,
    teamIndex,
    roundNumber,
    phaseNumber: nextPhaseNumber,
    describerIndexes,
    usedCluePoolIndices: phaseCompleted ? [] : usedCluePoolIndices
  };

  if (phaseCompleted && session.phaseNumber >= 3) {
    return {
      ...nextSession,
      stage: 'results',
      usedCluePoolIndices: [],
      results: buildResults(nextSession)
    };
  }

  return nextSession;
};

export const createHatGameSession = ({
  players,
  teams,
  config = GAME_DEFAULTS,
  clueSubmissions,
  rng = Math.random
}: {
  players: Player[];
  teams: Team[];
  config?: HatGameConfig;
  clueSubmissions: ClueSubmissionMap;
  rng?: () => number;
}): HatGameSession => {
  const settings: HatGameSettings = {
    teamCount: teams.length,
    turnDurationSeconds: config.turnDurationSeconds,
    cluesPerPlayer: config.cluesPerPlayer,
    skipsPerTurn: config.skipsPerTurn
  };
  const nextTeams = teams.map((team) => ({ ...team, score: 0 }));
  const teamOrder = nextTeams.map((team) => team.id);

  return {
    players: sortPlayersBySeat(players),
    teams: nextTeams,
    settings,
    stage: 'ready',
    roundNumber: 1,
    phaseNumber: 1,
    teamOrder,
    teamIndex: 0,
    describerIndexes: Object.fromEntries(teamOrder.map((teamId) => [teamId, 0])),
    cluePool: shuffleArray(buildHatGameCluePool(players, clueSubmissions), rng),
    usedCluePoolIndices: [],
    activeTurn: null,
    lastTurnSummary: null,
    bestTurnSummary: null,
    results: null
  };
};

export const applyHatGameAction = (
  session: HatGameSession,
  action: HatGameAction,
  options: {
    rng?: () => number;
    nowMs?: () => number;
    toIso?: (timestamp: number) => string;
    makeTimestamp?: () => string;
    isPast?: (timestamp: string) => boolean;
  } = {}
): HatGameActionResult => {
  const rng = options.rng ?? Math.random;
  const nowMs = options.nowMs ?? Date.now;
  const toIso = options.toIso ?? ((timestamp) => new Date(timestamp).toISOString());
  const makeTimestamp = options.makeTimestamp ?? (() => new Date().toISOString());
  const isPast = options.isPast ?? ((timestamp) => new Date(timestamp).getTime() <= Date.now());

  if (action.type === 'start-turn') {
    if (session.stage !== 'ready') {
      return { error: 'The next turn is already underway' };
    }
    const clueQueue = collectClueQueue(session, rng);
    if (clueQueue.length === 0) {
      return { error: 'No clues are available for this turn right now' };
    }
    const startedAt = nowMs();
    return {
      ...session,
      stage: 'turn',
      activeTurn: syncSkipState(
        {
          startedAt: toIso(startedAt),
          endsAt: toIso(startedAt + session.settings.turnDurationSeconds * 1000),
          durationSeconds: session.settings.turnDurationSeconds,
          clueQueue,
          queueIndex: 0,
          score: 0,
          correctCount: 0,
          skippedCount: 0,
          skipsRemaining: session.settings.skipsPerTurn,
          skippedClues: [],
          currentSkippedCluePoolIndex: null,
          clueHistory: []
        },
        session.settings.skipsPerTurn
      )
    };
  }

  if (action.type === 'end-turn') {
    if (session.stage !== 'turn' || !session.activeTurn) {
      return { error: 'There is no active turn to end' };
    }
    return finishTurn(session);
  }

  if (session.stage !== 'turn' || !session.activeTurn) {
    return { error: 'The turn has not started yet' };
  }

  if (isPast(session.activeTurn.endsAt)) {
    return finishTurn(session);
  }

  const currentClue = session.activeTurn.clueQueue[session.activeTurn.queueIndex] ?? null;
  if (!currentClue) {
    return finishTurn(session);
  }

  const activeTurn: ActiveTurn = {
    ...session.activeTurn,
    clueQueue: [...session.activeTurn.clueQueue],
    skippedClues: [...session.activeTurn.skippedClues],
    clueHistory: [...session.activeTurn.clueHistory]
  };

  if (action.type === 'mark-correct') {
    activeTurn.score += 1;
    activeTurn.correctCount += 1;
    activeTurn.clueHistory.push({
      clue: currentClue.text,
      status: 'correct',
      timestamp: makeTimestamp(),
      poolIndex: currentClue.poolIndex,
      phaseNumber: session.phaseNumber
    });
    if (activeTurn.currentSkippedCluePoolIndex === currentClue.poolIndex) {
      activeTurn.currentSkippedCluePoolIndex = null;
    }
    activeTurn.queueIndex += 1;
    Object.assign(activeTurn, syncSkipState(activeTurn, session.settings.skipsPerTurn));
  }

  if (action.type === 'skip-clue') {
    if (activeTurn.skipsRemaining <= 0) {
      return { error: 'No skips remain this turn' };
    }
    activeTurn.skippedCount += 1;
    activeTurn.skippedClues.push({ poolIndex: currentClue.poolIndex, text: currentClue.text });
    activeTurn.currentSkippedCluePoolIndex = null;
    activeTurn.clueHistory.push({
      clue: currentClue.text,
      status: 'skipped',
      timestamp: makeTimestamp(),
      poolIndex: currentClue.poolIndex,
      phaseNumber: session.phaseNumber
    });
    const [skippedClue] = activeTurn.clueQueue.splice(activeTurn.queueIndex, 1);
    activeTurn.clueQueue.push(skippedClue);
    Object.assign(activeTurn, syncSkipState(activeTurn, session.settings.skipsPerTurn));
  }

  if (action.type === 'return-skipped-clue') {
    const availableSkippedClues = [...activeTurn.skippedClues];
    if (activeTurn.currentSkippedCluePoolIndex !== null) {
      const activeSkippedClue = activeTurn.clueQueue[activeTurn.queueIndex] ?? null;
      if (activeSkippedClue) {
        availableSkippedClues.unshift({
          poolIndex: activeSkippedClue.poolIndex,
          text: activeSkippedClue.text
        });
      }
    }
    if (availableSkippedClues.length === 0) {
      return { error: 'There is no skipped clue to return to' };
    }
    const targetPoolIndex = action.payload?.poolIndex ?? availableSkippedClues[0]?.poolIndex ?? null;
    const targetSkippedClue = availableSkippedClues.find((clue) => clue.poolIndex === targetPoolIndex);
    if (!targetSkippedClue) {
      return { error: 'The skipped clue is no longer available' };
    }
    activeTurn.skippedClues = activeTurn.skippedClues.filter(
      (clue) => clue.poolIndex !== targetPoolIndex
    );
    if (
      activeTurn.currentSkippedCluePoolIndex !== null &&
      activeTurn.currentSkippedCluePoolIndex !== targetPoolIndex
    ) {
      const activeSkippedClue = activeTurn.clueQueue[activeTurn.queueIndex] ?? null;
      if (activeSkippedClue) {
        activeTurn.skippedClues.push({
          poolIndex: activeSkippedClue.poolIndex,
          text: activeSkippedClue.text
        });
      }
    }
    const skippedIndex = activeTurn.clueQueue.findIndex((clue) => clue.poolIndex === targetPoolIndex);
    if (skippedIndex === -1) {
      return { error: 'The skipped clue is no longer available' };
    }
    if (skippedIndex !== activeTurn.queueIndex) {
      const [skippedClue] = activeTurn.clueQueue.splice(skippedIndex, 1);
      activeTurn.clueQueue.splice(activeTurn.queueIndex, 0, skippedClue);
    }
    activeTurn.currentSkippedCluePoolIndex = targetPoolIndex;
    Object.assign(activeTurn, syncSkipState(activeTurn, session.settings.skipsPerTurn));
  }

  if (!activeTurn.clueQueue[activeTurn.queueIndex]) {
    if (session.phaseNumber < 3) {
      return advancePhaseWithinTurn({ ...session, activeTurn }, activeTurn, rng);
    }
    return finishTurn({ ...session, activeTurn });
  }

  return {
    ...session,
    activeTurn
  };
};
