import { describe, expect, it } from 'vitest';
import {
  advanceGame,
  calculateEliminations,
  computeFreeTextOutcome,
  computeNumericOutcome,
  computeQcmOutcome,
  createGameState,
  decideElimination,
  isValidPlayerName,
  normalizeGameState,
  resolveEliminationTie,
  type GameState,
  type QuestionBanks,
} from './game';

const banks: QuestionBanks = {
  buzzer: [{ id: 1, round: 'buzzer', type: 'qcm', question: 'Buzzer', options: ['A', 'B'], correct: 0 }],
  simultaneous: [{ id: 2, round: 'simultaneous', type: 'numeric', question: 'Nombre', options: [], correct: 0, numericAnswer: 10 }],
  final: [{ id: 3, round: 'final', type: 'free-text', question: 'Finale', options: [], correct: 0, acceptedAnswer: 'Oui' }],
};

function stateWithPlayers(count: number): GameState {
  const players = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Joueur ${index + 1}`,
    score: count - index,
  }));
  return {
    ...createGameState(),
    players,
    activePlayerIds: players.map((player) => player.id),
    gameStarted: true,
    phase: 'review',
    eliminationPlan: calculateEliminations(count),
  };
}

describe('parcours des effectifs', () => {
  for (let count = 3; count <= 15; count += 1) {
    it(`termine une boucle complète avec deux finalistes sur ${count} joueurs`, () => {
      let state = stateWithPlayers(count);
      state = advanceGame(state, banks);
      expect(state.round).toBe('simultaneous');
      expect(state.activePlayerIds).toHaveLength(count - calculateEliminations(count).afterBuzzer);

      state = { ...state, phase: 'review' };
      state = advanceGame(state, banks);
      expect(state.round).toBe('final');
      expect(state.activePlayerIds).toEqual(['p1', 'p2']);

      state = { ...state, phase: 'review', finalScores: { p1: 1, p2: 0 } };
      state = advanceGame(state, banks);
      expect(state.phase).toBe('game-over');
      expect(state.winnerId).toBe('p1');
    });
  }

  it.each([
    [3, 1, 0],
    [4, 1, 1],
    [8, 3, 3],
    [9, 4, 3],
    [10, 4, 4],
  ])('répartit correctement %i joueurs', (count, buzzer, simultaneous) => {
    expect(calculateEliminations(count)).toEqual({ afterBuzzer: buzzer, afterSimultaneous: simultaneous });
  });
});

describe('égalités et finale', () => {
  it('demande un départage lorsque le seuil coupe une égalité', () => {
    const initial = stateWithPlayers(8);
    const tied = { ...initial, players: initial.players.map((player) => ({ ...player, score: 0 })) };
    const decision = decideElimination(tied, 3);
    expect(decision.tie).toEqual({ candidateIds: tied.activePlayerIds, eliminateCount: 3 });

    const pending = advanceGame(tied, banks);
    expect(pending.phase).toBe('tiebreak');
    const resolved = resolveEliminationTie(pending, ['p6', 'p7', 'p8']);
    expect(resolved.phase).toBe('question');
    expect(resolved.round).toBe('simultaneous');
    expect(resolved.activePlayerIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('conserve le départage lorsque Firebase supprime le tableau vide', () => {
    const initial = stateWithPlayers(8);
    const tied = { ...initial, players: initial.players.map((player) => ({ ...player, score: 0 })) };
    const pending = advanceGame(tied, banks);
    const firebaseValue = JSON.parse(JSON.stringify(pending)) as Record<string, unknown>;
    const serializedPending = firebaseValue.pendingElimination as Record<string, unknown>;
    delete serializedPending.automaticallyEliminatedIds;

    expect(normalizeGameState(firebaseValue).pendingElimination).toEqual({
      round: 'buzzer',
      candidateIds: tied.activePlayerIds,
      eliminateCount: 3,
      automaticallyEliminatedIds: [],
    });
  });

  it('termine la finale avec un leader unique', () => {
    const initial = stateWithPlayers(5);
    const final = { ...initial, round: 'final' as const, activePlayerIds: ['p1', 'p2'], finalScores: { p1: 2, p2: 1 } };
    const completed = advanceGame(final, banks);
    expect(completed.phase).toBe('game-over');
    expect(completed.winnerId).toBe('p1');
    expect(completed.activePlayerIds).toEqual(['p1']);
  });

  it('continue en mort subite si la finale reste à égalité', () => {
    const initial = stateWithPlayers(5);
    const final = { ...initial, round: 'final' as const, activePlayerIds: ['p1', 'p2'], finalScores: { p1: 1, p2: 1 } };
    const suddenDeath = advanceGame(final, banks);
    expect(suddenDeath.phase).toBe('question');
    expect(suddenDeath.winnerId).toBeNull();
    expect(suddenDeath.activePlayerIds).toEqual(['p1', 'p2']);
  });
});

describe('validation des réponses et identités', () => {
  it('supprime les anciens jokers lors de la normalisation', () => {
    const normalized = normalizeGameState({
      ...createGameState(),
      phase: 'pause',
      pause: { joker: 'phone-a-stranger', playerName: 'Kevin', remainingMs: 5000 },
      usedJokers: { p1: ['phone-a-stranger'] },
      fiftyFiftyPlayers: ['p1'],
    }) as GameState & Record<string, unknown>;

    expect(normalized.phase).toBe('question');
    expect(normalized).not.toHaveProperty('pause');
    expect(normalized).not.toHaveProperty('usedJokers');
    expect(normalized).not.toHaveProperty('fiftyFiftyPlayers');
  });

  it('rejette une réponse numérique vide', () => {
    expect(computeNumericOutcome(banks.simultaneous[0], '')).toEqual({ correct: false, diff: Infinity });
  });

  it('évalue les QCM et textes sans tenir compte de la casse du texte', () => {
    expect(computeQcmOutcome(banks.buzzer[0], 'A')).toBe(true);
    expect(computeFreeTextOutcome(banks.final[0], ' oui ')).toBe(true);
  });

  it('rejette les pseudos incompatibles avec Firebase', () => {
    expect(isValidPlayerName('Kevin')).toBe(true);
    expect(isValidPlayerName('K')).toBe(false);
    expect(isValidPlayerName('Kev/in')).toBe(false);
    expect(isValidPlayerName('Kev#in')).toBe(false);
  });
});
