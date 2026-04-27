import { GAME_DEFAULTS } from '../../config/gameDefaults';
import namePacks from '../../data/namePacks.json';
import type { Player, Team } from './types';

type NamePack = {
  teamName: string;
  playerNames: string[];
};

const fallbackNames = [
  'Alex',
  'Sam',
  'Jordan',
  'Casey',
  'Riley',
  'Morgan',
  'Jamie',
  'Taylor',
  'Cameron',
  'Quinn',
  'Avery',
  'Rowan'
];

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(value)));

export const getHatGameSetupError = ({
  playerCount,
  teamCount,
  teams,
  players
}: {
  playerCount: number;
  teamCount: number;
  teams?: Team[];
  players?: Player[];
}) => {
  if (playerCount < GAME_DEFAULTS.minPlayers || playerCount > GAME_DEFAULTS.maxPlayers) {
    return `Choose ${GAME_DEFAULTS.minPlayers}-${GAME_DEFAULTS.maxPlayers} players.`;
  }
  if (teamCount < GAME_DEFAULTS.minTeams || teamCount > GAME_DEFAULTS.maxTeams) {
    return `Choose ${GAME_DEFAULTS.minTeams}-${GAME_DEFAULTS.maxTeams} teams.`;
  }
  if (playerCount < teamCount * 2) {
    return 'Each team needs at least 2 players.';
  }
  if (teams && players) {
    for (const team of teams) {
      if (players.filter((player) => player.teamId === team.id).length < 2) {
        return `${team.name} needs at least 2 players.`;
      }
    }
  }
  return null;
};

const shuffledPacks = () =>
  [...(namePacks as NamePack[])]
    .map((pack) => ({ pack, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ pack }) => pack);

export const buildDefaultSetup = (playerCount: number, teamCount: number) => {
  const safeTeamCount = clamp(teamCount, GAME_DEFAULTS.minTeams, GAME_DEFAULTS.maxTeams);
  const safePlayerCount = clamp(playerCount, GAME_DEFAULTS.minPlayers, GAME_DEFAULTS.maxPlayers);
  const packs = shuffledPacks();
  const teams: Team[] = Array.from({ length: safeTeamCount }, (_, index) => ({
    id: `team-${String.fromCharCode(97 + index)}`,
    name: packs[index]?.teamName ?? `Team ${index + 1}`,
    score: 0
  }));
  const players: Player[] = Array.from({ length: safePlayerCount }, (_, index) => {
    const teamIndex = index % safeTeamCount;
    const playerNumberWithinTeam = Math.floor(index / safeTeamCount);
    const packName = packs[teamIndex]?.playerNames[playerNumberWithinTeam];
    return {
      id: `player-${index + 1}`,
      seat: index,
      name: packName ?? fallbackNames[index % fallbackNames.length] ?? `Player ${index + 1}`,
      teamId: teams[teamIndex].id
    };
  });

  return { teams, players };
};

export const rebalancePlayers = (players: Player[], teams: Team[]) =>
  players.map((player, index) => ({
    ...player,
    seat: index,
    teamId: teams[index % teams.length]?.id ?? player.teamId
  }));

