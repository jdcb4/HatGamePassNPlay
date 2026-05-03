import { StatusBar } from 'expo-status-bar';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import packageJson from './package.json';
import { GAME_DEFAULTS } from './src/config/gameDefaults';
import clueSuggestions from './src/data/clueSuggestions.json';
import {
  applyHatGameAction,
  createHatGameSession,
  getHatGameContext,
  getHatGamePhaseMeta
} from './src/domain/hatGame/engine';
import { buildDefaultSetup, getHatGameSetupError } from './src/domain/hatGame/setup';
import { formatCountdown, getCountdownSeconds } from './src/domain/hatGame/time';
import type { ClueSubmissionMap, HatGameAction, HatGameSession, Player, Team } from './src/domain/hatGame/types';
import { playSoundCue } from './src/audio/soundCues';
import { clearSavedState, loadSavedState, saveState } from './src/services/storage';

type AppStep = 'landing' | 'counts' | 'team' | 'review' | 'clues' | 'game';

type AppSnapshot = {
  step: AppStep;
  teamEditIndex: number;
  playerCount: number;
  teamCount: number;
  teams: Team[];
  players: Player[];
  clueSubmissions: ClueSubmissionMap;
  clueEntryIndex: number;
  clueEntryRevealed: boolean;
  handoffRevealed: boolean;
  session: HatGameSession | null;
};

type StoragePayload = {
  schemaVersion: 1;
  lastSavedAt: string;
  snapshot: AppSnapshot;
};

type ScreenModel = {
  content: React.ReactNode;
  actions?: React.ReactNode;
};

const ACTION_LOCK_MS = 500;
const ActionLockContext = createContext(false);
const APP_VERSION = packageJson.version;

const createEmptyClues = () => Array.from({ length: GAME_DEFAULTS.cluesPerPlayer }, () => '');

const createInitialSnapshot = (step: AppStep = 'counts'): AppSnapshot => {
  const { teams, players } = buildDefaultSetup(4, 2);
  return {
    step,
    teamEditIndex: 0,
    playerCount: 4,
    teamCount: 2,
    teams,
    players,
    clueSubmissions: Object.fromEntries(players.map((player) => [player.id, { clues: createEmptyClues() }])),
    clueEntryIndex: 0,
    clueEntryRevealed: false,
    handoffRevealed: false,
    session: null
  };
};

const syncClueSubmissions = (players: Player[], current: ClueSubmissionMap): ClueSubmissionMap =>
  Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        clues: Array.from(
          { length: GAME_DEFAULTS.cluesPerPlayer },
          (_, index) => current[player.id]?.clues[index] ?? ''
        )
      }
    ])
  );

const isError = (value: unknown): value is { error: string } =>
  Boolean(value && typeof value === 'object' && 'error' in value);

const isStoragePayload = (value: unknown): value is StoragePayload =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'schemaVersion' in value &&
      'snapshot' in value &&
      'lastSavedAt' in value
  );

const chooseSuggestion = (used: string[]) => {
  const remaining = (clueSuggestions as string[]).filter((suggestion) => !used.includes(suggestion));
  const source = remaining.length > 0 ? remaining : (clueSuggestions as string[]);
  return source[Math.floor(Math.random() * source.length)] ?? '';
};

