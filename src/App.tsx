import { useEffect, useRef, useState } from 'react';
import { onDisconnect, push, ref, remove, set } from 'firebase/database';
import { db } from './firebase';
import poster from './assets/fonceday-poster.webp';
import GameProvider from './components/GameProvider';
import { useGame } from './lib/gameContext';
import { isValidPlayerName } from './lib/game';
import { readLegacyPlayerId, readPlayerSession, returningPlayer, savePlayerSession } from './lib/session';
import { ConsentScreen, HostAuthScreen, SocialLinks } from './components/Brand';
import HostScreen from './components/HostScreen';
import PlayerScreen from './components/PlayerScreen';
import LiveView from './components/LiveView';
import QuestionManager from './components/QuestionManager';
import Rehearsal from './components/Rehearsal';
import { formatShow, upcomingShows } from './lib/schedule';

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
const liveRoute =
  window.location.pathname.replace(/\/+$/, '') === '/live' ||
  new URLSearchParams(window.location.search).get('live') === '1';
type Screen = 'home' | 'join' | 'consent' | 'player' | 'host' | 'auth' | 'questions' | 'live';

export default function App() {
  return (
    <GameProvider demo={demo}>
      <Application />
    </GameProvider>
  );
}

function Application() {
  const { state, banks, connected, loading, error, demo, update, nextShow } = useGame();
  const [session, setSession] = useState(readPlayerSession);
  const [legacyId] = useState(readLegacyPlayerId);
  const [screen, setScreen] = useState<Screen>(() =>
    demo ? 'host' : liveRoute ? 'live' : readPlayerSession() || readLegacyPlayerId() ? 'player' : 'home',
  );
  const [name, setName] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [registering, setRegistering] = useState(false);
  const registeringRef = useRef(false);
  const [demoPlayer, setDemoPlayer] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [presenceError, setPresenceError] = useState('');
  const [hostAuthed, setHostAuthed] = useState(demo);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  const clicks = useRef({ count: 0, time: 0 });
  const returning =
    returningPlayer(state, session) ||
    (!session ? state.players.find((player) => player.id === legacyId) : undefined);
  const returningId = returning?.id;
  const playerId = demo ? demoPlayer : returning?.id;
  useEffect(() => {
    if (!demo && returningId) {
      const player = state.players.find((item) => item.id === returningId);
      if (player) savePlayerSession({ gameId: state.gameId, playerId: player.id, name: player.name });
    }
  }, [demo, returningId, state.gameId, state.players]);

  useEffect(() => {
    if (demo || !db || !connected || !returningId) return;
    const connection = push(ref(db, `fonceday-presence/${state.gameId}/${returningId}`));
    const disconnect = onDisconnect(connection);
    let cancelled = false;
    void (async () => {
      try {
        await disconnect.remove();
        if (cancelled) {
          await disconnect.cancel();
          return;
        }
        await set(connection, true);
        if (cancelled) await remove(connection);
        else setPresenceError('');
      } catch {
        if (!cancelled)
          setPresenceError('Le suivi de présence est indisponible. Tes réponses restent utilisables.');
      }
    })();
    return () => {
      cancelled = true;
      void remove(connection)
        .then(() => disconnect.cancel())
        .catch(() => {});
    };
  }, [demo, connected, returningId, state.gameId]);

  async function register() {
    if (registeringRef.current || !connected) return;
    registeringRef.current = true;
    setRegistering(true);
    setRegistrationError('');
    const trimmed = name.trim();
    const id = crypto.randomUUID();
    const gameId = state.gameId;
    try {
      const success = await update((current) => {
        if (
          current.gameId !== gameId ||
          current.gameStarted ||
          current.players.length >= 15 ||
          !isValidPlayerName(trimmed) ||
          current.players.some(
            (player) => player.name.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'),
          )
        )
          return current;
        return {
          ...current,
          players: [...current.players, { id, name: trimmed, score: 0 }],
          activePlayerIds: [...current.activePlayerIds, id],
        };
      });
      if (!success) {
        setRegistrationError(
          'Inscription impossible : pseudo déjà pris, partie complète ou déjà démarrée. Choisis un autre pseudo ou regarde le live.',
        );
        return;
      }
      const saved = { gameId, playerId: id, name: trimmed };
      savePlayerSession(saved);
      setSession(saved);
      setScreen('player');
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Inscription impossible. Réessaie.');
    } finally {
      registeringRef.current = false;
      setRegistering(false);
    }
  }

  const status = loading
    ? 'Connexion à la partie…'
    : !connected
      ? 'Reconnexion en cours…'
      : state.phase === 'game-over'
        ? 'Partie terminée'
        : state.gameStarted
          ? 'Partie en cours'
          : state.players.length >= 15
            ? 'Partie complète'
            : 'Inscriptions ouvertes';
  const shows = upcomingShows(now, nextShow);
  const joinable = connected && !loading && !state.gameStarted && state.players.length < 15;

  function openHost() {
    const now = Date.now();
    clicks.current = { count: now - clicks.current.time < 600 ? clicks.current.count + 1 : 1, time: now };
    if (clicks.current.count === 3) {
      setScreen(hostAuthed ? 'host' : 'auth');
      clicks.current.count = 0;
    }
  }

  let content;
  if (screen === 'auth')
    content = (
      <HostAuthScreen
        onAuth={() => {
          setHostAuthed(true);
          setScreen('host');
        }}
        onBack={() => setScreen('home')}
      />
    );
  else if (screen === 'host' && hostAuthed)
    content = <HostScreen onQuestions={() => setScreen('questions')} onLive={() => setScreen('live')} />;
  else if (screen === 'questions' && hostAuthed && !demo && !state.gameStarted)
    content = <QuestionManager onExit={() => setScreen('host')} />;
  else if (screen === 'live')
    content = (
      <LiveView
        gameState={state}
        banks={banks}
        onExit={liveRoute ? undefined : () => setScreen(hostAuthed ? 'host' : 'home')}
      />
    );
  else if (screen === 'player' && loading)
    content = (
      <main className="page narrow">
        <section className="surface">
          <h1>Reprise de ta partie…</h1>
          <p>Nous retrouvons ta place.</p>
        </section>
      </main>
    );
  else if (screen === 'player' && playerId)
    content = (
      <>
        <div className="page narrow pb-0">
          <button className="secondary" onClick={() => setScreen('home')}>
            Accueil
          </button>
        </div>
        <PlayerScreen
          key={`${state.gameId}-${state.round}-${state.suddenDeath}-${state.questionIndex}-${state.questionRevision}-${playerId}`}
          playerId={playerId}
        />
      </>
    );
  else if (screen === 'join')
    content = (
      <main className="page narrow">
        <button className="secondary self-start" onClick={() => setScreen('home')}>
          Retour
        </button>
        <section className="surface">
          <h1>Rejoindre la partie</h1>
          <p className="text-muted mb-5">Ton pseudo sera visible sur le direct.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (isValidPlayerName(name) && joinable) {
                setRegistrationError('');
                setScreen('consent');
              }
            }}
          >
            <label className="text-body">
              Ton pseudo
              <input
                autoFocus
                className="field mt-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
              />
            </label>
            <p className="text-muted text-sm mt-2">2 à 20 caractères, sans . # $ [ ] ou /</p>
            <button className="action mt-4 w-full" disabled={!isValidPlayerName(name) || !joinable}>
              Continuer
            </button>
          </form>
          {!joinable && <p className="error-banner">{status}</p>}
        </section>
      </main>
    );
  else if (screen === 'consent')
    content = (
      <>
        <div className="page narrow pb-0">
          {registrationError && (
            <p role="alert" className="error-banner">
              {registrationError}
            </p>
          )}
          {registering && <p role="status">Inscription en cours…</p>}
          <button className="secondary" disabled={registering} onClick={() => setScreen('join')}>
            Modifier mon pseudo
          </button>
        </div>
        <fieldset disabled={registering || !connected}>
          <ConsentScreen
            playerName={name}
            onAccept={() => void register()}
            onReject={() => setScreen('join')}
          />
        </fieldset>
      </>
    );
  else
    content = (
      <main className="home-layout">
        <button onClick={openHost} className="poster-button" aria-label="Affiche Questions pour un Fonceday">
          <img src={poster} alt="Questions pour un Fonceday" />
        </button>
        <section className="home-content">
          <p className="eyebrow">Questions pour un Fonceday</p>
          <h1>
            Le quiz en direct
            <br />
            de Kanaé
          </h1>
          <p className="home-intro">
            3 manches, jusqu’à 15 joueurs,
            <br />
            une finale à deux.
          </p>
          <p role="status" className="session-status">
            <span />
            {status}
            {!state.gameStarted && connected ? ` · ${state.players.length}/15 inscrits` : ''}
          </p>
          <div className="flex flex-col gap-3">
            {returning && (
              <button className="action" onClick={() => setScreen('player')}>
                Reprendre ma partie · {returning.name}
              </button>
            )}
            {!returning && (
              <button className="action" disabled={!joinable} onClick={() => setScreen('join')}>
                Rejoindre la partie
              </button>
            )}
            <a href="/live" className="secondary text-center">
              Regarder le live
            </a>
            <button className="text-link" aria-expanded={showRules} onClick={() => setShowRules(!showRules)}>
              Voir les règles {showRules ? '−' : '+'}
            </button>
          </div>
          {session && !returning && !loading && (
            <p className="text-muted text-sm">
              Ta précédente inscription n’est plus active. Rejoins une nouvelle partie lorsque les
              inscriptions sont ouvertes.
            </p>
          )}
          {showRules && (
            <div className="rules-card">
              <p>
                <b>1. QCM :</b> 15 secondes, une réponse validée, +1 point si elle est correcte.
              </p>
              <p>
                <b>2. Simultanée :</b> pour les chiffres, 10 secondes ; le plus proche gagne, puis le plus
                rapide à écart égal. Les points des deux manches se cumulent.
              </p>
              <p>
                <b>3. Finale :</b> deux joueurs, scores remis à zéro. À égalité, questions de réserve une par
                une jusqu’à un gagnant.
              </p>
              <p>
                Les égalités d’élimination sont départagées oralement. Les réponses libres sont validées par
                l’animateur. Ton pseudo et tes résultats sont diffusés.
              </p>
            </div>
          )}
          <div className="next-show">
            <p className="eyebrow">Prochaine émission</p>
            <p>
              <time dateTime={shows[0]}>{formatShow(shows[0])}</time> · heure de Paris
            </p>
            <p className="text-muted text-sm mt-2">Un dimanche sur deux.</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer">Voir les prochaines émissions</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {shows.slice(1).map((show) => (
                  <li key={show}>
                    <time dateTime={show}>{formatShow(show)}</time>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-2">Horaires de Paris, puis tous les 14 jours.</p>
            </details>
          </div>
          <SocialLinks />
          <button
            className="text-link text-xs self-start"
            onClick={() => setScreen(hostAuthed ? 'host' : 'auth')}
          >
            Espace animateur
          </button>
        </section>
      </main>
    );

  return (
    <div className="app-bg min-h-screen text-body">
      {demo && (
        <Rehearsal
          onPlayer={(id) => {
            setDemoPlayer(id);
            setScreen('player');
          }}
          onHost={() => setScreen('host')}
          onLive={() => setScreen('live')}
        />
      )}
      {(!connected || error || presenceError) && (
        <div className="connection-banner" role="status">
          {error ||
            (!connected
              ? 'Reconnexion en cours… Ta place est conservée. Attends la confirmation avant de répondre.'
              : presenceError)}
        </div>
      )}
      {content}
    </div>
  );
}
