import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { onValue, ref, runTransaction, set } from 'firebase/database';
import { db } from '../firebase';
import { createGameState, normalizeGameState, type GameState } from '../lib/game';
import { GameContext, type GameService } from '../lib/gameContext';
import { loadQuestionBanks, normalizeBanks } from '../lib/questionManager';
import { setServerOffset } from '../lib/clock';

const STATE_PATH = 'fonceday-game-state';

export default function GameProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const [state, setState] = useState(() => createGameState(demo ? 'repetition' : 'legacy'));
  const local = useRef(state);
  const [banks, setBanks] = useState(() => normalizeBanks(null));
  const [banksLoaded, setBanksLoaded] = useState(demo);
  const [connected, setConnected] = useState(demo);
  const connectedRef = useRef(demo);
  const [loading, setLoading] = useState(!demo && Boolean(db));
  const [error, setError] = useState(!demo && !db ? 'Connexion non configurée. Contacte l’animateur.' : '');
  const [presence, setPresence] = useState<GameService['presence']>({});
  const [nextShow, setNextShowValue] = useState('');

  useEffect(() => {
    if (demo || !db) return;
    const timeout = setTimeout(() => {
      setLoading(false);
      setError('Connexion lente. Vérifie ton réseau ; la reconnexion est automatique.');
    }, 12000);
    const fail = (error: Error) => {
      setError(error.message);
      setLoading(false);
    };
    const unsubscribers = [
      onValue(
        ref(db, STATE_PATH),
        (snapshot) => {
          setState(normalizeGameState(snapshot.val()));
          setLoading(false);
          setError('');
          clearTimeout(timeout);
        },
        fail,
      ),
      onValue(ref(db, '.info/connected'), (snapshot) => {
        connectedRef.current = snapshot.val() === true;
        setConnected(connectedRef.current);
      }),
      onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
        setServerOffset(Number(snapshot.val()) || 0);
      }),
      onValue(
        ref(db, 'fonceday-settings/nextShow'),
        (snapshot) => setNextShowValue(typeof snapshot.val() === 'string' ? snapshot.val() : ''),
        fail,
      ),
      loadQuestionBanks((value) => {
        setBanks(value);
        setBanksLoaded(true);
      }, fail),
    ];
    return () => {
      clearTimeout(timeout);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [demo]);

  useEffect(() => {
    if (demo || !db) return;
    return onValue(
      ref(db, `fonceday-presence/${state.gameId}`),
      (snapshot) => setPresence(snapshot.val() || {}),
      () => setPresence({}),
    );
  }, [demo, state.gameId]);

  const update = useCallback(
    async (fn: (current: GameState) => GameState) => {
      if (demo) {
        const next = fn(local.current);
        if (next === local.current) return false;
        local.current = normalizeGameState(next);
        setState(local.current);
        return true;
      }
      if (!db || !connectedRef.current)
        throw new Error('Reconnexion en cours. Attends le retour de la connexion pour réessayer.');
      const result = await runTransaction(
        ref(db, STATE_PATH),
        (raw) => {
          const current = normalizeGameState(raw);
          const next = fn(current);
          return next === current ? undefined : next;
        },
        { applyLocally: false },
      );
      return result.committed;
    },
    [demo],
  );

  async function setNextShow(date: string) {
    if (!demo) {
      if (!db || !connectedRef.current) throw new Error('Connexion indisponible.');
      await set(ref(db, 'fonceday-settings/nextShow'), date || null);
    }
    setNextShowValue(date);
  }

  return (
    <GameContext.Provider
      value={{
        state,
        banks: state.questionBanks || banks,
        connected: connected && (banksLoaded || Boolean(state.questionBanks)),
        loading,
        error,
        demo,
        presence,
        nextShow,
        update,
        setNextShow,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
