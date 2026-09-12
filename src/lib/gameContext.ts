import { createContext, useContext } from 'react';
import type { GameState, QuestionBanks } from './game';

export interface GameService {
  state: GameState;
  banks: QuestionBanks;
  connected: boolean;
  loading: boolean;
  error: string;
  demo: boolean;
  presence: Record<string, Record<string, boolean>>;
  nextShow: string;
  update: (fn: (current: GameState) => GameState) => Promise<boolean>;
  setNextShow: (date: string) => Promise<void>;
}
export const GameContext = createContext<GameService | null>(null);
export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('Le service de jeu est indisponible.');
  return context;
}
