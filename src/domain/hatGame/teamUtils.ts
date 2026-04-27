import type { LeaderboardEntry, Player, Team } from './types';

const TEAM_LABELS = ['A', 'B', 'C', 'D'];

export const normalizeText = (value: unknown, fallback = '') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export const sortPlayersBySeat = (players: Player[]) =>
  [...players].sort((left, right) => left.seat - right.seat);

export const shuffleArray = <T>(items: T[], rng = Math.random) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

export const buildTeams = (teamCount: number, names: string[] = []): Team[] =>
  TEAM_LABELS.slice(0, Math.min(Math.max(teamCount, 2), 4)).map((label, index) => ({
    id: `team-${String.fromCharCode(97 + index)}`,
    name: normalizeText(names[index], `Team ${label}`),
    score: 0
  }));

export const getTeamPlayers = (players: Player[], teamId: string | null) =>
  sortPlayersBySeat(players.filter((player) => player.teamId === teamId));

export const getTimedTeamContext = ({
  players,
  teams,
  teamOrder,
  teamIndex,
  describerIndexes
}: {
  players: Player[];
  teams: Team[];
  teamOrder: string[];
  teamIndex: number;
  describerIndexes: Record<string, number>;
}) => {
  const activeTeamId = teamOrder[teamIndex] ?? null;
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;
  const activeTeamPlayers = getTeamPlayers(players, activeTeamId);
  const describerIndex =
    activeTeamPlayers.length === 0
      ? 0
      : (describerIndexes[activeTeamId ?? ''] ?? 0) % activeTeamPlayers.length;
  const activeDescriber = activeTeamPlayers[describerIndex] ?? null;

  return {
    activeTeamId,
    activeTeam,
    activeTeamPlayers,
    activeDescriberId: activeDescriber?.id ?? null,
    activeDescriberName: activeDescriber?.name ?? 'Waiting'
  };
};

export const buildLeaderboard = (teams: Team[]): LeaderboardEntry[] =>
  [...teams]
    .sort((left, right) => right.score - left.score)
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      score: team.score
    }));