const formatSavedAt = (value?: string) => {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => createInitialSnapshot('landing'));
  const [savedRecord, setSavedRecord] = useState<StoragePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [footerActionsLocked, setFooterActionsLocked] = useState(false);
  const [showInfoToast, setShowInfoToast] = useState(false);
  const warningCueTurnRef = useRef<string | null>(null);
  const turnEndCueTurnRef = useRef<string | null>(null);

  useEffect(() => {
    loadSavedState<StoragePayload | AppSnapshot>()
      .then((saved) => {
        if (!saved) {
          return;
        }
        const record = isStoragePayload(saved)
          ? saved
          : {
              schemaVersion: 1 as const,
              lastSavedAt: new Date().toISOString(),
              snapshot: saved
            };
        setSavedRecord(record);
      })
      .finally(() => setLoaded(true));
  }, []);

  const persistSnapshot = async (nextSnapshot: AppSnapshot) => {
    if (nextSnapshot.step === 'landing') {
      return null;
    }
    const record: StoragePayload = {
      schemaVersion: 1,
      lastSavedAt: new Date().toISOString(),
      snapshot: nextSnapshot
    };
    setSavedRecord(record);
    await saveState(record);
    return record;
  };

  useEffect(() => {
    if (loaded && snapshot.step !== 'landing') {
      persistSnapshot(snapshot).catch(() => undefined);
    }
  }, [loaded, snapshot]);

  useEffect(() => {
    if (snapshot.step !== 'game' || snapshot.session?.stage !== 'turn' || !snapshot.session.activeTurn?.endsAt) {
      setSecondsRemaining(0);
      warningCueTurnRef.current = null;
      return undefined;
    }

    const turnCueKey = snapshot.session.activeTurn.startedAt;
    const tick = () => {
      const remaining = getCountdownSeconds(snapshot.session?.activeTurn?.endsAt);
      setSecondsRemaining(remaining);
      if (remaining <= 10 && remaining > 0 && warningCueTurnRef.current !== turnCueKey) {
        warningCueTurnRef.current = turnCueKey;
        playSoundCue('ten-second-warning');
      }
      if (remaining <= 0) {
        dispatchGameAction({ type: 'end-turn' });
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [snapshot.step, snapshot.session?.activeTurn?.endsAt, snapshot.session?.stage]);

  const activeTeam = useMemo(() => {
    if (snapshot.step === 'team') {
      return snapshot.teams[snapshot.teamEditIndex] ?? null;
    }
    return null;
  }, [snapshot.step, snapshot.teamEditIndex, snapshot.teams]);

  const activeTeamPlayers = useMemo(
    () => (activeTeam ? snapshot.players.filter((player) => player.teamId === activeTeam.id) : []),
    [activeTeam, snapshot.players]
  );

  const actionLockKey = [
    loaded ? 'loaded' : 'loading',
    snapshot.step,
    snapshot.teamEditIndex,
    snapshot.clueEntryIndex,
    snapshot.clueEntryRevealed ? 'clue-open' : 'clue-closed',
    snapshot.handoffRevealed ? 'handoff-open' : 'handoff-closed',
    snapshot.session?.stage ?? 'no-session',
    snapshot.session?.phaseNumber ?? 'no-phase',
    snapshot.session?.activeTurn?.startedAt ?? 'no-turn',
    confirmNewGame ? 'confirm-new' : 'normal'
  ].join(':');

  useEffect(() => {
    setFooterActionsLocked(true);
    const timeout = setTimeout(() => setFooterActionsLocked(false), ACTION_LOCK_MS);
    return () => clearTimeout(timeout);
  }, [actionLockKey]);

  useEffect(() => {
    if (!showInfoToast) {
      return undefined;
    }
    const timeout = setTimeout(() => setShowInfoToast(false), 4200);
    return () => clearTimeout(timeout);
  }, [showInfoToast]);

  const startNewGame = async () => {
    setConfirmNewGame(false);
    setSavedRecord(null);
    setError('');
    await clearSavedState();
    setSnapshot(createInitialSnapshot('counts'));
  };

  const resumeSavedGame = () => {
    if (!savedRecord) {
      return;
    }
    setConfirmNewGame(false);
    setError('');
    setSnapshot(savedRecord.snapshot);
  };

  const exitToLanding = () => {
    setConfirmNewGame(false);
    setError('');
    void persistSnapshot(snapshot);
    setSnapshot((current) => ({ ...current, step: 'landing' }));
  };

  const regenerateSetup = (playerCount: number, teamCount: number) => {
    const setupError = getHatGameSetupError({ playerCount, teamCount });
    if (setupError) {
      setError(setupError);
      return;
    }
    const { teams, players } = buildDefaultSetup(playerCount, teamCount);
    setSnapshot((current) => ({
      ...current,
      step: 'team',
      teamEditIndex: 0,
      playerCount,
      teamCount,
      teams,
      players,
      clueSubmissions: syncClueSubmissions(players, {}),
      session: null
    }));
    setError('');
  };

  const updateTeamName = (teamId: string, name: string) => {
    setSnapshot((current) => ({
      ...current,
      teams: current.teams.map((team) =>
        team.id === teamId ? { ...team, name: name.slice(0, GAME_DEFAULTS.maxNameLength) } : team
      )
    }));
  };

  const updatePlayerName = (playerId: string, name: string) => {
    setSnapshot((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, name: name.slice(0, GAME_DEFAULTS.maxNameLength) } : player
      )
    }));
  };

  const updateClue = (playerId: string, clueIndex: number, value: string) => {
    setSnapshot((current) => ({
      ...current,
      clueSubmissions: {
        ...current.clueSubmissions,
        [playerId]: {
          clues: (current.clueSubmissions[playerId]?.clues ?? createEmptyClues()).map((clue, index) =>
            index === clueIndex ? value.slice(0, GAME_DEFAULTS.maxClueLength) : clue
          )
        }
      }
    }));
  };

  const fillSuggestion = (playerId: string, clueIndex: number) => {
    const used = Object.values(snapshot.clueSubmissions).flatMap((entry) =>
      entry.clues.map((clue) => clue.trim()).filter(Boolean)
    );
    updateClue(playerId, clueIndex, chooseSuggestion(used));
  };

  const confirmTeamStep = () => {
    if (!activeTeam) {
      return;
    }
    if (!activeTeam.name.trim() || activeTeamPlayers.some((player) => !player.name.trim())) {
      setError('Name the team and every player before continuing.');
      return;
    }
    setError('');
    setSnapshot((current) => ({
      ...current,
      teamEditIndex: current.teamEditIndex + 1,
      step: current.teamEditIndex >= current.teams.length - 1 ? 'review' : 'team'
    }));
  };

  const startClueEntry = () => {
    const setupError = getHatGameSetupError({
      playerCount: snapshot.playerCount,
      teamCount: snapshot.teamCount,
      teams: snapshot.teams,
      players: snapshot.players
    });
    if (setupError) {
      setError(setupError);
      return;
    }
    setSnapshot((current) => ({
      ...current,
      step: 'clues',
      clueEntryIndex: 0,
      clueEntryRevealed: false,
      clueSubmissions: syncClueSubmissions(current.players, current.clueSubmissions)
    }));
    setError('');
  };

  const confirmClues = () => {
    const player = snapshot.players[snapshot.clueEntryIndex];
    if (!player) {
      return;
    }
    const clues = snapshot.clueSubmissions[player.id]?.clues ?? createEmptyClues();
    if (clues.some((clue) => clue.trim().length === 0)) {
      setError(`Fill in every famous figure before handing the phone on from ${player.name}.`);
      return;
    }
    if (snapshot.clueEntryIndex >= snapshot.players.length - 1) {
      const session = createHatGameSession({
        players: snapshot.players,
        teams: snapshot.teams,
        config: GAME_DEFAULTS,
        clueSubmissions: snapshot.clueSubmissions
      });
      setSnapshot((current) => ({ ...current, step: 'game', session, handoffRevealed: false }));
    } else {
      setSnapshot((current) => ({
        ...current,
        clueEntryIndex: current.clueEntryIndex + 1,
        clueEntryRevealed: false
      }));
    }
    setError('');
  };

  const dispatchGameAction = (action: HatGameAction) => {
    const previousSession = snapshot.session;
    if (!previousSession) {
      return;
    }
    const result = applyHatGameAction(previousSession, action);
    if (isError(result)) {
      setError(result.error);
      return;
    }

    if (action.type === 'start-turn' && previousSession.stage === 'ready' && result.stage === 'turn') {
      playSoundCue('turn-start');
    }
    if (action.type === 'mark-correct') {
      playSoundCue('correct');
    }
    if (action.type === 'skip-clue') {
      playSoundCue('skip');
    }
    if (previousSession.stage === 'turn' && result.stage !== 'turn') {
      const turnCueKey = previousSession.activeTurn?.startedAt ?? previousSession.activeTurn?.endsAt ?? '';
      if (turnEndCueTurnRef.current !== turnCueKey) {
        turnEndCueTurnRef.current = turnCueKey;
        playSoundCue('turn-end');
      }
    }
    if (result.phaseNumber !== previousSession.phaseNumber) {
      if (result.phaseNumber === 2) {
        playSoundCue('phase-one-word');
      }
      if (result.phaseNumber === 3) {
        playSoundCue('phase-charades');
      }
    }

    setError('');
    setSnapshot((current) => ({
      ...current,
      session: result,
      handoffRevealed: result.stage === 'ready' ? false : current.handoffRevealed
    }));
  };

  const playAgain = () => {
    const session = createHatGameSession({
      players: snapshot.players,
      teams: snapshot.teams,
      config: GAME_DEFAULTS,
      clueSubmissions: snapshot.clueSubmissions
    });
    setSnapshot((current) => ({ ...current, step: 'game', session, handoffRevealed: false }));
  };

  const renderLanding = (): ScreenModel => ({
    content: (
      <Panel
        title="Hat Game"
        subtitle="A pass-and-play Celebrity-style party game. Add famous figures, split into teams, then race through Describe, One Word, and Charades with the same figure pool."
      >
        {savedRecord ? (
          <Text style={styles.notice}>Saved game found from {formatSavedAt(savedRecord.lastSavedAt)}.</Text>
        ) : (
          <Text style={styles.notice}>No accounts, no server, no setup clutter. One phone, a few friends, and a hat full of names.</Text>
        )}
        {confirmNewGame ? (
          <Text style={styles.warning}>Start a new game? This will discard the saved game on this device.</Text>
        ) : null}
      </Panel>
    ),
    actions: confirmNewGame ? (
      <>
        <SecondaryButton label="Cancel" onPress={() => setConfirmNewGame(false)} />
        <PrimaryButton label="Discard and start" onPress={() => void startNewGame()} />
      </>
    ) : savedRecord ? (
      <>
        <SecondaryButton label="New game" onPress={() => setConfirmNewGame(true)} />
        <PrimaryButton label="Resume game" onPress={resumeSavedGame} />
      </>
    ) : (
      <PrimaryButton label="Start game" onPress={() => void startNewGame()} />
    )
  });

  const renderCounts = (): ScreenModel => ({
    content: (
      <Panel title="Set up Hat Game" subtitle="Choose the only two game options players need to decide.">
        <Counter
          label="Players"
          value={snapshot.playerCount}
          min={GAME_DEFAULTS.minPlayers}
          max={GAME_DEFAULTS.maxPlayers}
          onChange={(value) => setSnapshot((current) => ({ ...current, playerCount: value }))}
        />
        <Counter
          label="Teams"
          value={snapshot.teamCount}
          min={GAME_DEFAULTS.minTeams}
          max={GAME_DEFAULTS.maxTeams}
          onChange={(value) => setSnapshot((current) => ({ ...current, teamCount: value }))}
        />
      </Panel>
    ),
    actions: <PrimaryButton label="Build teams" onPress={() => regenerateSetup(snapshot.playerCount, snapshot.teamCount)} />
  });

  const renderTeamEditor = (): ScreenModel => {
    if (!activeTeam) {
      return { content: null };
    }
    return {
      content: (
        <Panel title={`Set up team ${snapshot.teamEditIndex + 1}`} subtitle="Defaults are ready to use, but every name is editable.">
          <Label>Team name</Label>
          <TextInput
            style={styles.input}
            value={activeTeam.name}
            maxLength={GAME_DEFAULTS.maxNameLength}
            onChangeText={(text) => updateTeamName(activeTeam.id, text)}
          />
          <View style={styles.stack}>
            {activeTeamPlayers.map((player) => (
              <View key={player.id}>
                <Label>{`Player ${player.seat + 1}`}</Label>
                <TextInput
                  style={styles.input}
                  value={player.name}
                  maxLength={GAME_DEFAULTS.maxNameLength}
                  onChangeText={(text) => updatePlayerName(player.id, text)}
                />
              </View>
            ))}
          </View>
        </Panel>
      ),
      actions: (
        <>
          <SecondaryButton
            label="Back"
            onPress={() =>
              setSnapshot((current) => ({
                ...current,
                step: current.teamEditIndex === 0 ? 'counts' : 'team',
                teamEditIndex: Math.max(0, current.teamEditIndex - 1)
              }))
            }
          />
          <PrimaryButton
            label={snapshot.teamEditIndex >= snapshot.teams.length - 1 ? 'Review teams' : 'Next team'}
            onPress={confirmTeamStep}
          />
        </>
      )
    };
  };

  const renderReview = (): ScreenModel => ({
    content: (
      <Panel title="Review teams" subtitle="Pass the phone around for private famous figure entry after this.">
        {snapshot.teams.map((team) => (
          <View key={team.id} style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>{team.name}</Text>
            <Text style={styles.muted}>
              {snapshot.players
                .filter((player) => player.teamId === team.id)
                .map((player) => player.name)
                .join(', ')}
            </Text>
          </View>
        ))}
      </Panel>
    ),
    actions: (
      <>
        <SecondaryButton
          label="Edit teams"
          onPress={() => setSnapshot((current) => ({ ...current, step: 'team', teamEditIndex: 0 }))}
        />
        <PrimaryButton label="Start famous figure entry" onPress={startClueEntry} />
      </>
    )
  });

  const renderClueEntry = (): ScreenModel => {
    const player = snapshot.players[snapshot.clueEntryIndex];
    if (!player) {
      return { content: null };
    }
    const clues = snapshot.clueSubmissions[player.id]?.clues ?? createEmptyClues();
    if (!snapshot.clueEntryRevealed) {
      return {
        content: (
          <Panel title={`Pass to ${player.name}`} subtitle={`Figure pack ${snapshot.clueEntryIndex + 1} of ${snapshot.players.length}`}>
            <Text style={styles.notice}>Only {player.name} should look at the screen for this step.</Text>
          </Panel>
        ),
        actions: (
          <PrimaryButton
            label={`${player.name} ready`}
            onPress={() => setSnapshot((current) => ({ ...current, clueEntryRevealed: true }))}
          />
        )
      };
    }
    return {
      content: (
        <Panel title={`${player.name}'s famous figures`} subtitle="Enter people or characters most players could know.">
          {clues.map((clue, index) => (
            <View key={`${player.id}-clue-${index}`} style={styles.clueRow}>
              <Text style={styles.clueNumber}>{index + 1}.</Text>
              <View style={styles.clueInputWrap}>
                <TextInput
                  style={styles.input}
                  value={clue}
                  maxLength={GAME_DEFAULTS.maxClueLength}
                  placeholder="Enter a famous figure"
                  onChangeText={(text) => updateClue(player.id, index, text)}
                />
              </View>
              <IconButton label="Lightning suggestion" icon="⚡" onPress={() => fillSuggestion(player.id, index)} />
            </View>
          ))}
        </Panel>
      ),
      actions: (
        <PrimaryButton
          label={snapshot.clueEntryIndex >= snapshot.players.length - 1 ? 'Confirm and start game' : 'Confirm and pass on'}
          onPress={confirmClues}
        />
      )
    };
  };

  const renderReady = (session: HatGameSession): ScreenModel => {
    const context = getHatGameContext(session);
    const phase = getHatGamePhaseMeta(session.phaseNumber);
    return {
      content: (
        <Panel title={`${context.activeTeam?.name ?? 'Next team'} up next`} subtitle={`Phase ${session.phaseNumber}: ${phase.name}`}>
          <Text style={styles.notice}>{phase.instruction}</Text>
          {session.lastTurnSummary?.phaseCompleted ? (
            <Text style={styles.notice}>
              Phase {session.lastTurnSummary.completedPhaseNumber} complete
              {session.lastTurnSummary.nextPhaseName ? `. Next: ${session.lastTurnSummary.nextPhaseName}.` : '.'}
            </Text>
          ) : null}
          <Text style={styles.notice}>
            {snapshot.handoffRevealed
              ? `${context.activeDescriberName} has the phone.`
              : `Give the phone to ${context.activeDescriberName}.`}
          </Text>
          <Scoreboard session={session} />
        </Panel>
      ),
      actions: snapshot.handoffRevealed ? (
        <PrimaryButton label="Start turn" onPress={() => dispatchGameAction({ type: 'start-turn' })} />
      ) : (
        <PrimaryButton
          label={`${context.activeDescriberName} ready`}
          onPress={() => setSnapshot((current) => ({ ...current, handoffRevealed: true }))}
        />
      )
    };
  };

  const renderTurn = (session: HatGameSession): ScreenModel => {
    const context = getHatGameContext(session);
    const phase = getHatGamePhaseMeta(session.phaseNumber);
    const activeTurn = session.activeTurn;
    const currentClue = activeTurn?.clueQueue[activeTurn.queueIndex]?.text ?? 'Loading';
    return {
      content: (
        <Panel title={`${context.activeTeam?.name ?? 'Team'} guessing`} subtitle={`${context.activeDescriberName} is presenting`}>
          <View style={styles.clueCard}>
            <Text style={styles.clueText}>{currentClue}</Text>
          </View>
          <View style={styles.metrics}>
            <Metric label="Time" value={formatCountdown(secondsRemaining)} />
            <Metric label="Score" value={String(activeTurn?.score ?? 0)} />
            <Metric label="Skips" value={String(activeTurn?.skipsRemaining ?? 0)} />
          </View>
          <Text style={styles.notice}>
            Phase {session.phaseNumber}: {phase.name}. {phase.instruction}
          </Text>
          {activeTurn?.skippedClues.length ? (
            <View style={styles.skippedBox}>
              <Text style={styles.sectionTitle}>Skipped famous figures</Text>
              {activeTurn.skippedClues.map((clue) => (
                <IconTextButton
                  key={clue.poolIndex}
                  icon="↶"
                  label={clue.text}
                  onPress={() =>
                    dispatchGameAction({ type: 'return-skipped-clue', payload: { poolIndex: clue.poolIndex } })
                  }
                />
              ))}
            </View>
          ) : null}
        </Panel>
      ),
      actions: (
        <>
          <PrimaryButton
            label="Skip"
            disabled={(activeTurn?.skipsRemaining ?? 0) <= 0}
            onPress={() => dispatchGameAction({ type: 'skip-clue' })}
          />
          <PrimaryButton label="Correct" onPress={() => dispatchGameAction({ type: 'mark-correct' })} />
        </>
      )
    };
  };

  const renderResults = (session: HatGameSession): ScreenModel => ({
    content: (
      <Panel title={session.results?.isTie ? 'Tie game' : 'Final leaderboard'} subtitle="All three phases are complete.">
        {session.results?.bestTurn ? (
          <Text style={styles.notice}>
            Best turn: {session.results.bestTurn.describerName} scored {session.results.bestTurn.score} for{' '}
            {session.results.bestTurn.teamName}.
          </Text>
        ) : null}
        {session.results?.leaderboard.map((entry, index) => (
          <View key={entry.teamId} style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>
              {index + 1}. {entry.teamName}
            </Text>
            <Text style={styles.muted}>{entry.score} pts</Text>
          </View>
        ))}
      </Panel>
    ),
    actions: (
      <>
        <SecondaryButton label="Back to landing" onPress={exitToLanding} />
        <PrimaryButton label="Play again" onPress={playAgain} />
      </>
    )
  });

  const renderGame = (): ScreenModel => {
    const session = snapshot.session;
    if (!session) {
      return renderReview();
    }
    if (session.stage === 'results') {
      return renderResults(session);
    }
    if (session.stage === 'turn') {
      return renderTurn(session);
    }
    return renderReady(session);
  };

  const getScreen = (): ScreenModel => {
    if (!loaded) {
      return { content: <Panel title="Hat Game" subtitle="Loading saved game..." /> };
    }
    if (snapshot.step === 'landing') {
      return renderLanding();
    }
    if (snapshot.step === 'counts') {
      return renderCounts();
    }
    if (snapshot.step === 'team') {
      return renderTeamEditor();
    }
    if (snapshot.step === 'review') {
      return renderReview();
    }
    if (snapshot.step === 'clues') {
      return renderClueEntry();
    }
    return renderGame();
  };

  const screen = getScreen();
  const showExit = loaded && snapshot.step !== 'landing';
  const showInfo = loaded && snapshot.step === 'landing';
  const showEndTurn = loaded && snapshot.step === 'game' && snapshot.session?.stage === 'turn';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoiding}
      >
        <View style={styles.shell}>
          <View style={styles.header}>
            <Text style={styles.appTitle}>Hat Game</Text>
            {showInfo || showEndTurn || showExit ? (
              <View style={styles.headerActions}>
                {showEndTurn ? (
                  <Pressable style={styles.headerButton} onPress={() => dispatchGameAction({ type: 'end-turn' })}>
                    <Text style={styles.headerButtonText}>End turn</Text>
                  </Pressable>
                ) : null}
                {showExit ? (
                  <Pressable style={styles.headerButton} onPress={exitToLanding}>
                    <Text style={styles.headerButtonText}>Exit</Text>
                  </Pressable>
                ) : null}
                {showInfo ? <IconButton label="App information" icon="i" onPress={() => setShowInfoToast(true)} /> : null}
              </View>
            ) : null}
          </View>
          {showInfoToast ? (
            <View style={styles.toast}>
              <Text style={styles.toastTitle}>Hat Game</Text>
              <Text style={styles.toastText}>By jdcb4. Version {APP_VERSION}.</Text>
            </View>
          ) : null}
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            keyboardShouldPersistTaps="handled"
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {screen.content}
          </ScrollView>
          {screen.actions ? (
            <ActionLockContext.Provider value={footerActionsLocked}>
              <View style={styles.footer}>{screen.actions}</View>
            </ActionLockContext.Provider>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Counter({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterLabel}>{label}</Text>
      <View style={styles.counterControls}>
        <SecondaryButton label="-" disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Text style={styles.counterValue}>{value}</Text>
        <SecondaryButton label="+" disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Scoreboard({ session }: { session: HatGameSession }) {
  return (
    <View style={styles.scoreboard}>
      <Text style={styles.sectionTitle}>Scoreboard</Text>
      {session.teams.map((team) => (
        <View key={team.id} style={styles.scoreRow}>
          <Text style={styles.scoreName}>{team.name}</Text>
          <Text style={styles.scoreValue}>{team.score} pts</Text>
        </View>
      ))}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: ButtonProps) {
  const footerActionsLocked = useContext(ActionLockContext);
  const isDisabled = disabled || footerActionsLocked;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[styles.button, styles.primaryButton, isDisabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, disabled = false }: ButtonProps) {
  const footerActionsLocked = useContext(ActionLockContext);
  const isDisabled = disabled || footerActionsLocked;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[styles.button, styles.secondaryButton, isDisabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ label, icon, onPress, disabled = false }: IconButtonProps) {
  const footerActionsLocked = useContext(ActionLockContext);
  const isDisabled = disabled || footerActionsLocked;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={isDisabled}
      style={[styles.iconButton, isDisabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Text style={styles.iconButtonText}>{icon}</Text>
    </Pressable>
  );
}

function IconTextButton({ icon, label, onPress, disabled = false }: IconTextButtonProps) {
  const footerActionsLocked = useContext(ActionLockContext);
  const isDisabled = disabled || footerActionsLocked;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[styles.iconTextButton, isDisabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Text style={styles.iconTextIcon}>{icon}</Text>
      <Text style={styles.iconTextLabel}>{label}</Text>
    </Pressable>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type IconButtonProps = ButtonProps & {
  icon: string;
};

type IconTextButtonProps = ButtonProps & {
  icon: string;
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f3f0e8'
  },
  keyboardAvoiding: {
    flex: 1
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center'
  },
  container: {
    padding: 18,
    paddingBottom: 28
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12
  },
  appTitle: {
    color: '#1f2933',
    flexShrink: 1,
    fontSize: 32,
    fontWeight: '800'
  },
  headerButton: {
    borderColor: '#b8afa0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  headerButtonText: {
    color: '#4a4034',
    fontWeight: '700'
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  toast: {
    alignSelf: 'flex-end',
    backgroundColor: '#fffaf2',
    borderColor: '#d4c5b0',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 18,
    marginBottom: 10,
    maxWidth: 280,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12
  },
  toastTitle: {
    color: '#1f2933',
    fontSize: 16,
    fontWeight: '800'
  },
  toastText: {
    color: '#695f51',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3
  },
  footer: {
    backgroundColor: '#fffaf2',
    borderTopColor: '#ded2bf',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12
  },
  panel: {
    backgroundColor: '#fffaf2',
    borderColor: '#ded2bf',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10
  },
  title: {
    color: '#1f2933',
    fontSize: 26,
    fontWeight: '800'
  },
  subtitle: {
    color: '#695f51',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6
  },
  stack: {
    gap: 14,
    marginTop: 16
  },
  label: {
    color: '#695f51',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#c8bba8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1f2933',
    fontSize: 17,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  counter: {
    backgroundColor: '#f6efe4',
    borderRadius: 8,
    padding: 14
  },
  counterLabel: {
    color: '#1f2933',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10
  },
  counterControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14
  },
  counterValue: {
    color: '#1f2933',
    fontSize: 28,
    fontWeight: '800',
    minWidth: 42,
    textAlign: 'center'
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    flexGrow: 1,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButton: {
    backgroundColor: '#256d5a'
  },
  secondaryButton: {
    backgroundColor: '#eadfce',
    borderColor: '#d4c5b0',
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButtonText: {
    color: '#2e473d',
    fontSize: 16,
    fontWeight: '800'
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#eadfce',
    borderColor: '#d4c5b0',
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46
  },
  iconButtonText: {
    color: '#2e473d',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24
  },
  iconTextButton: {
    alignItems: 'center',
    backgroundColor: '#eadfce',
    borderColor: '#d4c5b0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-start',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  iconTextIcon: {
    color: '#2e473d',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 22
  },
  iconTextLabel: {
    color: '#2e473d',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800'
  },
  error: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderRadius: 8,
    borderWidth: 1,
    color: '#991b1b',
    fontWeight: '700',
    marginBottom: 12,
    padding: 12
  },
  notice: {
    backgroundColor: '#eef7f2',
    borderColor: '#b7d7ca',
    borderRadius: 8,
    borderWidth: 1,
    color: '#26453a',
    fontSize: 16,
    lineHeight: 22,
    padding: 12
  },
  warning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
    borderRadius: 8,
    borderWidth: 1,
    color: '#9a3412',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    padding: 12
  },
  reviewCard: {
    backgroundColor: '#f6efe4',
    borderRadius: 8,
    padding: 12
  },
  reviewTitle: {
    color: '#1f2933',
    fontSize: 18,
    fontWeight: '800'
  },
  muted: {
    color: '#695f51',
    fontSize: 14,
    lineHeight: 20
  },
  clueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  clueNumber: {
    color: '#695f51',
    fontSize: 17,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'right'
  },
  clueInputWrap: {
    flex: 1
  },
  clueCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d4c5b0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22
  },
  clueText: {
    color: '#1f2933',
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center'
  },
  metrics: {
    flexDirection: 'row',
    gap: 10
  },
  metric: {
    backgroundColor: '#f6efe4',
    borderRadius: 8,
    flex: 1,
    padding: 12
  },
  metricValue: {
    color: '#1f2933',
    fontSize: 24,
    fontWeight: '900'
  },
  skippedBox: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  sectionTitle: {
    color: '#1f2933',
    fontSize: 17,
    fontWeight: '800'
  },
  scoreboard: {
    borderTopColor: '#ded2bf',
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  scoreName: {
    color: '#1f2933',
    fontSize: 16,
    fontWeight: '700'
  },
  scoreValue: {
    color: '#256d5a',
    fontSize: 16,
    fontWeight: '800'
  }
});
