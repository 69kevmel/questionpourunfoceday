import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  DEFAULT_SHOW_DATE,
  DEFAULT_SHOW_TIME,
  formatShow,
  parisDateTime,
  upcomingShows,
} from '../lib/schedule';
import {
  displayedScore,
  getCurrentQuestion,
  rankedPlayers,
  timerDuration,
  type GameState,
} from '../lib/game';
import { useGame } from '../lib/gameContext';
import { useCountdown } from '../lib/useCountdown';

export function Timer({ state }: { state: GameState }) {
  const seconds = useCountdown(state.timerEndsAt, state.phase === 'question');
  const { banks } = useGame();
  const question = getCurrentQuestion(state, banks);
  const paused = state.pausedRemainingMs !== null;
  const value = paused ? Math.ceil(state.pausedRemainingMs! / 1000) : seconds;
  const label = paused
    ? 'Partie en pause'
    : state.timerEndsAt === null
      ? 'Le chrono va démarrer'
      : seconds === 0
        ? 'Temps écoulé'
        : 'secondes restantes';
  return (
    <div
      className={`timer-display ${!paused && state.timerEndsAt && seconds <= 5 ? 'is-urgent' : ''}`}
      role="timer"
      aria-label={`${label} ${value}`}
    >
      {(state.timerEndsAt !== null || paused) && (
        <strong>
          {value}
          <span>s</span>
        </strong>
      )}
      <p>{label}</p>
      {question && <progress max={timerDuration(question) / 1000} value={value} aria-label="Temps restant" />}
    </div>
  );
}

export function RoundRules({ state }: { state: GameState }) {
  const text = state.suddenDeath
    ? 'Mort subite : une nouvelle question à la fois. Dès qu’un finaliste prend l’avantage après correction, il gagne.'
    : state.round === 'buzzer'
      ? 'Manche 1 · QCM : choisis puis valide une seule réponse en 15 secondes. Chaque bonne réponse rapporte 1 point.'
      : state.round === 'simultaneous'
        ? 'Manche 2 · Les points se cumulent. Pour un chiffre : 10 secondes, le plus proche gagne 1 point ; à écart égal, le plus rapide gagne. QCM et texte : 15 secondes.'
        : 'Finale · Les deux finalistes repartent à zéro. Seuls les points de finale déterminent le gagnant. En cas d’égalité, place à la mort subite.';
  return (
    <aside className="rules-card">
      <p>{text}</p>
      {state.round !== 'final' && (
        <p className="mt-2 text-muted">
          Les moins bien classés sont éliminés à la fin de la manche. Égalité au seuil : départage oral avec
          l’animateur.
        </p>
      )}
    </aside>
  );
}

export function Scoreboard({ state, playerId }: { state: GameState; playerId?: string }) {
  const { presence, demo } = useGame();
  return (
    <section className="surface">
      <h2>
        {state.round === 'final'
          ? 'Classement de la finale'
          : state.gameStarted
            ? 'Classement général'
            : 'Joueurs inscrits'}
      </h2>
      {state.round === 'final' && (
        <p className="text-muted mb-3">
          Points de finale uniquement. Les joueurs éliminés avant la finale sont exclus de ce classement.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {rankedPlayers(state).map((player, index) => (
          <li key={player.id} className={`score-row ${player.id === playerId ? 'is-you' : ''}`}>
            <span className="text-muted">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <b className="break-words">
                {player.name}
                {player.id === playerId ? ' · toi' : ''}
                {player.id === state.winnerId ? ' 🏆' : ''}
              </b>
              <p className="text-xs text-muted">
                {demo || Object.values(presence[player.id] || {}).some(Boolean)
                  ? '● En ligne'
                  : '○ Hors ligne / présence non confirmée'}
                {state.gameStarted && !state.activePlayerIds.includes(player.id) ? ' · Éliminé' : ''}
              </p>
            </div>
            <strong className="text-brand-green">{displayedScore(state, player.id)} pts</strong>
          </li>
        ))}
      </ol>
      {!state.players.length && (
        <p className="text-muted">Personne pour le moment. Partage le lien pour ouvrir le lobby.</p>
      )}
    </section>
  );
}

export function ShareGame() {
  const url = new URL('/', window.location.href).href;
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 180, margin: 2 })
      .then((image) => {
        if (!cancelled) setQr(image);
      })
      .catch(() => {
        if (!cancelled) setMessage('QR code indisponible ; utilise le lien.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <section className="surface flex flex-wrap items-center gap-5">
      {qr && <img src={qr} width={140} height={140} alt="QR code pour rejoindre la partie" />}
      <div className="min-w-0 flex-1">
        <h2>Inviter les joueurs</h2>
        <label className="text-sm text-muted">
          Lien de participation
          <input readOnly value={url} className="field mt-2" onFocus={(event) => event.target.select()} />
        </label>
        <button
          className="secondary mt-3"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage('Lien copié !');
            } catch {
              setMessage('Sélectionne le lien ci-dessus pour le copier.');
            }
          }}
        >
          Copier le lien
        </button>
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      </div>
    </section>
  );
}

export function ScheduleSettings() {
  const { nextShow, setNextShow, connected } = useGame();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  const [date, setDate] = useState(DEFAULT_SHOW_DATE);
  const [time, setTime] = useState(DEFAULT_SHOW_TIME);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <section className="surface">
      <h2>Calendrier des émissions</h2>
      <p className="text-muted text-sm mb-3">
        Prochaine émission : {formatShow(upcomingShows(now, nextShow, 1)[0])} (Paris). Une émission
        tous les 14 jours. Modifier cette date recale les émissions suivantes.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const iso = parisDateTime(date, time);
            if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0)
              throw new Error('Choisis un dimanche pour le calendrier des émissions.');
            if (Date.parse(iso) <= Date.now()) throw new Error('Choisis une date future.');
            await setNextShow(iso);
            setMessage('Calendrier publié : une émission tous les 14 jours à partir de cette date.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
          } finally {
            setSaving(false);
          }
        }}
        className="flex flex-wrap gap-3 items-end"
      >
        <label className="text-body">
          Premier dimanche
          <input
            required
            type="date"
            className="field"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="text-body">
          Heure de Paris
          <input
            required
            type="time"
            className="field"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <button disabled={!connected || saving} className="action">
          {saving ? 'Enregistrement…' : 'Mettre à jour le calendrier'}
        </button>
        {nextShow && (
          <button
            type="button"
            disabled={!connected || saving}
            className="secondary"
            onClick={async () => {
              setSaving(true);
              try {
                await setNextShow('');
                setMessage(
                  'Calendrier rétabli : un dimanche sur deux depuis le 20 septembre 2026 à 16 h 20.',
                );
              } catch {
                setMessage('Impossible de rétablir le calendrier.');
              } finally {
                setSaving(false);
              }
            }}
          >
            Rétablir le calendrier du 20 septembre
          </button>
        )}
      </form>
      <p className="mt-3 text-sm text-muted" role="status">
        {message}
      </p>
    </section>
  );
}
