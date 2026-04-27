export type Player = {
  id: string;
  seat: number;
  name: string;
  teamId: string;
};

export type Team = {
  id: string;
  name: string;
  score: number;
};

export type ClueSubmissionMap = Record<string, { clues: string[] }>;

export type HatGameSettings = {
  teamCount: number;
  turnDurationSeconds: number;
  cluesPerPlayer: number;
  skipsPerTurn: number;
};

export type CluePoolEntry = {
  text: string;
  submittedBy: string;
  submittedByName: string;
};

export type QueuedClue = CluePoolEntry & {
  poolIndex: number;
};

export type SkippedClue = {
  poolIndex: number;
  text: string;
};

export type ClueHistoryEntry = {
  clue: string;
  status: 'correct' | 'skipped';
  timestamp: string;
  poolIndex: number;
};

export type ActiveTurn = {
  startedAt: string;
  endsAt: string;
  durationSeconds: number;
  clueQueue: QueuedClue[];
  queueIndex: number;
  score: number;
  correctCount: number;
  skippedCount: number;
  skipsRemaining: number;
  skippedClues: SkippedClue[];
  currentSkippedCluePoolIndex: number | null;
  clueHistory: ClueHistoryEntry[];
};

export type TurnSummary = {
  teamId: string;
  teamName: string;
  describerId: string | null;
  describerName: string;
  scoreDelta: number;
  correctCount: number;
  skippedCount: number;
  clues: ClueHistoryEntry[];
  phaseCompleted: boolean;
  completedPhaseNumber: number | null;
  nextPhaseNumber: number | null;
  nextPhaseName: string | null;
};

export type BestTurnSummary = {
  teamId: string;
  teamName: string;
  describerId: string | null;
  describerName: string;
  score: number;
  phaseNumber: number;
  phaseName: string;
};

export type LeaderboardEntry = {
  teamId: string;
  teamName: string;
  score: number;
};

export type HatGameResults = {
  leaderboard: LeaderboardEntry[];
  winnerTeamIds: string[];
  isTie: boolean;
  totalClues: number;
  bestTurn: BestTurnSummary | null;
};

export type HatGameSession = {
  players: Player[];
  teams: Team[];
  settings: HatGameSettings;
  stage: 'ready' | 'turn' | 'results';
  roundNumber: number;
  phaseNumber: number;
  teamOrder: string[];
  teamIndex: number;
  describerIndexes: Record<string, number>;
  cluePool: CluePoolEntry[];
  usedCluePoolIndices: number[];
  activeTurn: ActiveTurn | null;
  lastTurnSummary: TurnSummary | null;
  bestTurnSummary: BestTurnSummary | null;
  results: HatGameResults | null;
};

export type HatGameAction =
  | { type: 'start-turn' }
  | { type: 'end-turn' }
  | { type: 'mark-correct' }
  | { type: 'skip-clue' }
  | { type: 'return-skipped-clue'; payload?: { poolIndex?: number } };

export type HatGameActionResult = HatGameSession | { error: string };

