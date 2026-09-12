import { useState } from 'react';
import { displayedScore, getCurrentQuestion, normalizeNumericAnswer, submitPlayerAnswer } from '../lib/game';
import { useGame } from '../lib/gameContext';
import { serverNow } from '../lib/clock';
import { useCountdown } from '../lib/useCountdown';
import { AnswerReveal } from './LiveView';
import { RoundRules, Scoreboard, Timer } from './GameUI';

export default function PlayerScreen({ playerId }: { playerId: string }) {
  const { state, banks, connected, update } = useGame();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const seconds = useCountdown(state.timerEndsAt, state.phase === 'question');
  const player = state.players.find((item) => item.id === playerId);
  const question = getCurrentQuestion(state, banks);
  const submitted = state.submittedAnswers[playerId];
  const active = state.activePlayerIds.includes(playerId);
  const paused = state.pausedRemainingMs !== null;
  const canSubmit =
    connected && active && state.phase === 'question' && !paused && seconds > 0 && !submitted && !sending;
  const valid = question?.type === 'numeric' ? normalizeNumericAnswer(value) !== null : Boolean(value.trim());

  async function submit() {
    if (!canSubmit || !valid) return;
    setSending(true);
    setError('');
    try {
      const committed = await update((current) =>
        submitPlayerAnswer(current, state, playerId, value, serverNow()),
      );
      if (!committed) setError('Réponse non enregistrée : le délai ou la question a changé.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Envoi impossible. Réessaie.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page narrow">
      <header className="flex justify-between items-center gap-3">
        <h1>{player?.name || 'Spectateur'}</h1>
        <span className="score-pill">
          {displayedScore(state, playerId)} pts{state.round === 'final' ? ' en finale' : ''}
        </span>
      </header>
      {!state.gameStarted ? (
        <section className="surface text-center">
          <h2>Tu es inscrit !</h2>
          <p>L’animateur va lancer la partie.</p>
          <p className="text-muted mt-2">{state.players.length} / 15 joueurs inscrits</p>
        </section>
      ) : state.phase === 'game-over' ? (
        <section className="surface text-center">
          <h2>🏆 {state.players.find((item) => item.id === state.winnerId)?.name} remporte la partie !</h2>
          <p>{playerId === state.winnerId ? 'Bravo pour ta victoire !' : 'Merci d’avoir joué !'}</p>
        </section>
      ) : !active ? (
        <section className="surface">
          <h2>Tu es éliminé</h2>
          <p>Tu peux continuer à suivre les questions et le classement ici.</p>
        </section>
      ) : null}
      {state.gameStarted && state.phase !== 'game-over' && <RoundRules state={state} />}
      {state.phase === 'tiebreak' ? (
        <section className="surface">
          <h2>Départage avec l’animateur</h2>
          <p>Égalité au seuil d’élimination. Écoute la question orale et les instructions du direct.</p>
        </section>
      ) : question && state.gameStarted && state.phase !== 'game-over' ? (
        <section className="surface">
          <p className="eyebrow">
            {state.suddenDeath ? 'Mort subite' : 'Question'} {state.questionIndex + 1}
          </p>
          <h2 className="question-title">{question.question}</h2>
          {state.phase === 'review' ? (
            <>
              <AnswerReveal question={question} selectedValue={submitted?.value} compact />
              {state.answerOutcomes[playerId] && (
                <p role="status" className="result-banner">
                  {state.answerOutcomes[playerId].points
                    ? '✓ Bonne réponse · +1 point'
                    : submitted
                      ? '0 point sur cette question'
                      : 'Aucune réponse reçue · 0 point'}
                </p>
              )}
            </>
          ) : (
            <>
              <Timer state={state} />
              {sending ? (
                <p role="status" className="result-banner">
                  Envoi en cours… Attends la confirmation.
                </p>
              ) : submitted ? (
                <p role="status" className="result-banner">
                  ✓ Réponse confirmée :{' '}
                  {question.type === 'qcm'
                    ? `${submitted.value}. ${question.options[submitted.value.charCodeAt(0) - 65]}`
                    : submitted.value}
                </p>
              ) : active && !paused && state.timerEndsAt !== null && seconds > 0 ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  {question.type === 'qcm' ? (
                    <fieldset disabled={!canSubmit} className="flex flex-col gap-3">
                      <legend className="sr-only">Choisis ta réponse</legend>
                      {question.options.map((option, index) => {
                        const letter = String.fromCharCode(65 + index);
                        return (
                          <label
                            key={letter}
                            className={`answer-choice ${value === letter ? 'is-selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="answer"
                              value={letter}
                              checked={value === letter}
                              onChange={() => setValue(letter)}
                            />
                            <b>{letter}.</b> {option}
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : (
                    <label className="text-body">
                      {question.type === 'numeric' ? 'Ta réponse numérique' : 'Ta réponse'}
                      <input
                        className="field mt-2"
                        value={value}
                        disabled={!canSubmit}
                        onChange={(event) => setValue(event.target.value)}
                        inputMode={question.type === 'numeric' ? 'decimal' : 'text'}
                        autoComplete="off"
                        maxLength={300}
                        placeholder={question.type === 'numeric' ? 'Ex. : 42 ou 3,14' : 'Écris ta réponse'}
                      />
                    </label>
                  )}
                  <button className="action w-full mt-4" disabled={!canSubmit || !valid}>
                    Valider ma réponse
                  </button>
                </form>
              ) : (
                <p className="text-muted text-center">
                  {paused
                    ? 'Ton choix est conservé pendant la pause.'
                    : state.timerEndsAt !== null
                      ? 'Les réponses sont fermées. Correction dans un instant.'
                      : 'Écoute les règles ; le chrono va démarrer.'}
                </p>
              )}
              {error && (
                <p role="alert" className="error-banner">
                  {error}
                </p>
              )}
            </>
          )}
        </section>
      ) : state.suddenDeath && state.phase === 'question' ? (
        <section className="surface">
          <h2>Nouvelle question de départage en préparation</h2>
          <p>L’animateur ajoute une question inédite.</p>
        </section>
      ) : null}
      <Scoreboard state={state} playerId={playerId} />
    </main>
  );
}
