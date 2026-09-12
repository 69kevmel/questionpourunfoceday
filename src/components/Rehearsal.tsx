import { useEffect, useRef, useState } from 'react';
import { calculateEliminations, createGameState, getCurrentQuestion, submitPlayerAnswer } from '../lib/game';
import { useGame } from '../lib/gameContext';
import { serverNow } from '../lib/clock';
import { defaultQuestionBanks } from '../data/defaultQuestions';
import { prepareGameBanks } from '../data/reserveQuestions';

export default function Rehearsal({
  onPlayer,
  onHost,
  onLive,
}: {
  onPlayer: (id: string) => void;
  onHost: () => void;
  onLive: () => void;
}) {
  const { state, banks, update } = useGame();
  const [count, setCount] = useState(5);
  const [automatic, setAutomatic] = useState(true);
  const [observer, setObserver] = useState('');
  const [scenario, setScenario] = useState('full');
  const live = useRef({ state, banks });
  useEffect(() => {
    live.current = { state, banks };
  }, [state, banks]);
  useEffect(() => {
    if (!automatic) return;
    const interval = setInterval(() => {
      const { state, banks } = live.current;
      const question = getCurrentQuestion(state, banks);
      if (!question || state.phase !== 'question' || state.pausedRemainingMs !== null || !state.timerEndsAt)
        return;
      const playerId = state.activePlayerIds.find((id) => id !== observer && !state.submittedAnswers[id]);
      if (!playerId) return;
      const index = state.players.findIndex((player) => player.id === playerId);
      const correct = (index + state.questionIndex) % 3 !== 0;
      const value =
        question.type === 'qcm'
          ? String.fromCharCode(
              65 + (correct ? question.correct : (question.correct + 1) % question.options.length),
            )
          : question.type === 'numeric'
            ? String((question.numericAnswer || 0) + (correct ? index : 100))
            : correct
              ? question.acceptedAnswer || 'Oui'
              : 'Une autre proposition';
      void update((current) => submitPlayerAnswer(current, state, playerId, value, serverNow()));
    }, 650);
    return () => clearInterval(interval);
  }, [automatic, observer, update]);

  return (
    <aside className="rehearsal-bar">
      <b>RÉPÉTITION · aucune donnée envoyée à Firebase</b>
      <div className="flex flex-wrap gap-3 items-center mt-3">
        <label>
          Scénario{' '}
          <select className="field" value={scenario} onChange={(event) => setScenario(event.target.value)}>
            <option value="full">Partie complète</option>
            <option value="final">Finale à égalité</option>
            <option value="text">Réponse libre</option>
            <option value="empty">Réserves épuisées</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            const prepared = prepareGameBanks(defaultQuestionBanks);
            const players = Array.from({ length: 5 }, (_, index) => ({
              id: `bot-${index + 1}`,
              name: `Joueur démo ${index + 1}`,
              score: scenario === 'full' ? 0 : 10 - index,
            }));
            const next = {
              ...createGameState(`repetition-${crypto.randomUUID()}`),
              players,
              activePlayerIds: players.map((player) => player.id),
              questionBanks: prepared,
              eliminationPlan: calculateEliminations(5),
            };
            if (scenario !== 'full') {
              next.gameStarted = true;
              next.phase = 'question';
            }
            if (scenario === 'text') {
              next.round = 'simultaneous';
              next.questionBanks.simultaneous = [
                {
                  id: -10,
                  round: 'simultaneous',
                  type: 'free-text',
                  question: 'Quelle ville résulte de la fusion d’Évry et de Courcouronnes ?',
                  options: [],
                  correct: 0,
                  acceptedAnswer: 'Évry-Courcouronnes',
                  acceptedAnswers: ['Evry Courcouronnes'],
                },
              ];
            }
            if (scenario === 'final' || scenario === 'empty') {
              next.round = 'final';
              next.activePlayerIds = players.slice(0, 2).map((player) => player.id);
              next.finalScores = Object.fromEntries(next.activePlayerIds.map((id) => [id, 2]));
              next.suddenDeath = true;
            }
            if (scenario === 'empty')
              next.questionIndex = next.questionBanks.final.filter((question) => question.reserve).length;
            void update(() => next);
            setObserver('');
            onHost();
          }}
        >
          Charger le scénario
        </button>
        {!state.gameStarted && (
          <>
            <label>
              Effectif{' '}
              <input
                aria-label="Nombre de joueurs fictifs"
                type="number"
                min={3}
                max={15}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="field inline-block w-20"
              />
            </label>
            <button
              className="secondary"
              disabled={!Number.isInteger(count) || count < 3 || count > 15}
              onClick={() => {
                const players = Array.from({ length: count }, (_, index) => ({
                  id: `bot-${index + 1}`,
                  name: `Joueur démo ${index + 1}`,
                  score: 0,
                }));
                void update((current) =>
                  current.gameStarted
                    ? current
                    : { ...current, players, activePlayerIds: players.map((player) => player.id) },
                );
              }}
            >
              Préparer les joueurs
            </button>
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />{' '}
          Réponses automatiques
        </label>
        <button
          className="secondary"
          onClick={() => {
            setObserver('');
            onHost();
          }}
        >
          Vue animateur
        </button>
        <button
          className="secondary"
          onClick={() => {
            setObserver('');
            onLive();
          }}
        >
          Vue live
        </button>
        <label>
          Jouer soi-même{' '}
          <select
            className="field"
            value={observer}
            onChange={(event) => {
              setObserver(event.target.value);
              if (event.target.value) onPlayer(event.target.value);
              else onHost();
            }}
          >
            <option value="">Choisir un joueur</option>
            {state.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <a className="secondary" href="/">
          Quitter la répétition
        </a>
      </div>
      <p className="text-xs text-muted mt-2">
        Le joueur sélectionné répond manuellement. Les autres utilisent les mêmes contrôles de délai et de
        score que dans une vraie partie.
      </p>
    </aside>
  );
}
