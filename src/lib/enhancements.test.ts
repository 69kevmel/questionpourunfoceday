import { describe, expect, it } from 'vitest';
import {
  advanceGame,
  canResolveAnswers,
  computeFreeTextOutcome,
  createGameState,
  displayedScore,
  getCurrentQuestion,
  normalizeGameState,
  pauseGame,
  rankedPlayers,
  rememberAction,
  resolveAnswers,
  resolveEliminationTie,
  resumeGame,
  submitPlayerAnswer,
  undoAction,
  type GameState,
  type QuestionBanks,
} from './game';
import { prepareGameBanks } from '../data/reserveQuestions';
import { defaultQuestionBanks } from '../data/defaultQuestions';

const banks: QuestionBanks = {
  buzzer: [
    {
      id: 1,
      round: 'buzzer',
      question: 'QCM',
      type: 'qcm',
      options: ['Oui', 'Non', 'Peut-être', 'Jamais'],
      correct: 0,
    },
  ],
  simultaneous: [],
  final: [
    {
      id: 2,
      round: 'final',
      question: 'Finale normale',
      type: 'qcm',
      options: ['1', '2', '3', '4'],
      correct: 0,
    },
    {
      id: 3,
      round: 'final',
      question: 'Réserve 1',
      type: 'qcm',
      options: ['1', '2', '3', '4'],
      correct: 0,
      reserve: true,
    },
    {
      id: 4,
      round: 'final',
      question: 'Réserve 2',
      type: 'qcm',
      options: ['1', '2', '3', '4'],
      correct: 0,
      reserve: true,
    },
  ],
};
function playing(): GameState {
  return {
    ...createGameState('test'),
    phase: 'question',
    gameStarted: true,
    timerEndsAt: 16000,
    players: [
      { id: 'a', name: 'Alice', score: 2 },
      { id: 'b', name: 'Bob', score: 20 },
      { id: 'c', name: 'Chris', score: 50 },
    ],
    activePlayerIds: ['a', 'b'],
    finalScores: { a: 0, b: 0 },
  };
}

describe('finale et réserves', () => {
  it('classe les finalistes selon le score de finale et place le vainqueur premier', () => {
    const state = { ...playing(), round: 'final' as const, finalScores: { a: 3, b: 2 }, winnerId: 'a' };
    expect(rankedPlayers(state).map((player) => player.id)).toEqual(['a', 'b']);
    expect(displayedScore(state, 'a')).toBe(3);
    expect(displayedScore({ ...state, round: 'buzzer' }, 'a')).toBe(2);
  });
  it('passe à une réserve inédite puis termine dès le premier avantage', () => {
    let state = advanceGame(
      { ...playing(), round: 'final', phase: 'review', finalScores: { a: 1, b: 1 } },
      banks,
    );
    expect(state.suddenDeath).toBe(true);
    expect(getCurrentQuestion(state, banks)?.id).toBe(3);
    state = advanceGame({ ...state, phase: 'review', finalScores: { a: 2, b: 1 } }, banks);
    expect(state.phase).toBe('game-over');
    expect(state.winnerId).toBe('a');
  });
  it('avance une réserve à la fois et ne boucle jamais après épuisement', () => {
    let state = {
      ...playing(),
      round: 'final' as const,
      suddenDeath: true,
      phase: 'review' as const,
    } as GameState;
    state = advanceGame(state, banks);
    expect(getCurrentQuestion(state, banks)?.id).toBe(4);
    state = advanceGame({ ...state, phase: 'review' }, banks);
    expect(state.phase).toBe('question');
    expect(state.questionIndex).toBe(2);
    expect(getCurrentQuestion(state, banks)).toBeNull();
  });
  it('ne joue pas les réserves si la finale normale produit un gagnant', () => {
    const state = advanceGame(
      { ...playing(), round: 'final', phase: 'review', finalScores: { a: 1, b: 0 } },
      banks,
    );
    expect(state.phase).toBe('game-over');
    expect(state.suddenDeath).toBe(false);
  });
  it('ajoute une réserve de secours sans modifier les banques originales', () => {
    const prepared = prepareGameBanks(defaultQuestionBanks);
    expect(prepared.final.filter((question) => question.reserve)).toHaveLength(10);
    expect(defaultQuestionBanks.final).toHaveLength(10);
    for (const question of prepared.final.filter((question) => question.reserve))
      expect(new Set(question.options).size).toBe(4);
  });
  it('exclut les réserves qui répètent une question normale et les doublons', () => {
    const duplicate = { ...banks.final[0], reserve: true, id: 10 };
    const prepared = prepareGameBanks({
      ...banks,
      final: [...banks.final, duplicate, { ...banks.final[1], id: 11 }],
    });
    expect(prepared.final.filter((question) => question.reserve)).toHaveLength(2);
  });
});

