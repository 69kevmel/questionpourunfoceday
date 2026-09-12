export type QuestionType = 'qcm' | 'numeric' | 'free-text';
export type QuestionRound = 'buzzer' | 'simultaneous' | 'final';
export type GamePhase = 'lobby' | 'question' | 'review' | 'tiebreak' | 'game-over';

export interface Question {
  id: number;
  round: QuestionRound;
  type: QuestionType;
  question: string;
  options: string[];
  correct: number;
  numericAnswer?: number;
  acceptedAnswer?: string;
  acceptedAnswers?: string[];
  reserve?: boolean;
}

export interface QuestionBanks {
  buzzer: Question[];
  simultaneous: Question[];
  final: Question[];
}

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface SubmittedAnswer {
  value: string;
  submittedAt: number;
  round: QuestionRound;
  questionIndex: number;
}

export interface Elimination {
  round: 'buzzer' | 'simultaneous';
  eliminatedNames: string[];
  remaining: number;
}

export interface AnswerOutcome {
  value: string;
  correct: boolean;
  points: number;
}

export interface PendingElimination {
  round: 'buzzer' | 'simultaneous';
  candidateIds: string[];
  eliminateCount: number;
  automaticallyEliminatedIds: string[];
}

export interface GameState {
  gameId: string;
  revision: number;
  questionRevision: number;
  suddenDeath: boolean;
  pausedRemainingMs: number | null;
  manualVerdicts: Record<string, boolean>;
  undo: { state: GameState; remainingMs: number | null; label: string } | null;
  players: Player[];
  activePlayerIds: string[];
  phase: GamePhase;
  round: QuestionRound;
  questionIndex: number;
  submittedAnswers: Record<string, SubmittedAnswer>;
  answerOutcomes: Record<string, AnswerOutcome>;
  timerEndsAt: number | null;
  lastElimination: Elimination | null;
  pendingElimination: PendingElimination | null;
  winnerId: string | null;
  finalScores: Record<string, number>;
  questionBanks: QuestionBanks | null;
  eliminationPlan: { afterBuzzer: number; afterSimultaneous: number };
  gameStarted: boolean;
}

export function createGameState(gameId = 'legacy'): GameState {
  return {
    gameId,
    revision: 0,
    questionRevision: 0,
    suddenDeath: false,
    pausedRemainingMs: null,
    manualVerdicts: {},
    undo: null,
    players: [],
    activePlayerIds: [],
    phase: 'lobby',
    round: 'buzzer',
    questionIndex: 0,
    submittedAnswers: {},
    answerOutcomes: {},
    timerEndsAt: null,
    lastElimination: null,
    pendingElimination: null,
    winnerId: null,
    finalScores: {},
    questionBanks: null,
    eliminationPlan: { afterBuzzer: 0, afterSimultaneous: 0 },
    gameStarted: false,
  };
}

export function normalizeGameState(raw: unknown): GameState {
  const base = createGameState();
  if (!raw || typeof raw !== 'object') return base;
  const legacyState = raw as Omit<Partial<GameState>, 'phase'> & {
    activePlayers?: unknown;
    phase?: string;
    pause?: unknown;
    usedJokers?: unknown;
    fiftyFiftyPlayers?: unknown;
  };
  const legacyActiveNames = Array.isArray(legacyState.activePlayers)
    ? (legacyState.activePlayers as string[])
    : [];
  const validPhases: GamePhase[] = ['lobby', 'question', 'review', 'tiebreak', 'game-over'];
  const phase: GamePhase =
    legacyState.phase === 'pause'
      ? 'question'
      : validPhases.includes(legacyState.phase as GamePhase)
        ? (legacyState.phase as GamePhase)
        : base.phase;
  const state = { ...legacyState } as Partial<GameState> & Record<string, unknown>;
  delete state.activePlayers;
  delete state.pause;
  delete state.usedJokers;
  delete state.fiftyFiftyPlayers;
  delete state.currentBuzz;
  delete state.wrongBuzzers;
  const players = Array.isArray(state.players)
    ? state.players.map((player, index) => ({
        id: player.id || `legacy-${index}-${player.name}`,
        name: player.name,
        score: Number(player.score) || 0,
      }))
    : [];
  const activePlayerIds = Array.isArray(state.activePlayerIds)
    ? state.activePlayerIds
    : players.filter((player) => legacyActiveNames.includes(player.name)).map((player) => player.id);
  return {
    ...base,
    ...state,
    phase: phase || base.phase,
    players,
    activePlayerIds,
    submittedAnswers:
      state.submittedAnswers && typeof state.submittedAnswers === 'object' ? state.submittedAnswers : {},
    answerOutcomes:
      state.answerOutcomes && typeof state.answerOutcomes === 'object' ? state.answerOutcomes : {},
    finalScores: state.finalScores && typeof state.finalScores === 'object' ? state.finalScores : {},
    manualVerdicts:
      state.manualVerdicts && typeof state.manualVerdicts === 'object' ? state.manualVerdicts : {},
    pausedRemainingMs:
      typeof state.pausedRemainingMs === 'number' ? Math.max(0, state.pausedRemainingMs) : null,
    lastElimination: normalizeLastElimination(state.lastElimination),
    pendingElimination: normalizePendingElimination(state.pendingElimination, players),
  };
}

