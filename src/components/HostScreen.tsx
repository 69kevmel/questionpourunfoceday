import { useRef, useState } from 'react';
import {
  advanceGame,
  calculateEliminations,
  canResolveAnswers,
  computeFreeTextOutcome,
  createGameState,
  getActivePlayers,
  getCurrentQuestion,
  pauseGame,
  rememberAction,
  resolveAnswers,
  resolveEliminationTie,
  resumeGame,
  timerDuration,
  undoAction,
  type GameState,
} from '../lib/game';
import { useGame } from '../lib/gameContext';
import { serverNow } from '../lib/clock';
import { useCountdown } from '../lib/useCountdown';
import { cleanQuestion } from '../lib/questionManager';
import { prepareGameBanks } from '../data/reserveQuestions';
import { AnswerReveal } from './LiveView';
import ConfirmAction from './ConfirmAction';
import { RoundRules, ScheduleSettings, Scoreboard, ShareGame, Timer } from './GameUI';

export default function HostScreen({ onQuestions, onLive }: { onQuestions: () => void; onLive: () => void }) {
  const { state, banks, update, connected, demo } = useGame();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'undo' | 'reset' | 'skip' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reserveText, setReserveText] = useState('');
  const [reserveAnswer, setReserveAnswer] = useState('');
  const seconds = useCountdown(state.timerEndsAt, state.phase === 'question');
  const question = getCurrentQuestion(state, banks);
  const active = getActivePlayers(state);
  const received = active.filter((player) => state.submittedAnswers[player.id]).length;
  const ready = canResolveAnswers(state, serverNow());
  const verdictsReady =
    question?.type !== 'free-text' ||
    active.every(
      (player) => !state.submittedAnswers[player.id] || typeof state.manualVerdicts[player.id] === 'boolean',
    );
  const frozen = busy || !connected;
  const banksReady =
    banks.buzzer.length > 0 && banks.simultaneous.length > 0 && banks.final.some((item) => !item.reserve);

  async function act(label: string, transition: (current: GameState) => GameState, history = true) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const expectedRevision = state.revision;
    const expectedGameId = state.gameId;
    try {
      const changed = await update((current) => {
        if (current.gameId !== expectedGameId || current.revision !== expectedRevision) return current;
        const next = transition(current);
        return history ? rememberAction(current, next, label, serverNow()) : next;
      });
      if (!changed)
        setError(
          'La partie a changé ou cette action n’est plus disponible. Vérifie l’écran avant de réessayer.',
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Action non enregistrée. Réessaie.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function start() {
    const frozenBanks = prepareGameBanks(banks);
    void act('Démarrer la partie', (current) => {
      if (current.gameStarted || current.players.length < 3 || current.players.length > 15 || !banksReady)
        return current;
      return {
        ...current,
        gameStarted: true,
        round: 'buzzer',
        phase: 'question',
        questionIndex: 0,
        activePlayerIds: current.players.map((player) => player.id),
        eliminationPlan: calculateEliminations(current.players.length),
        questionBanks: frozenBanks,
        questionRevision: current.questionRevision + 1,
        timerEndsAt: null,
        pausedRemainingMs: null,
        finalScores: {},
        manualVerdicts: {},
        submittedAnswers: {},
        answerOutcomes: {},
        suddenDeath: false,
        winnerId: null,
      };
    });
  }

  return (
    <main className="page host-page">
      {confirmation && (
        <ConfirmAction
          message={
            confirmation === 'undo'
              ? 'Annuler la dernière action animateur ? Les réponses reçues depuis cette action seront remplacées par l’état précédent. Le chrono restauré restera en pause.'
              : confirmation === 'reset'
                ? 'Créer une nouvelle partie et retirer tous les inscrits ? Tu pourras annuler cette action tant qu’aucune autre action animateur n’a été effectuée.'
                : 'Passer cette question sans attribuer de points ?'
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmation === 'undo') void act('Annuler', undoAction, false);
            else if (confirmation === 'reset') {
              const next = createGameState(crypto.randomUUID());
              void act('Nouvelle partie', () => next);
            } else
              void act('Passer la question', (current) =>
                current.phase !== 'question' || current.pausedRemainingMs !== null
                  ? current
                  : advanceGame({ ...current, phase: 'review' }, banks),
              );
            setConfirmation(null);
          }}
        />
      )}
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <p className="eyebrow">{demo ? 'Répétition locale' : 'Régie animateur'}</p>
          <h1>
            {!state.gameStarted
              ? 'Préparer le direct'
              : state.suddenDeath
                ? 'Mort subite'
                : state.round === 'final'
                  ? 'Finale'
                  : state.round === 'buzzer'
                    ? 'Manche choix multiple'
                    : 'Manche simultanée'}
          </h1>
        </div>
        <button className="secondary" onClick={onLive}>
          Voir l’écran live
        </button>
      </header>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="secondary"
          disabled={frozen || !state.undo}
          onClick={() => setConfirmation('undo')}
        >
          Annuler{state.undo ? ` : ${state.undo.label}` : ' la dernière action'}
        </button>
        <button className="danger-button" disabled={frozen} onClick={() => setConfirmation('reset')}>
          Nouvelle partie
        </button>
      </div>
      {!state.gameStarted ? (
        <>
          <section className="surface">
            <h2>{state.players.length} / 15 joueurs inscrits</h2>
            <p className="text-muted">3 joueurs minimum · 3 manches · 2 finalistes</p>
            <p className="text-sm text-muted mt-3">
              {banks.buzzer.length} QCM · {banks.simultaneous.length} questions simultanées ·{' '}
              {banks.final.filter((item) => !item.reserve).length} questions de finale ·{' '}
              {banks.final.filter((item) => item.reserve).length || 10} réserves de mort subite
              {banks.final.some((item) => item.reserve) ? '' : ' de calcul intégrées'}.
            </p>
            <button
              className="action w-full mt-5"
              disabled={frozen || state.players.length < 3 || state.players.length > 15 || !banksReady}
              onClick={start}
            >
              Démarrer la partie
            </button>
            {!banksReady && (
              <p className="error-banner">Chaque manche doit avoir au moins une question, hors réserves.</p>
            )}
            {!demo && (
              <button className="secondary mt-3" onClick={onQuestions}>
                Gérer les questions
              </button>
            )}
          </section>
          <ShareGame />
          <Scoreboard state={state} />
          <ScheduleSettings />
          {!demo && (
            <a href="/?demo=1" target="_blank" rel="noopener noreferrer" className="secondary text-center">
              Ouvrir une répétition avec des joueurs fictifs
            </a>
          )}
        </>
      ) : (
        <>
          {state.phase !== 'game-over' && <RoundRules state={state} />}
          {state.lastElimination && (
            <p className="error-banner">
              Éliminés : {state.lastElimination.eliminatedNames.join(', ')}. Il reste{' '}
              {state.lastElimination.remaining} joueurs.
            </p>
          )}
          {state.phase === 'tiebreak' && state.pendingElimination && (
            <section className="surface">
              <h2>Départage oral</h2>
              <p>
                Sélectionne les {state.pendingElimination.eliminateCount} joueurs à éliminer après le
                départage.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                {state.pendingElimination.candidateIds.map((id) => (
                  <label key={id} className="answer-choice">
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, id] : current.filter((item) => item !== id),
                        )
                      }
                    />
                    {state.players.find((player) => player.id === id)?.name}
                  </label>
                ))}
              </div>
              <button
                className="action mt-4"
                disabled={frozen || selected.length !== state.pendingElimination.eliminateCount}
                onClick={() => {
                  void act('Départage', (current) => resolveEliminationTie(current, selected));
                  setSelected([]);
                }}
              >
                Confirmer les éliminations
              </button>
            </section>
          )}
          {state.phase === 'game-over' ? (
            <section className="surface text-center">
              <h2>
                🏆 {state.players.find((player) => player.id === state.winnerId)?.name} remporte la partie
              </h2>
              <p>Victoire avec {state.finalScores[state.winnerId || ''] || 0} points en finale.</p>
            </section>
          ) : question && state.phase !== 'tiebreak' ? (
            <section className="surface">
              <p className="eyebrow">
                {state.suddenDeath ? 'Réserve' : 'Question'} {state.questionIndex + 1}
              </p>
              <h2 className="question-title">{question.question}</h2>
              <div className="host-answer">
                <p className="eyebrow">Réponse de référence · régie</p>
                <b>
                  {question.type === 'qcm'
                    ? `${String.fromCharCode(65 + question.correct)}. ${question.options[question.correct]}`
                    : question.type === 'numeric'
                      ? question.numericAnswer
                      : question.acceptedAnswer}
                </b>
              </div>
              {state.phase === 'review' ? (
                <>
                  <AnswerReveal question={question} />
                  <p className="result-banner">Correction publiée. Les points ont été attribués.</p>
                  <button
                    className="action w-full mt-4"
                    disabled={frozen}
                    onClick={() => void act('Question suivante', (current) => advanceGame(current, banks))}
                  >
                    {state.suddenDeath ? 'Vérifier le gagnant / poursuivre' : 'Continuer'}
                  </button>
                </>
              ) : (
                <>
                  <Timer state={state} />
                  <p className="response-count" role="status">
                    {received} réponses reçues sur {active.length}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    {state.pausedRemainingMs !== null ? (
                      <button
                        className="action"
                        disabled={frozen}
                        onClick={() =>
                          void act('Reprendre le chrono', (current) => resumeGame(current, serverNow()))
                        }
                      >
                        Reprendre le chrono
                      </button>
                    ) : state.timerEndsAt === null ? (
                      <button
                        className="action"
                        disabled={frozen}
                        onClick={() =>
                          void act('Lancer le chrono', (current) =>
                            current.phase !== 'question' ||
                            current.timerEndsAt !== null ||
                            current.pausedRemainingMs !== null
                              ? current
                              : { ...current, timerEndsAt: serverNow() + timerDuration(question) },
                          )
                        }
                      >
                        Lancer le chrono
                      </button>
                    ) : seconds > 0 ? (
                      <button
                        className="secondary"
                        disabled={frozen}
                        onClick={() =>
                          void act('Mettre en pause', (current) => pauseGame(current, serverNow()))
                        }
                      >
                        Mettre en pause
                      </button>
                    ) : null}
                    <button
                      className="secondary"
                      disabled={frozen || state.pausedRemainingMs !== null}
                      onClick={() => setConfirmation('skip')}
                    >
                      Passer la question
                    </button>
                  </div>
                  {question.type === 'free-text' && (
                    <p className="text-muted text-sm mt-5">
                      Chaque réponse envoyée doit être acceptée ou refusée. La suggestion ignore les accents
                      et reconnaît les variantes configurées.
                    </p>
                  )}
                  <div className="flex flex-col gap-3 mt-4">
                    {active.map((player) => {
                      const submission = state.submittedAnswers[player.id];
                      return (
                        <div key={player.id} className="score-row flex-wrap">
                          <div className="flex-1 min-w-0">
                            <b>{player.name}</b>
                            <p className="break-words text-body">{submission?.value || 'En attente…'}</p>
                          </div>
                          {question.type === 'free-text' && submission && (
                            <div>
                              <p className="text-xs text-muted mb-2">
                                Suggestion :{' '}
                                {computeFreeTextOutcome(question, submission.value)
                                  ? 'accepter'
                                  : 'à vérifier'}
                              </p>
                              <div className="flex gap-2">
                                {[true, false].map((verdict) => (
                                  <button
                                    key={String(verdict)}
                                    aria-pressed={state.manualVerdicts[player.id] === verdict}
                                    disabled={frozen || !ready}
                                    className={
                                      state.manualVerdicts[player.id] === verdict ? 'action' : 'secondary'
                                    }
                                    onClick={() =>
                                      void act('Validation de réponse', (current) =>
                                        !canResolveAnswers(current, serverNow()) ||
                                        !current.submittedAnswers[player.id]
                                          ? current
                                          : {
                                              ...current,
                                              manualVerdicts: {
                                                ...current.manualVerdicts,
                                                [player.id]: verdict,
                                              },
                                            },
                                      )
                                    }
                                  >
                                    {verdict ? 'Accepter' : 'Refuser'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="action w-full mt-5"
                    disabled={frozen || !ready || !verdictsReady}
                    onClick={() =>
                      void act('Corriger les réponses', (current) =>
                        resolveAnswers(current, banks, serverNow()),
                      )
                    }
                  >
                    Publier la correction et les points
                  </button>
                  {ready && !verdictsReady && (
                    <p className="text-muted text-sm mt-2">
                      Valide toutes les réponses libres reçues pour publier les points.
                    </p>
                  )}
                </>
              )}
            </section>
          ) : state.suddenDeath && state.phase === 'question' ? (
            <section className="surface">
              <h2>Les réserves sont épuisées</h2>
              <p>
                Aucune question déjà révélée ne sera rejouée. Ajoute une question inédite pour continuer la
                mort subite.
              </p>
              <form
                className="flex flex-col gap-3 mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = cleanQuestion({
                    id: Date.now(),
                    round: 'final',
                    type: 'free-text',
                    reserve: true,
                    question: reserveText,
                    acceptedAnswer: reserveAnswer,
                    options: [],
                    correct: 0,
                  });
                  void act('Ajouter une réserve', (current) => {
                    const frozenBanks = current.questionBanks || banks;
                    if (getCurrentQuestion(current, frozenBanks) || !current.suddenDeath) return current;
                    if (
                      Object.values(frozenBanks)
                        .flat()
                        .some(
                          (item) =>
                            item.question.trim().toLocaleLowerCase('fr') ===
                            input.question.toLocaleLowerCase('fr'),
                        )
                    )
                      return current;
                    return {
                      ...current,
                      questionBanks: { ...frozenBanks, final: [...frozenBanks.final, input] },
                    };
                  });
                }}
              >
                <label>
                  Question inédite
                  <textarea
                    required
                    className="field"
                    value={reserveText}
                    onChange={(event) => setReserveText(event.target.value)}
                  />
                </label>
                <label>
                  Réponse de référence
                  <input
                    required
                    className="field"
                    value={reserveAnswer}
                    onChange={(event) => setReserveAnswer(event.target.value)}
                  />
                </label>
                <button className="action" disabled={frozen || !reserveText.trim() || !reserveAnswer.trim()}>
                  Ajouter à cette partie
                </button>
              </form>
            </section>
          ) : null}
          <Scoreboard state={state} />
        </>
      )}
    </main>
  );
}