describe('délai, pause et annulation', () => {
  it('refuse une réponse pendant la pause et reprend avec le temps restant', () => {
    const state = playing();
    const paused = pauseGame(state, 6000);
    expect(paused.pausedRemainingMs).toBe(10000);
    expect(paused.timerEndsAt).toBeNull();
    expect(submitPlayerAnswer(paused, state, 'a', 'A', 8000)).toBe(paused);
    expect(canResolveAnswers(paused, 50000)).toBe(false);
    const resumed = resumeGame(paused, 50000);
    expect(resumed.timerEndsAt).toBe(60000);
    expect(resumed.pausedRemainingMs).toBeNull();
    expect(submitPlayerAnswer(resumed, resumed, 'a', 'A', 59999).submittedAnswers.a.value).toBe('A');
  });
  it('refuse les réponses tardives, éliminées, doublées ou issues d’une autre question', () => {
    const state = playing();
    expect(submitPlayerAnswer(state, state, 'a', 'A', 16000)).toBe(state);
    expect(submitPlayerAnswer(state, state, 'c', 'A', 1000)).toBe(state);
    expect(submitPlayerAnswer(state, { ...state, questionRevision: 5 }, 'a', 'A', 1000)).toBe(state);
    expect(submitPlayerAnswer(state, { ...state, gameId: 'other' }, 'a', 'A', 1000)).toBe(state);
    const accepted = submitPlayerAnswer(state, state, 'a', 'A', 1000);
    expect(submitPlayerAnswer(accepted, accepted, 'a', 'B', 2000)).toBe(accepted);
  });
  it('n’attribue les points qu’une fois et seulement après fermeture des réponses', () => {
    let state = playing();
    expect(resolveAnswers(state, banks, 1000)).toBe(state);
    state = submitPlayerAnswer(state, state, 'a', 'A', 1000);
    state = resolveAnswers(state, banks, 16000);
    expect(state.players[0].score).toBe(3);
    expect(state.answerOutcomes.a.points).toBe(1);
    expect(resolveAnswers(state, banks, 20000)).toBe(state);
  });
  it('annule une correction sans garder les points et restaure un chrono en pause', () => {
    const previous = submitPlayerAnswer(playing(), playing(), 'a', 'A', 1000);
    const current = rememberAction(previous, resolveAnswers(previous, banks, 17000), 'Correction', 17000);
    const restored = undoAction(current);
    expect(restored.players[0].score).toBe(2);
    expect(restored.submittedAnswers.a.value).toBe('A');
    expect(restored.phase).toBe('question');
    expect(restored.pausedRemainingMs).toBe(0);
    expect(restored.questionRevision).toBeGreaterThan(previous.questionRevision);
    expect(restored.undo).toBeNull();
    expect(resolveAnswers(resumeGame(restored, 20000), banks, 20000).players[0].score).toBe(3);
  });
  it('ne conserve qu’un niveau d’historique et survit à la sérialisation Firebase', () => {
    const first = rememberAction(playing(), pauseGame(playing(), 1000), 'Pause', 1000);
    const second = rememberAction(first, resumeGame(first, 2000), 'Reprise', 2000);
    expect(second.undo?.state.undo).toBeNull();
    const raw = JSON.parse(JSON.stringify(second));
    delete raw.undo.state.manualVerdicts;
    expect(undoAction(normalizeGameState(raw)).manualVerdicts).toEqual({});
  });
});