function normalizeLastElimination(value: unknown): Elimination | null {
  if (!value || typeof value !== 'object') return null;
  const elimination = value as Partial<Elimination>;
  if (elimination.round !== 'buzzer' && elimination.round !== 'simultaneous') return null;
  const eliminatedNames = Array.isArray(elimination.eliminatedNames)
    ? elimination.eliminatedNames.filter((name): name is string => typeof name === 'string')
    : [];
  if (!eliminatedNames.length) return null;
  return {
    round: elimination.round,
    eliminatedNames,
    remaining: Math.max(0, Number(elimination.remaining) || 0),
  };
}

function normalizePendingElimination(value: unknown, players: Player[]): PendingElimination | null {
  if (!value || typeof value !== 'object') return null;
  const pending = value as Partial<PendingElimination> & {
    candidates?: unknown;
    eliminateFromCandidates?: unknown;
  };
  if (pending.round !== 'buzzer' && pending.round !== 'simultaneous') return null;

  const rawCandidates = Array.isArray(pending.candidateIds)
    ? pending.candidateIds
    : Array.isArray(pending.candidates)
      ? pending.candidates
      : [];
  const candidateIds = rawCandidates
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map(
      (candidate) =>
        players.find((player) => player.id === candidate || player.name === candidate)?.id || candidate,
    );
  const eliminateCount = Number.isInteger(pending.eliminateCount)
    ? Number(pending.eliminateCount)
    : Number(pending.eliminateFromCandidates);

  if (
    !candidateIds.length ||
    !Number.isInteger(eliminateCount) ||
    eliminateCount <= 0 ||
    eliminateCount >= candidateIds.length
  )
    return null;
  return {
    round: pending.round,
    candidateIds,
    eliminateCount,
    automaticallyEliminatedIds: Array.isArray(pending.automaticallyEliminatedIds)
      ? pending.automaticallyEliminatedIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

export function questionsForRound(banks: QuestionBanks, round: QuestionRound): Question[] {
  return banks[round];
}

export function getCurrentQuestion(state: GameState, banks: QuestionBanks): Question | null {
  const questions =
    state.round === 'final'
      ? banks.final.filter((question) => Boolean(question.reserve) === state.suddenDeath)
      : questionsForRound(banks, state.round);
  if (!questions.length) return null;
  return questions[state.questionIndex] || null;
}

export function getActivePlayers(state: GameState): Player[] {
  return state.players.filter((player) => state.activePlayerIds.includes(player.id));
}

export function timerDuration(question: Question): number {
  return question.type === 'numeric' ? 10_000 : 15_000;
}

export function calculateEliminations(playerCount: number): {
  afterBuzzer: number;
  afterSimultaneous: number;
} {
  const excess = Math.max(0, playerCount - 2);
  return { afterBuzzer: Math.ceil(excess / 2), afterSimultaneous: Math.floor(excess / 2) };
}

export interface EliminationDecision {
  keptIds: string[];
  eliminatedIds: string[];
  tie: { candidateIds: string[]; eliminateCount: number } | null;
}

export function decideElimination(state: GameState, count: number): EliminationDecision {
  const active = getActivePlayers(state);
  if (count <= 0) return { keptIds: active.map((player) => player.id), eliminatedIds: [], tie: null };
  if (count >= active.length)
    return { keptIds: [], eliminatedIds: active.map((player) => player.id), tie: null };

  const ranked = [...active].sort((a, b) => a.score - b.score);
  const threshold = ranked[count - 1].score;
  const eliminatedIds = ranked.filter((player) => player.score < threshold).map((player) => player.id);
  const candidateIds = ranked.filter((player) => player.score === threshold).map((player) => player.id);
  const eliminateCount = count - eliminatedIds.length;

  if (eliminateCount === candidateIds.length) {
    const allEliminated = [...eliminatedIds, ...candidateIds];
    return {
      keptIds: active.filter((player) => !allEliminated.includes(player.id)).map((player) => player.id),
      eliminatedIds: allEliminated,
      tie: null,
    };
  }

  return {
    keptIds: active.filter((player) => !eliminatedIds.includes(player.id)).map((player) => player.id),
    eliminatedIds,
    tie: { candidateIds, eliminateCount },
  };
}

function questionState(state: GameState, updates: Partial<GameState>): GameState {
  return {
    ...state,
    phase: 'question',
    submittedAnswers: {},
    answerOutcomes: {},
    manualVerdicts: {},
    pausedRemainingMs: null,
    questionRevision: state.questionRevision + 1,
    timerEndsAt: null,
    ...updates,
  };
}

export function advanceGame(state: GameState, banks: QuestionBanks): GameState {
  if (state.phase !== 'review') return state;
  const roundQuestions =
    state.round === 'final'
      ? banks.final.filter((question) => !question.reserve)
      : questionsForRound(banks, state.round);
  const nextIndex = state.questionIndex + 1;
  if (!state.suddenDeath && nextIndex < roundQuestions.length)
    return questionState(state, { questionIndex: nextIndex });

  if (state.round === 'final') {
    const final = resolveFinal(state);
    if (final.winnerId)
      return {
        ...state,
        activePlayerIds: [final.winnerId],
        phase: 'game-over',
        winnerId: final.winnerId,
        timerEndsAt: null,
      };
    return questionState(state, {
      activePlayerIds: final.leaderIds,
      suddenDeath: true,
      questionIndex: state.suddenDeath ? nextIndex : 0,
    });
  }

  const plan =
    state.eliminationPlan.afterBuzzer + state.eliminationPlan.afterSimultaneous > 0
      ? state.eliminationPlan
      : calculateEliminations(state.players.length);
  const count = state.round === 'buzzer' ? plan.afterBuzzer : plan.afterSimultaneous;
  const decision = decideElimination(state, count);
  const nextRound: QuestionRound = state.round === 'buzzer' ? 'simultaneous' : 'final';

  if (decision.tie) {
    return {
      ...state,
      activePlayerIds: decision.keptIds,
      phase: 'tiebreak',
      timerEndsAt: null,
      pendingElimination: {
        round: state.round,
        candidateIds: decision.tie.candidateIds,
        eliminateCount: decision.tie.eliminateCount,
        automaticallyEliminatedIds: decision.eliminatedIds,
      },
    };
  }

  const eliminatedNames = state.players
    .filter((player) => decision.eliminatedIds.includes(player.id))
    .map((player) => player.name);
  const finalScores =
    nextRound === 'final' ? Object.fromEntries(decision.keptIds.map((id) => [id, 0])) : state.finalScores;
  return questionState(state, {
    round: nextRound,
    questionIndex: 0,
    activePlayerIds: decision.keptIds,
    finalScores,
    pendingElimination: null,
    lastElimination: eliminatedNames.length
      ? { round: state.round, eliminatedNames, remaining: decision.keptIds.length }
      : null,
  });
}

export function resolveEliminationTie(state: GameState, selectedIds: string[]): GameState {
  const pending = state.pendingElimination;
  if (state.phase !== 'tiebreak' || !pending) return state;
  const selected = [...new Set(selectedIds)];
  if (selected.length !== pending.eliminateCount || selected.some((id) => !pending.candidateIds.includes(id)))
    return state;

  const allEliminatedIds = [...pending.automaticallyEliminatedIds, ...selected];
  const keptIds = state.activePlayerIds.filter((id) => !selected.includes(id));
  const nextRound: QuestionRound = pending.round === 'buzzer' ? 'simultaneous' : 'final';
  const eliminatedNames = state.players
    .filter((player) => allEliminatedIds.includes(player.id))
    .map((player) => player.name);
  const finalScores =
    nextRound === 'final' ? Object.fromEntries(keptIds.map((id) => [id, 0])) : state.finalScores;

  return questionState(state, {
    round: nextRound,
    questionIndex: 0,
    activePlayerIds: keptIds,
    finalScores,
    pendingElimination: null,
    lastElimination: { round: pending.round, eliminatedNames, remaining: keptIds.length },
  });
}

export function resolveFinal(state: GameState): { winnerId: string | null; leaderIds: string[] } {
  const activeIds = state.activePlayerIds.filter((id) => state.players.some((player) => player.id === id));
  if (!activeIds.length) return { winnerId: null, leaderIds: [] };
  const best = Math.max(...activeIds.map((id) => state.finalScores[id] || 0));
  const leaderIds = activeIds.filter((id) => (state.finalScores[id] || 0) === best);
  return { winnerId: leaderIds.length === 1 ? leaderIds[0] : null, leaderIds };
}

export function isValidPlayerName(value: string): boolean {
  const name = value.trim();
  return (
    name.length >= 2 &&
    name.length <= 20 &&
    !['.', '#', '$', '[', ']', '/'].some((character) => name.includes(character))
  );
}

export function normalizeNumericAnswer(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeNumericOutcome(
  question: Question,
  submitted: string,
): { correct: boolean; diff: number } {
  const target = question.numericAnswer;
  if (target === undefined) return { correct: false, diff: Infinity };
  const playerVal = normalizeNumericAnswer(submitted);
  if (playerVal === null) return { correct: false, diff: Infinity };
  const diff = Math.abs(playerVal - target);
  return { correct: diff === 0, diff };
}

export function computeQcmOutcome(question: Question, submitted: string): boolean {
  const letter = submitted.toUpperCase();
  const index = letter.charCodeAt(0) - 65;
  return index >= 0 && index < question.options.length && index === question.correct;
}

export function computeFreeTextOutcome(question: Question, submitted: string): boolean {
  const value = normalizeFreeText(submitted);
  return (
    Boolean(value) &&
    [question.acceptedAnswer || '', ...(question.acceptedAnswers || [])].some(
      (answer) => normalizeFreeText(answer) === value,
    )
  );
}

export function normalizeFreeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayedScore(state: GameState, playerId: string): number {
  return state.round === 'final'
    ? state.finalScores[playerId] || 0
    : state.players.find((player) => player.id === playerId)?.score || 0;
}

export function rankedPlayers(state: GameState): Player[] {
  const players =
    state.round === 'final'
      ? state.players.filter(
          (player) =>
            Object.hasOwn(state.finalScores, player.id) || state.activePlayerIds.includes(player.id),
        )
      : state.players;
  return [...players].sort(
    (a, b) =>
      Number(b.id === state.winnerId) - Number(a.id === state.winnerId) ||
      displayedScore(state, b.id) - displayedScore(state, a.id) ||
      a.name.localeCompare(b.name),
  );
}

export function pauseGame(state: GameState, now: number): GameState {
  if (state.phase !== 'question' || state.timerEndsAt === null || state.pausedRemainingMs !== null)
    return state;
  return { ...state, pausedRemainingMs: Math.max(0, state.timerEndsAt - now), timerEndsAt: null };
}

export function resumeGame(state: GameState, now: number): GameState {
  if (state.phase !== 'question' || state.pausedRemainingMs === null) return state;
  return { ...state, timerEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
}

export function submitPlayerAnswer(
  state: GameState,
  expected: GameState,
  playerId: string,
  value: string,
  now: number,
): GameState {
  if (
    state.gameId !== expected.gameId ||
    state.questionRevision !== expected.questionRevision ||
    state.round !== expected.round ||
    state.questionIndex !== expected.questionIndex ||
    state.suddenDeath !== expected.suddenDeath ||
    state.phase !== 'question' ||
    state.pausedRemainingMs !== null ||
    state.timerEndsAt === null ||
    now >= state.timerEndsAt ||
    !state.activePlayerIds.includes(playerId) ||
    state.submittedAnswers[playerId] ||
    !value.trim()
  )
    return state;
  return {
    ...state,
    submittedAnswers: {
      ...state.submittedAnswers,
      [playerId]: {
        value: value.trim(),
        submittedAt: now,
        round: state.round,
        questionIndex: state.questionIndex,
      },
    },
  };
}

export function canResolveAnswers(state: GameState, now: number): boolean {
  return (
    state.phase === 'question' &&
    state.pausedRemainingMs === null &&
    state.timerEndsAt !== null &&
    (now >= state.timerEndsAt ||
      getActivePlayers(state).every((player) => Boolean(state.submittedAnswers[player.id])))
  );
}

export function resolveAnswers(state: GameState, banks: QuestionBanks, now: number): GameState {
  const question = getCurrentQuestion(state, banks);
  if (!question || !canResolveAnswers(state, now)) return state;
  const active = getActivePlayers(state);
  // Free text always needs a deliberate host verdict for every submitted answer.
  if (
    question.type === 'free-text' &&
    active.some(
      (player) => state.submittedAnswers[player.id] && typeof state.manualVerdicts[player.id] !== 'boolean',
    )
  )
    return state;
  let winners = active
    .filter((player) => {
      const answer = state.submittedAnswers[player.id];
      return (
        answer &&
        (question.type === 'qcm'
          ? computeQcmOutcome(question, answer.value)
          : state.manualVerdicts[player.id] === true)
      );
    })
    .map((player) => player.id);
  if (question.type === 'numeric') {
    const entries = active
      .flatMap((player) => {
        const answer = state.submittedAnswers[player.id];
        if (!answer) return [];
        const { diff } = computeNumericOutcome(question, answer.value);
        return Number.isFinite(diff) ? [{ id: player.id, diff, time: answer.submittedAt }] : [];
      })
      .sort((a, b) => a.diff - b.diff || a.time - b.time);
    winners = entries.slice(0, 1).map((entry) => entry.id);
  }
  return {
    ...state,
    phase: 'review',
    timerEndsAt: null,
    players: state.players.map((player) => ({
      ...player,
      score: player.score + Number(winners.includes(player.id)),
    })),
    finalScores:
      state.round === 'final'
        ? Object.fromEntries(
            [...new Set([...Object.keys(state.finalScores), ...state.activePlayerIds])].map((id) => [
              id,
              (state.finalScores[id] || 0) + Number(winners.includes(id)),
            ]),
          )
        : state.finalScores,
    answerOutcomes: Object.fromEntries(
      active.map((player) => [
        player.id,
        {
          value: state.submittedAnswers[player.id]?.value || '',
          correct: winners.includes(player.id),
          points: Number(winners.includes(player.id)),
        },
      ]),
    ),
  };
}

export function rememberAction(previous: GameState, next: GameState, label: string, now: number): GameState {
  if (next === previous) return previous;
  return {
    ...next,
    revision: previous.revision + 1,
    undo: {
      state: { ...previous, undo: null },
      label,
      remainingMs:
        previous.pausedRemainingMs ??
        (previous.timerEndsAt === null ? null : Math.max(0, previous.timerEndsAt - now)),
    },
  };
}

export function undoAction(state: GameState): GameState {
  if (!state.undo) return state;
  const { state: previous, remainingMs } = state.undo;
  return {
    ...normalizeGameState(previous),
    revision: state.revision + 1,
    questionRevision: state.questionRevision + 1,
    timerEndsAt: null,
    pausedRemainingMs: previous.phase === 'question' ? remainingMs : null,
    undo: null,
  };
}
