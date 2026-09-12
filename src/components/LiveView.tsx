import { type CSSProperties } from 'react';
import {
  getActivePlayers,
  getCurrentQuestion,
  rankedPlayers,
  displayedScore,
  type GameState,
  type QuestionBanks,
  type Question,
  type QuestionRound,
} from '../lib/game';
import { useCountdown } from '../lib/useCountdown';
import { Glow } from './Brand';
export default function LiveView({
  gameState,
  banks,
  onExit,
  eliminatedPlayerName,
}: {
  gameState: GameState;
  banks: QuestionBanks;
  onExit?: () => void;
  eliminatedPlayerName?: string;
}) {
  const allPlayers = gameState.players || [];
  const sorted = rankedPlayers(gameState);
  const question = getCurrentQuestion(gameState, banks);
  const active = getActivePlayers(gameState);
  const isWaiting = !gameState.gameStarted || gameState.phase === 'lobby';
  const isGameOver = gameState.phase === 'game-over';
  const winner = allPlayers.find((player) => player.id === gameState.winnerId);
  const viewerId = eliminatedPlayerName
    ? gameState.players.find((player) => player.name === eliminatedPlayerName)?.id
    : undefined;
  const viewerEliminated = viewerId ? !gameState.activePlayerIds.includes(viewerId) : false;
  const timerDisplay = useCountdown(gameState.timerEndsAt, gameState.phase === 'question');

  return (
    <div className="live-screen app-bg w-full">
      <Glow />
      <div className="live-layout relative z-10 mx-auto max-w-[1600px]">
        <div className="live-topbar">
          <div className="live-camera-slot" aria-hidden="true" />
          <header className="live-header">
            <div className="live-brand min-w-0">
              <div className="flex items-center gap-2">
                <span className="live-dot" aria-hidden="true" />
                <p className="text-brand-green text-[10px] font-bold tracking-[1px]">EN DIRECT</p>
              </div>
              <h1 className="text-gold font-heading font-bold truncate">Questions pour un Fonceday</h1>
            </div>
            <div className="live-status shrink-0">
              <p className="text-ink text-xs sm:text-sm font-bold">
                {gameState.pausedRemainingMs !== null
                  ? 'Partie en pause'
                  : gameState.suddenDeath
                    ? 'Mort subite'
                    : liveStatusLabel(gameState)}
              </p>
              <p className="text-muted text-[10px] sm:text-xs">
                {active.length} / {allPlayers.length} joueurs en course
              </p>
            </div>
            {onExit && (
              <button
                onClick={onExit}
                title="Quitter le live"
                aria-label="Quitter le live"
                className="live-exit"
              >
                ×
              </button>
            )}
          </header>
          <div className="live-overlay-safe-zone" aria-hidden="true" />
        </div>

        <div className="live-progress" aria-label="Progression de la partie">
          {(['buzzer', 'simultaneous', 'final'] as QuestionRound[]).map((round, index) => {
            const currentRound = (['buzzer', 'simultaneous', 'final'] as QuestionRound[]).indexOf(
              gameState.round,
            );
            const done = gameState.gameStarted && (index < currentRound || isGameOver);
            const current = gameState.gameStarted && !isGameOver && index === currentRound;
            return (
              <div
                key={round}
                className={`live-progress-step ${current ? 'is-current' : done ? 'is-done' : ''}`}
              >
                <span>{roundLabel(round)}</span>
              </div>
            );
          })}
        </div>

        <main className="live-main">
          <section className={`live-stage live-card ${gameState.phase === 'question' ? 'is-answering' : ''}`}>
            {isWaiting ? (
              <div className="live-center-state">
                <p className="text-brand-green text-xs font-bold tracking-[1px]">EN ATTENTE</p>
                <h2 className="text-gold font-heading font-bold">Le jeu va commencer</h2>
                <p className="text-body">
                  {allPlayers.length} joueur{allPlayers.length > 1 ? 's' : ''} inscrit
                  {allPlayers.length > 1 ? 's' : ''}
                </p>
              </div>
            ) : isGameOver ? (
              <div className="live-center-state">
                <p className="text-gold text-xs font-bold tracking-[1px]">PARTIE TERMINÉE</p>
                <h2 className="text-ink font-heading font-bold">
                  {winner ? `${winner.name} remporte la partie` : 'La partie est terminée'}
                </h2>
                {winner && (
                  <p className="text-brand-green font-black">
                    {gameState.finalScores[winner.id] ?? winner.score} pts en finale
                  </p>
                )}
              </div>
            ) : gameState.phase === 'tiebreak' ? (
              <div className="live-center-state">
                <p className="text-gold text-xs font-bold tracking-[1px]">DÉPARTAGE</p>
                <h2 className="text-ink font-heading font-bold">Égalité au seuil d'élimination</h2>
                <p className="text-body">
                  {gameState.pendingElimination
                    ? gameState.pendingElimination.candidateIds
                        .map((id) => gameState.players.find((player) => player.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                    : "L'animateur prépare le départage"}
                </p>
              </div>
            ) : question ? (
              <>
                <div className="live-question-head">
                  <p className="text-muted text-[10px] sm:text-xs font-bold tracking-[1px]">
                    {gameState.pausedRemainingMs !== null
                      ? 'PAUSE'
                      : gameState.phase === 'review'
                        ? 'RÉSULTAT'
                        : 'QUESTION EN COURS'}
                  </p>
                  <p className="text-brand-green text-xs font-bold">
                    Question {currentQuestionInRound(gameState)}
                    {timerDisplay > 0 ? ` · ${timerDisplay}s` : ''}
                  </p>
                </div>
                <p className="live-question text-ink font-bold">{question.question}</p>
                {gameState.phase === 'question' && (
                  <p className="live-timer" role="timer">
                    {gameState.pausedRemainingMs !== null
                      ? `Pause · ${Math.ceil(gameState.pausedRemainingMs / 1000)}s`
                      : gameState.timerEndsAt === null
                        ? 'Le chrono va démarrer'
                        : timerDisplay > 0
                          ? `${timerDisplay}s`
                          : 'Temps écoulé'}
                  </p>
                )}
                {gameState.phase === 'review' ? (
                  <div className="live-review">
                    <AnswerReveal question={question} compact />
                    <LiveAnswerResults gameState={gameState} question={question} />
                  </div>
                ) : question.type === 'qcm' ? (
                  <QuestionOptions question={question} live />
                ) : (
                  <div className="live-answer-mode">
                    <p className="text-brand-green font-black">
                      {question.type === 'numeric' ? 'Chiffre le plus proche' : 'Réponse libre'}
                    </p>
                  </div>
                )}
                {gameState.lastElimination && (
                  <div className="live-alert is-elimination">
                    Éliminés : {gameState.lastElimination.eliminatedNames.join(', ')}
                  </div>
                )}
              </>
            ) : gameState.suddenDeath ? (
              <div className="live-center-state">
                <h2 className="text-gold">Nouvelle question en préparation</h2>
                <p>L’animateur ajoute une réserve inédite.</p>
              </div>
            ) : null}
          </section>

          <aside className="live-ranking live-card">
            <div className="live-ranking-head">
              <p className="text-muted text-[10px] sm:text-xs font-bold tracking-[1px]">
                {gameState.round === 'final' ? 'SCORES DE FINALE' : 'CLASSEMENT EN DIRECT'}
              </p>
              {eliminatedPlayerName && viewerEliminated && (
                <span className="text-danger text-[10px] font-bold">ÉLIMINÉ</span>
              )}
            </div>
            <div
              className="live-score-grid"
              style={
                {
                  '--live-score-rows': Math.max(sorted.length, 8),
                  '--live-mobile-score-rows': Math.max(Math.ceil(sorted.length / 3), 3),
                } as CSSProperties
              }
            >
              {sorted.map((player, index) => {
                const eliminated = !gameState.activePlayerIds.includes(player.id) && gameState.gameStarted;
                return (
                  <div
                    key={player.id}
                    className={`live-score-row ${index === 0 ? 'is-first' : ''} ${eliminated ? 'is-eliminated' : ''} ${player.id === viewerId ? 'is-viewer' : ''}`}
                  >
                    <span className="live-rank">{index + 1}</span>
                    <span className="live-player-name">{player.name}</span>
                    <b>{displayedScore(gameState, player.id)}</b>
                  </div>
                );
              })}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

function QuestionOptions({ question, live = false }: { question: Question; live?: boolean }) {
  return (
    <div className={live ? 'live-options' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
      {question.options.map((option, index) => (
        <div
          key={index}
          className={live ? 'live-option' : 'px-3 py-2 rounded-lg bg-black/30 border border-line'}
        >
          <span className="text-brand-green font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
          <span className="text-body">{option}</span>
        </div>
      ))}
    </div>
  );
}

function formatAnswer(question: Question, value: string): string {
  if (!value) return 'Pas de réponse';
  if (question.type !== 'qcm') return value;
  const index = value.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < question.options.length
    ? `${value.toUpperCase()}. ${question.options[index]}`
    : value;
}

function LiveAnswerResults({ gameState, question }: { gameState: GameState; question: Question }) {
  const outcomes = getActivePlayers(gameState)
    .map((player) => ({
      player,
      outcome: gameState.answerOutcomes[player.id] || gameState.answerOutcomes[player.name],
    }))
    .filter((entry) => entry.outcome);
  if (!outcomes.length) return null;
  return (
    <div className="live-results">
      {outcomes.map(({ player, outcome }) => (
        <div key={player.id} className={`live-result-row ${outcome.points > 0 ? 'is-correct' : 'is-wrong'}`}>
          <span>{player.name}</span>
          <span className="live-result-answer">{formatAnswer(question, outcome.value)}</span>
          <b>{outcome.points > 0 ? `+${outcome.points}` : '0'}</b>
        </div>
      ))}
    </div>
  );
}

export function AnswerReveal({
  question,
  selectedValue,
  compact = false,
}: {
  question: Question;
  selectedValue?: string;
  compact?: boolean;
}) {
  if (question.type === 'qcm') {
    const selectedIndex = selectedValue ? selectedValue.toUpperCase().charCodeAt(0) - 65 : -1;
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}>
        {question.options.map((option, idx) => {
          const correct = idx === question.correct;
          const selected = idx === selectedIndex;
          return (
            <div
              key={idx}
              className={`${compact ? 'p-2' : 'p-4'} rounded-lg border ${correct ? 'bg-brand-green/25 border-brand-green' : selected ? 'bg-danger-strong/15 border-danger' : 'bg-black/30 border-[#64646433]'}`}
            >
              <p
                className={`${compact ? 'text-xs' : 'text-sm'} ${correct ? 'text-brand-green font-bold' : selected ? 'text-danger font-bold' : 'text-body'}`}
              >
                <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                {option}
                {correct && ' ✓'}
                {selected && <span className="ml-2 text-[10px] uppercase">Ton choix</span>}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  const answer = question.type === 'numeric' ? question.numericAnswer : question.acceptedAnswer;
  return (
    <div
      className={`rounded-xl text-center bg-brand-green/15 border border-brand-green ${compact ? 'p-2' : 'p-6 sm:p-8'}`}
    >
      <p className="text-muted text-[10px] font-bold tracking-[1px] mb-1">BONNE RÉPONSE</p>
      <p
        className={`text-brand-green font-black break-words ${compact ? 'text-lg' : 'text-3xl sm:text-4xl'}`}
      >
        {answer ?? 'Réponse non renseignée'}
      </p>
      {selectedValue && (
        <p className="text-body text-xs mt-1">
          Ta réponse : <b>{selectedValue}</b>
        </p>
      )}
    </div>
  );
}

// ============ UTILITIES ============

function roundLabel(round: QuestionRound): string {
  switch (round) {
    case 'buzzer':
      return 'Manche choix multiple';
    case 'simultaneous':
      return 'Manche simultanée';
    case 'final':
      return 'Finale';
  }
}

function liveStatusLabel(state: GameState): string {
  if (!state.gameStarted || state.phase === 'lobby') return "Le jeu n'a pas commencé";
  if (state.phase === 'game-over') return 'Partie terminée';
  if (state.phase === 'review')
    return `${roundLabel(state.round)} • Réponse à la question ${currentQuestionInRound(state)}`;
  if (state.phase === 'tiebreak') return `Départage • Question ${currentQuestionInRound(state)}`;
  return `${roundLabel(state.round)} • Question ${currentQuestionInRound(state)}`;
}

function currentQuestionInRound(state: GameState): number {
  return state.questionIndex + 1;
}