describe('réponses libres', () => {
  const question = {
    id: 50,
    round: 'final' as const,
    question: 'Ville',
    type: 'free-text' as const,
    options: [],
    correct: 0,
    acceptedAnswer: 'Évry',
    acceptedAnswers: ['Évry-Courcouronnes'],
  };
  const textBanks = { ...banks, final: [question] };
  it('reconnaît accents, espaces, casse et synonymes explicites', () => {
    expect(computeFreeTextOutcome(question, ' EVRY ')).toBe(true);
    expect(computeFreeTextOutcome(question, 'evry-courcouronnes')).toBe(true);
    expect(computeFreeTextOutcome(question, 'Paris')).toBe(false);
    expect(computeFreeTextOutcome(question, '')).toBe(false);
  });
  it('attend la validation manuelle même si la suggestion est correcte', () => {
    const initial = { ...playing(), round: 'final' as const };
    const answered = submitPlayerAnswer(initial, initial, 'a', 'Evry', 1000);
    expect(resolveAnswers(answered, textBanks, 16000)).toBe(answered);
    const rejected = resolveAnswers({ ...answered, manualVerdicts: { a: false } }, textBanks, 16000);
    expect(rejected.answerOutcomes.a.points).toBe(0);
    const accepted = resolveAnswers({ ...answered, manualVerdicts: { a: true } }, textBanks, 16000);
    expect(accepted.finalScores.a).toBe(1);
  });
});

it('joue une partie complète avec calcul réel des réponses, éliminations et finale', () => {
  const prepared = prepareGameBanks(defaultQuestionBanks);
  let state: GameState = {
    ...playing(),
    players: Array.from({ length: 15 }, (_, index) => ({
      id: `p${index}`,
      name: `Joueur ${index + 1}`,
      score: 0,
    })),
    activePlayerIds: Array.from({ length: 15 }, (_, index) => `p${index}`),
    questionBanks: prepared,
    eliminationPlan: { afterBuzzer: 7, afterSimultaneous: 6 },
  };
  let now = 1000;
  for (let step = 0; step < 150 && state.phase !== 'game-over'; step++) {
    if (state.phase === 'tiebreak' && state.pendingElimination) {
      state = resolveEliminationTie(
        state,
        state.pendingElimination.candidateIds.slice(-state.pendingElimination.eliminateCount),
      );
      continue;
    }
    if (state.phase === 'review') {
      state = advanceGame(state, prepared);
      continue;
    }
    const question = getCurrentQuestion(state, prepared);
    expect(question).not.toBeNull();
    if (!question) break;
    state = { ...state, timerEndsAt: now + 15000 };
    const ids = [...state.activePlayerIds];
    for (const [index, id] of ids.entries()) {
      const value =
        question.type === 'numeric'
          ? String((question.numericAnswer || 0) + index)
          : String.fromCharCode(
              65 + (index === 0 ? question.correct : (question.correct + 1) % question.options.length),
            );
      state = submitPlayerAnswer(state, state, id, value, now + index);
    }
    expect(canResolveAnswers(state, now + 50)).toBe(true);
    state = resolveAnswers(state, prepared, now + 50);
    now += 20000;
  }
  expect(state.phase).toBe('game-over');
  expect(state.winnerId).toBe('p0');
  expect(rankedPlayers(state)).toHaveLength(2);
  expect(displayedScore(state, 'p0')).toBe(10);
  expect(state.players[0].score).toBe(31);
});
