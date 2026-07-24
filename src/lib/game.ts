export type QuestionType = 'qcm' | 'numeric' | 'free-text';
export type QuestionRound = 'buzzer' | 'simultaneous' | 'final';
export type GamePhase = 'lobby' | 'question' | 'review' | 'pause' | 'tiebreak' | 'game-over';
export type JokerName = 'fifty-fifty' | 'phone-a-stranger' | 'opponent-help';

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
}

export interface PauseState {
  joker: 'phone-a-stranger' | 'opponent-help';
  playerName: string;
  advisorName?: string;
  remainingMs: number | null;
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
  count: number;
  candidates: string[];
  eliminateFromCandidates: number;
  tiebreakScores: Record<string, number>;
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
  pause: PauseState | null;
  usedJokers: Record<string, JokerName[]>;
  fiftyFiftyPlayers: string[];
  lastElimination: Elimination | null;
  pendingElimination: PendingElimination | null;
  winnerId: string | null;
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
    pause: null,
    usedJokers: {},
    fiftyFiftyPlayers: [],
    lastElimination: null,
    pendingElimination: null,
    winnerId: null,
    eliminationPlan: { afterBuzzer: 0, afterSimultaneous: 0 },
    gameStarted: false,
  };
}

export function normalizeGameState(raw: unknown): GameState {
  const base = createGameState();
  if (!raw || typeof raw !== 'object') return base;
  const state = raw as Partial<GameState>;
  const legacyActiveNames = Array.isArray((state as { activePlayers?: unknown }).activePlayers)
    ? ((state as { activePlayers: string[] }).activePlayers)
    : [];
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
    players,
    activePlayerIds,
    wrongBuzzers: Array.isArray(state.wrongBuzzers) ? state.wrongBuzzers : [],
    submittedAnswers: state.submittedAnswers && typeof state.submittedAnswers === 'object' ? state.submittedAnswers : {},
    answerOutcomes: state.answerOutcomes && typeof state.answerOutcomes === 'object' ? state.answerOutcomes : {},
    usedJokers: state.usedJokers && typeof state.usedJokers === 'object' ? state.usedJokers : {},
    fiftyFiftyPlayers: Array.isArray(state.fiftyFiftyPlayers) ? state.fiftyFiftyPlayers : [],
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

export function normalizeNumericAnswer(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'));
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
