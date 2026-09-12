import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPlayerSession, returningPlayer, savePlayerSession } from './session';
import { createGameState } from './game';
import { parisDateTime } from './schedule';
afterEach(() => vi.unstubAllGlobals());
describe('reprise de session', () => {
  it('retrouve le pseudo et l’identifiant après un rechargement sans réinscription', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    savePlayerSession({ gameId: 'game-1', playerId: 'p1', name: 'Élodie' });
    const session = readPlayerSession();
    const state = { ...createGameState('game-1'), players: [{ id: 'p1', name: 'Élodie', score: 7 }] };
    expect(returningPlayer(state, session)?.name).toBe('Élodie');
    expect(returningPlayer(state, session)?.score).toBe(7);
    expect(returningPlayer({ ...state, gameId: 'game-2' }, session)).toBeUndefined();
    expect(returningPlayer({ ...state, players: [] }, session)).toBeUndefined();
  });
  it('tolère le stockage désactivé ou corrompu', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{invalid',
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readPlayerSession()).toBeNull();
    expect(() => savePlayerSession({ gameId: 'a', playerId: 'b', name: 'c' })).not.toThrow();
  });
});
describe('horaire de Paris', () => {
  it('convertit correctement l’heure été et l’heure hiver', () => {
    expect(parisDateTime('2026-09-13', '16:20')).toBe('2026-09-13T14:20:00.000Z');
    expect(parisDateTime('2026-12-13', '16:20')).toBe('2026-12-13T15:20:00.000Z');
  });
  it('refuse les heures inexistantes et ambiguës au changement d’heure', () => {
    expect(() => parisDateTime('2026-03-29', '02:30')).toThrow();
    expect(() => parisDateTime('2026-10-25', '02:30')).toThrow();
  });
});
