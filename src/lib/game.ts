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

export interface CurrentBuzz {
  playerId: string;
  name: string;
  ts: number;
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
  players: Player[];
  activePlayerIds: string[];
  phase: GamePhase;
  round: QuestionRound;
  questionIndex: number;
  currentBuzz: CurrentBuzz | null;
  wrongBuzzers: string[];
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

export function createGameState(): GameState {
  return {
    players: [],
    activePlayerIds: [],
    phase: 'lobby',
    round: 'buzzer',
    questionIndex: 0,
    currentBuzz: null,
    wrongBuzzers: [],
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
  const legacyState = raw as Omit<Partial<GameState>, 'phase'> & { activePlayers?: unknown; phase?: string; pause?: unknown; usedJokers?: unknown; fiftyFiftyPlayers?: unknown };
  const legacyActiveNames = Array.isArray(legacyState.activePlayers)
    ? (legacyState.activePlayers as string[])
    : [];
  const validPhases: GamePhase[] = ['lobby', 'question', 'review', 'tiebreak', 'game-over'];
  const phase: GamePhase = legacyState.phase === 'pause'
    ? 'question'
    : validPhases.includes(legacyState.phase as GamePhase) ? legacyState.phase as GamePhase : base.phase;
  const state = { ...legacyState } as Partial<GameState> & Record<string, unknown>;
  delete state.activePlayers;
  delete state.pause;
  delete state.usedJokers;
  delete state.fiftyFiftyPlayers;
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
    wrongBuzzers: Array.isArray(state.wrongBuzzers) ? state.wrongBuzzers : [],
    submittedAnswers: state.submittedAnswers && typeof state.submittedAnswers === 'object' ? state.submittedAnswers : {},
    answerOutcomes: state.answerOutcomes && typeof state.answerOutcomes === 'object' ? state.answerOutcomes : {},
    finalScores: state.finalScores && typeof state.finalScores === 'object' ? state.finalScores : {},
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
  const pending = value as Partial<PendingElimination> & { candidates?: unknown; eliminateFromCandidates?: unknown };
  if (pending.round !== 'buzzer' && pending.round !== 'simultaneous') return null;

  const rawCandidates = Array.isArray(pending.candidateIds)
    ? pending.candidateIds
    : Array.isArray(pending.candidates) ? pending.candidates : [];
  const candidateIds = rawCandidates
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => players.find((player) => player.id === candidate || player.name === candidate)?.id || candidate);
  const eliminateCount = Number.isInteger(pending.eliminateCount)
    ? Number(pending.eliminateCount)
    : Number(pending.eliminateFromCandidates);

  if (!candidateIds.length || !Number.isInteger(eliminateCount) || eliminateCount <= 0 || eliminateCount >= candidateIds.length) return null;
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
  const questions = questionsForRound(banks, state.round);
  if (!questions.length) return null;
  if (state.round === 'final' || state.phase === 'tiebreak') return questions[state.questionIndex % questions.length] || null;
  return questions[state.questionIndex] || null;
}

export function getActivePlayers(state: GameState): Player[] {
  return state.players.filter((player) => state.activePlayerIds.includes(player.id));
}

export function timerDuration(question: Question): number {
  return question.type === 'numeric' ? 10_000 : 15_000;
}

export function calculateEliminations(playerCount: number): { afterBuzzer: number; afterSimultaneous: number } {
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
  if (count >= active.length) return { keptIds: [], eliminatedIds: active.map((player) => player.id), tie: null };

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
    currentBuzz: null,
    phase: 'question',
    wrongBuzzers: [],
    submittedAnswers: {},
    answerOutcomes: {},
    timerEndsAt: null,
    ...updates,
  };
}

export function advanceGame(state: GameState, banks: QuestionBanks): GameState {
  if (state.phase !== 'review') return state;
  const roundQuestions = questionsForRound(banks, state.round);
  const nextIndex = state.questionIndex + 1;
  if (nextIndex < roundQuestions.length) return questionState(state, { questionIndex: nextIndex });

  if (state.round === 'final') {
    const final = resolveFinal(state);
    if (final.winnerId) return { ...state, activePlayerIds: [final.winnerId], phase: 'game-over', winnerId: final.winnerId, timerEndsAt: null };
    return questionState(state, { activePlayerIds: final.leaderIds, questionIndex: 0 });
  }

  const plan = state.eliminationPlan.afterBuzzer + state.eliminationPlan.afterSimultaneous > 0
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
      currentBuzz: null,
      timerEndsAt: null,
      pendingElimination: {
        round: state.round,
        candidateIds: decision.tie.candidateIds,
        eliminateCount: decision.tie.eliminateCount,
        automaticallyEliminatedIds: decision.eliminatedIds,
      },
    };
  }

  const eliminatedNames = state.players.filter((player) => decision.eliminatedIds.includes(player.id)).map((player) => player.name);
  const finalScores = nextRound === 'final'
    ? Object.fromEntries(decision.keptIds.map((id) => [id, 0]))
    : state.finalScores;
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
  if (selected.length !== pending.eliminateCount || selected.some((id) => !pending.candidateIds.includes(id))) return state;

  const allEliminatedIds = [...pending.automaticallyEliminatedIds, ...selected];
  const keptIds = state.activePlayerIds.filter((id) => !selected.includes(id));
  const nextRound: QuestionRound = pending.round === 'buzzer' ? 'simultaneous' : 'final';
  const eliminatedNames = state.players.filter((player) => allEliminatedIds.includes(player.id)).map((player) => player.name);
  const finalScores = nextRound === 'final' ? Object.fromEntries(keptIds.map((id) => [id, 0])) : state.finalScores;

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
  return name.length >= 2 && name.length <= 20 && !['.', '#', '$', '[', ']', '/'].some((character) => name.includes(character));
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

export function computeQcmOutcome(
  question: Question,
  submitted: string,
): boolean {
  const letter = submitted.toUpperCase();
  const index = letter.charCodeAt(0) - 65;
  return index >= 0 && index < question.options.length && index === question.correct;
}

export function computeFreeTextOutcome(
  question: Question,
  submitted: string,
): boolean {
  if (!question.acceptedAnswer) return false;
  return submitted.trim().toLowerCase() === question.acceptedAnswer.trim().toLowerCase();
}
