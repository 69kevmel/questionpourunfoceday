import type { GameState } from './game';

export interface PlayerSession {
  gameId: string;
  playerId: string;
  name: string;
}
const KEY = 'fonceday-player-session';

export function readLegacyPlayerId(): string {
  try {
    return sessionStorage.getItem('fonceday-player-id') || '';
  } catch {
    return '';
  }
}

export function readPlayerSession(): PlayerSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as PlayerSession | null;
    return value &&
      typeof value.gameId === 'string' &&
      typeof value.playerId === 'string' &&
      typeof value.name === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

export function savePlayerSession(session: PlayerSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
    sessionStorage.setItem('fonceday-player-id', session.playerId);
  } catch {
    /* Storage may be disabled. The current game remains usable. */
  }
}

export function returningPlayer(state: GameState, session: PlayerSession | null) {
  if (!session || session.gameId !== state.gameId) return undefined;
  return state.players.find((player) => player.id === session.playerId && player.name === session.name);
}
