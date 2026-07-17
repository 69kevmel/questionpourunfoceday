import { useState, useEffect, useRef } from 'react';
import { ref, onValue, set as dbSet, runTransaction } from 'firebase/database';
import { db, isFirebaseConfigured } from './firebase';
import buzzSoundUrl from './assets/dry-cough-soundbible.mp3';
import fonceyPosterUrl from './assets/fonceday-poster.webp';
import QuestionManager from './components/QuestionManager';
import { loadQuestions } from './lib/questionManager';
import { defaultQuestions } from './data/defaultQuestions';

const STATE_PATH = 'fonceday-game-state';
const SOCIAL_LINK = 'https://linktr.ee/kanaeclub?utm_source=linktree_profile_share&ltsid=f022cf4b-fffb-4e58-9fb5-8ee79d86e340';

interface MancheConfig {
  manche: number;
  questions: number;
}

const MANCHES_CONFIG: MancheConfig[] = [
  { manche: 1, questions: 9 },
  { manche: 2, questions: 8 },
  { manche: 3, questions: 8 },
];

interface Player {
  name: string;
  score: number;
}

interface CurrentBuzz {
  name: string;
  ts: number;
}

interface LastElimination {
  manche: number;
  eliminatedNames: string[];
  remaining: number;
}

interface GameState {
  players: Player[];
  activePlayers: string[];
  currentManche: number;
  currentQuestionIndex: number;
  currentBuzz: CurrentBuzz | null;
  gameStarted: boolean;
  showOptions: boolean;
  showAnswerReview: boolean;
  lastElimination: LastElimination | null;
  // Joueurs ayant déjà buzzé et répondu faux sur la question en cours : ils ne
  // peuvent plus rebuzzer pour CETTE question, mais la liste est réinitialisée
  // à chaque nouvelle question.
  wrongBuzzers: string[];
}

type SaveGameState = (newState: GameState) => Promise<void>;

type Role = 'host' | 'join' | 'consent' | 'lobby' | null;

// Instance réutilisée pour éviter de recharger le fichier à chaque buzz.
const buzzAudio = typeof Audio !== 'undefined' ? new Audio(buzzSoundUrl) : null;

function playBuzzSound() {
  if (!buzzAudio) return;
  try {
    buzzAudio.currentTime = 0;
    void buzzAudio.play();
  } catch (e) {
    console.error('Son disabled:', e);
  }
}

function initGameState(): GameState {
  return {
    players: [],
    activePlayers: [],
    currentManche: 1,
    currentQuestionIndex: 0,
    currentBuzz: null,
    gameStarted: false,
    showOptions: false,
    showAnswerReview: false,
    lastElimination: null,
    wrongBuzzers: [],
  };
}

// Merge défensif : garantit qu'un objet reçu de Firebase (potentiellement
// partiel, par exemple si un seul champ a été écrit via une transaction avant
// que l'état complet n'existe) est toujours un GameState entièrement valide,
// pour éviter tout crash de rendu (écran blanc) sur un champ manquant.
function normalizeGameState(raw: unknown): GameState {
  const base = initGameState();
  if (!raw || typeof raw !== 'object') return base;
  const partial = raw as Partial<GameState>;
  return {
    ...base,
    ...partial,
    players: Array.isArray(partial.players) ? partial.players : base.players,
    activePlayers: Array.isArray(partial.activePlayers) ? partial.activePlayers : base.activePlayers,
    wrongBuzzers: Array.isArray(partial.wrongBuzzers) ? partial.wrongBuzzers : base.wrongBuzzers,
  };
}

// ============ LOGIQUE D'ÉLIMINATION ============
// Calcule combien de joueurs doivent rester actifs après la manche qui vient
// de se terminer, en fonction du nombre de manches restantes, de façon à ce
// qu'il ne reste qu'un seul joueur actif après la toute dernière manche.
function computeEliminationTarget(activeCount: number, manchesRemaining: number): number {
  if (activeCount <= 1) return activeCount;
  if (manchesRemaining <= 0) return 1;
  const target = Math.ceil((activeCount * manchesRemaining) / (manchesRemaining + 1));
  return Math.max(1, Math.min(activeCount, target));
}

// Détermine qui est éliminé à la fin de `completedManche`, en se basant sur
// le score total des joueurs encore actifs (les moins bons scores sont
// éliminés en premier).
function computeEliminationForManche(
  gameState: GameState,
  completedManche: number
): { activePlayers: string[]; eliminatedNames: string[] } {
  const activeNames = gameState.activePlayers || [];
  if (activeNames.length <= 1) {
    return { activePlayers: activeNames, eliminatedNames: [] };
  }
  const manchesRemaining = Math.max(0, MANCHES_CONFIG.length - completedManche);
  const target = computeEliminationTarget(activeNames.length, manchesRemaining);
  if (target >= activeNames.length) {
    return { activePlayers: activeNames, eliminatedNames: [] };
  }
  const activePlayersData = (gameState.players || []).filter((p) => activeNames.includes(p.name));
  // Tri décroissant par score ; en cas d'égalité, on garde l'ordre d'arrivée existant.
  const rankedDesc = [...activePlayersData].sort((a, b) => b.score - a.score);
  const kept = rankedDesc.slice(0, target).map((p) => p.name);
  const eliminatedNames = activeNames.filter((n) => !kept.includes(n));
  return { activePlayers: kept, eliminatedNames };
}

function isPlayerEliminated(gameState: GameState, playerName: string): boolean {
  if (!gameState.gameStarted) return false;
  if ((gameState.activePlayers || []).includes(playerName)) return false;
  return (gameState.players || []).some((p) => p.name === playerName);
}

function getQuestionsInManche(manche: number): number {
  return MANCHES_CONFIG[manche - 1]?.questions || 0;
}

function getQuestionInManche(gameState: GameState): number {
  let count = 0;
  for (let i = 1; i < gameState.currentManche; i++) {
    count += getQuestionsInManche(i);
  }
  return gameState.currentQuestionIndex - count + 1;
}

function getCurrentQuestion(gameState: GameState, questions: Question[]): Question | null {
  return questions[gameState.currentQuestionIndex] || null;
}

export default function FoncedayLive() {
  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>(defaultQuestions);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connecting, setConnecting] = useState(isFirebaseConfigured);
  const [syncError, setSyncError] = useState(false);
  const [hostAuth, setHostAuth] = useState(false);
  const [showQuestionManager, setShowQuestionManager] = useState(false);
  // Portail d'accès animateur, ouvert en triple-cliquant sur le titre de
  // l'écran d'accueil (le bouton "animateur" a été retiré pour ne pas être
  // visible/cliquable par les joueurs).
  const [hostGateOpen, setHostGateOpen] = useState(false);
  const titleClicksRef = useRef(0);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La vue live (overlay de streaming/OBS) est accessible uniquement via une
  // URL dédiée (ex: https://.../?live=1), sans mot de passe : pratique pour
  // configurer une source navigateur OBS une bonne fois pour toutes.
  const [isLiveUrlView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('live') === '1';
  });

  // Synchronisation temps réel via Firebase Realtime Database : chaque
  // appareil (animateur, joueurs, vue live) écoute le même chemin et reçoit
  // les mises à jour instantanément, sans polling.
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      return;
    }
    const stateRef = ref(db, STATE_PATH);
    const unsubscribe = onValue(
      stateRef,
      (snapshot) => {
        setGameState(normalizeGameState(snapshot.val()));
        setConnecting(false);
        setSyncError(false);
      },
      (error) => {
        console.error('Erreur de synchronisation Firebase', error);
        setConnecting(false);
        setSyncError(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Chargement des questions depuis Firebase (ou seed par défaut)
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    return loadQuestions(setLoadedQuestions);
  }, []);

  async function saveGameState(newState: GameState) {
    if (!db) {
      console.error("Firebase n'est pas configuré, impossible de sauvegarder l'état.");
      return;
    }
    try {
      await dbSet(ref(db, STATE_PATH), newState);
      setGameState(newState);
    } catch (e) {
      console.error('Save failed', e);
      setSyncError(true);
    }
  }

  // Triple-click discret sur le titre pour ouvrir l'accès animateur (mot de
  // passe requis juste après). Évite d'exposer un bouton "animateur" visible.
  function handleTitleClick() {
    titleClicksRef.current += 1;
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);

    if (titleClicksRef.current === 3) {
      setHostGateOpen(true);
      titleClicksRef.current = 0;
    }

    titleTimeoutRef.current = setTimeout(() => {
      titleClicksRef.current = 0;
    }, 500);
  }

  if (!isFirebaseConfigured) {
    return <FirebaseSetupNotice />;
  }

  if (connecting) {
    return <ConnectingScreen />;
  }

  if (syncError && !gameState) {
    return <SyncErrorScreen />;
  }

  // Vue Live - affichage pour le streaming (OBS), accessible via ?live=1
  if (isLiveUrlView && gameState) {
    return <LiveView gameState={gameState} />;
  }

  if (hostGateOpen && !hostAuth) {
    return (
      <HostAuthScreen
        onAuth={() => {
          setHostAuth(true);
          setHostGateOpen(false);
          setRole('host');
        }}
        onBack={() => setHostGateOpen(false)}
      />
    );
  }

  if (!role) return <RoleSelect setRole={setRole} onTitleClick={handleTitleClick} />;
  if (role === 'join')
    return (
      <NameInput
        nameInput={nameInput}
        setNameInput={setNameInput}
        onSubmit={() => {
          setName(nameInput.trim());
          setRole('consent');
        }}
      />
    );
  if (role === 'consent')
    return (
      <ConsentScreen
        playerName={name}
        onAccept={() => setRole('lobby')}
        onReject={() => {
          setName('');
          setNameInput('');
          setRole('join');
        }}
      />
    );

  if (role === 'lobby' && gameState) {
    const isActivePlayer = gameState.activePlayers.includes(name);
    const wasRegistered = (gameState.players || []).some((p) => p.name === name);
    const hasGameStarted = gameState.gameStarted;
    if (isActivePlayer && hasGameStarted) return <PlayerView gameState={gameState} playerName={name} />;
    else if (!hasGameStarted) return <LobbyPlayerView gameState={gameState} playerName={name} />;
    // Un joueur éliminé atterrit sur la vue live (comme le stream), avec en
    // plus ses stats personnelles (classement, score, manche d'élimination).
    else if (wasRegistered) return <LiveView gameState={gameState} eliminatedPlayerName={name} />;
    else return <SpectatorView gameState={gameState} />;
  }

  if (role === 'host' && gameState) return showQuestionManager ? <QuestionManager onExit={() => setShowQuestionManager(false)} /> : <HostView gameState={gameState} saveGameState={saveGameState} loadedQuestions={loadedQuestions} onManageQuestions={() => setShowQuestionManager(true)} />;
  return null;
}

function FirebaseSetupNotice() {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <div className="relative z-10 w-full max-w-md flex flex-col gap-4">
        <h2 className="text-2xl font-bold font-heading text-danger">⚠️ Synchronisation non configurée</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-danger-dark/33 text-left">
          <p className="text-body text-sm mb-3">
            Les variables Firebase (<code className="text-gold">VITE_FIREBASE_*</code>) sont manquantes. Sans elles, chaque appareil
            aurait sa propre partie isolée et les joueurs ne se verraient jamais entre eux.
          </p>
          <p className="text-muted text-[13px] mb-2">Pour corriger ça :</p>
          <ol className="text-muted text-[13px] leading-[1.7] pl-5 list-decimal">
            <li>Crée un projet Firebase gratuit (console.firebase.google.com)</li>
            <li>Active "Realtime Database"</li>
            <li>
              Copie <code className="text-gold">.env.example</code> vers <code className="text-gold">.env</code> et renseigne les
              valeurs
            </li>
            <li>Redémarre le serveur (ou redéploie sur Vercel avec les mêmes variables d'environnement)</li>
          </ol>
        </div>
        <p className="text-faint text-xs">Voir le README du projet pour le détail des étapes.</p>
      </div>
    </div>
  );
}

function ConnectingScreen() {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <p className="text-gold text-lg font-bold font-heading">Connexion en cours...</p>
        <p className="text-muted text-sm">Synchronisation avec la partie</p>
      </div>
    </div>
  );
}

function SyncErrorScreen() {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-3 max-w-sm">
        <p className="text-danger text-lg font-bold font-heading">⚠️ Connexion impossible</p>
        <p className="text-muted text-sm">
          Impossible de joindre le serveur de synchronisation. Vérifie ta connexion internet et réessaie.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-6 py-2 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

function RoleSelect({ setRole, onTitleClick }: { setRole: (r: Role) => void; onTitleClick: () => void }) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <img
        src={fonceyPosterUrl}
        alt="Questions pour un Fonceday"
        onClick={onTitleClick}
        className="relative z-10 w-full max-w-xs sm:max-w-sm cursor-pointer select-none rounded-2xl mb-8 [box-shadow:0_0_40px_rgba(57,255,106,0.25)]"
        draggable={false}
      />
      <div className="relative z-10 flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => setRole('join')}
          className="py-4 rounded-2xl font-bold text-base transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
        >
          Je suis un fonceday
        </button>
      </div>
      <SocialLinks />
    </div>
  );
}

function SocialLinks() {
  const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'currentColor' };
  return (
    <div className="relative z-10 flex items-center gap-4 mt-10">
      <a
        href={SOCIAL_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10"
      >
        <svg {...iconProps}>
          <path d="M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2.01 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 21.99 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43-.26-.66-.6-1.22-1.16-1.77-.55-.56-1.11-.9-1.77-1.16-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.5.21 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.13.36.3.88.34 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.5-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.13-.88.3-1.86.34-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.5-.21-1.86-.34-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.13-.36-.3-.88-.34-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.04-.98.21-1.5.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.13.88-.3 1.86-.34 1.05-.05 1.37-.06 4.04-.06zm0 3.06a5.14 5.14 0 100 10.28 5.14 5.14 0 000-10.28zm0 8.48a3.34 3.34 0 110-6.68 3.34 3.34 0 010 6.68zm5.34-8.68a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z" />
        </svg>
      </a>
      <a
        href={SOCIAL_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Twitch"
        className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10"
      >
        <svg {...iconProps}>
          <path d="M4.3 2 2 7.6v12.1h5.2V22l3.1-2.3h3.7L20 14V2H4.3zm14 11.3-3.1 3.1h-3.7L8.4 19v-2.6H4.6V3.7h13.7v9.6z" />
          <path d="M15.9 6.6h1.7v5.2h-1.7zM11.2 6.6h1.7v5.2h-1.7z" />
        </svg>
      </a>
      <a
        href={SOCIAL_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Discord"
        className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10"
      >
        <svg {...iconProps}>
          <path d="M20.32 5.37a17.9 17.9 0 0 0-4.43-1.37.07.07 0 0 0-.07.03c-.19.34-.4.78-.55 1.13a16.5 16.5 0 0 0-4.94 0 8.3 8.3 0 0 0-.56-1.13.07.07 0 0 0-.07-.03c-1.53.26-3 .72-4.43 1.37a.06.06 0 0 0-.03.03C2.99 9.24 2.32 12.98 2.65 16.68a.08.08 0 0 0 .03.05 18 18 0 0 0 5.43 2.75.07.07 0 0 0 .08-.03c.42-.57.79-1.18 1.11-1.81a.07.07 0 0 0-.04-.1 11.9 11.9 0 0 1-1.7-.81.07.07 0 0 1-.01-.12c.11-.09.23-.18.34-.27a.07.07 0 0 1 .07-.01c3.57 1.63 7.44 1.63 10.97 0a.07.07 0 0 1 .07.01c.11.09.22.18.34.27a.07.07 0 0 1-.01.12c-.54.32-1.11.58-1.7.81a.07.07 0 0 0-.04.1c.33.63.7 1.24 1.11 1.81a.07.07 0 0 0 .08.03 17.9 17.9 0 0 0 5.44-2.75.07.07 0 0 0 .03-.05c.4-4.28-.66-7.99-2.79-11.28a.06.06 0 0 0-.03-.03zM9.68 14.4c-1.07 0-1.95-.98-1.95-2.19 0-1.2.86-2.18 1.95-2.18 1.1 0 1.97.99 1.95 2.18 0 1.21-.86 2.19-1.95 2.19zm5.66 0c-1.07 0-1.95-.98-1.95-2.19 0-1.2.86-2.18 1.95-2.18 1.1 0 1.97.99 1.95 2.18 0 1.21-.85 2.19-1.95 2.19z" />
        </svg>
      </a>
    </div>
  );
}

function HostAuthScreen({ onAuth, onBack }: { onAuth: () => void; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const CORRECT_PASSWORD = 'jetebaise';
  function handleSubmit() {
    if (password === CORRECT_PASSWORD) {
      setError(false);
      onAuth();
    } else {
      setError(true);
      setPassword('');
    }
  }
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center font-heading text-gold">Accès animateur</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-brand-green/20">
          <p className="text-sm mb-4 text-center text-body">Entrez le mot de passe animateur</p>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Mot de passe"
            className={`w-full px-4 py-3 rounded-xl text-center outline-none mb-3 bg-panel text-ink border ${
              error ? 'border-danger-border' : 'border-brand-green/33'
            }`}
          />
          {error && <p className="text-danger text-[13px] text-center mb-3">Mot de passe incorrect</p>}
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 mb-3 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
          >
            Accéder
          </button>
          <button
            onClick={onBack}
            className="w-full py-2 rounded-xl font-bold transition-transform active:scale-95 bg-[#64646433] text-muted border border-line"
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}

function NameInput({
  nameInput,
  setNameInput,
  onSubmit,
}: {
  nameInput: string;
  setNameInput: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-4">
        <p className="text-center mb-2 text-body">Ton pseudo pour la partie</p>
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Pseudo"
          maxLength={20}
          className="px-4 py-3 rounded-xl text-center outline-none bg-panel border border-brand-green/33 text-ink"
        />
        <button
          disabled={!nameInput.trim()}
          onClick={onSubmit}
          className="py-3 rounded-xl font-bold disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
        >
          Entrer
        </button>
      </div>
    </div>
  );
}

function ConsentScreen({
  playerName,
  onAccept,
  onReject,
}: {
  playerName: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-md flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center font-heading text-gold">Consentement</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-brand-green/20">
          <p className="text-sm leading-[1.6] mb-3 text-body">
            Bienvenue <b className="text-gold">{playerName}</b> !
          </p>
          <div className="text-muted text-[13px] leading-[1.7]">
            <p className="mb-3 text-body">En participant à ce jeu, vous acceptez que :</p>
            <ul className="mb-3 pl-5 list-disc">
              <li className="mb-2">
                Votre pseudonyme et votre performance seront <b>diffusés en direct</b> sur Twitch
              </li>
              <li className="mb-2">
                Votre nom/pseudo pourra apparaître dans des <b>rediffusions YouTube</b>, <b>Instagram</b>, TikTok ou autres réseaux sociaux
              </li>
              <li className="mb-2">Les contenus vidéo peuvent être réutilisés pour la promotion ou l'archivage</li>
              <li>Vous consentez à cette utilisation en jouant</li>
            </ul>
            <p className="text-faint text-xs">Si vous refusez, veuillez quitter maintenant.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={onAccept}
            className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
          >
            ✓ J'accepte et je joue
          </button>
          <button
            onClick={onReject}
            className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-danger-strong/20 text-danger border border-danger-dark"
          >
            ✗ Je refuse
          </button>
        </div>
        <p className="text-faint text-[11px] text-center leading-[1.5]">Merci de votre compréhension. Amusez-vous bien ! 🎮</p>
      </div>
    </div>
  );
}

function LobbyPlayerView({ gameState, playerName }: { gameState: GameState; playerName: string }) {
  const registeredRef = useRef(false);
  useEffect(() => {
    if (registeredRef.current) return;
    const alreadyKnown = (gameState.players || []).some((p) => p.name === playerName);
    if (alreadyKnown) {
      registeredRef.current = true;
      return;
    }
    if (!db) return;
    let cancelled = false;
    async function registerPlayer() {
      // Transaction atomique sur l'état complet (et pas seulement sur le champ
      // "players") : même si aucune partie n'a encore jamais été sauvegardée
      // dans Firebase, la transaction part d'un GameState par défaut bien
      // formé plutôt que de laisser un document partiel/incomplet qui ferait
      // planter les autres vues (host, live...) sur un champ manquant.
      // Elle garantit aussi que deux joueurs qui s'inscrivent au même instant
      // ne s'écrasent pas l'un l'autre.
      const stateRef = ref(db!, STATE_PATH);
      await runTransaction(stateRef, (current: unknown) => {
        const base = normalizeGameState(current);
        if (base.players.some((p) => p.name === playerName)) return base;
        return { ...base, players: [...base.players, { name: playerName, score: 0 }] };
      });
      if (!cancelled) registeredRef.current = true;
    }
    registerPlayer();
    return () => {
      cancelled = true;
    };
  }, [playerName, gameState.players]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);

  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        <h1 className="text-[32px] font-bold font-heading text-gold">Lobby</h1>
        <div className="w-full rounded-2xl p-6 text-center bg-panel/80 border border-brand-green/27">
          <p className="text-sm mb-3 text-body">
            Bienvenue <b className="text-gold">{playerName}</b> !
          </p>
          <p className="text-[13px] text-muted">En attente du démarrage... 🎮</p>
        </div>
        <div className="w-full rounded-xl p-4 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-2">Joueurs connectés ({allPlayers.length})</p>
          <div className="flex flex-col gap-2">
            {sorted.map((player) => (
              <div key={player.name} className="px-4 py-2 rounded-lg bg-black/30">
                <p className="text-body text-sm">
                  {player.name === playerName && '✓ '} {player.name}
                </p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-line text-xs text-center">L'animateur va bientôt lancer le jeu...</p>
      </div>
    </div>
  );
}

function SpectatorView({ gameState }: { gameState: GameState }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-md">
        <h2 className="text-2xl font-bold font-heading text-gold">Spectateur 👀</h2>
        <div className="w-full rounded-2xl p-6 text-center bg-panel/80 border border-gold-dark/33">
          <p className="text-sm mb-1 text-body">Le jeu a démarré !</p>
          <p className="text-xs text-muted">
            Manche {gameState.currentManche}/3 — Q{getQuestionInManche(gameState)}/{getQuestionsInManche(gameState.currentManche)}
          </p>
        </div>
        <div className="w-full rounded-xl p-4 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-2">Classement en direct</p>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {sorted.map((player, idx) => {
              const eliminated = isPlayerEliminated(gameState, player.name);
              return (
                <div
                  key={player.name}
                  className={`flex justify-between items-center p-3 rounded-lg bg-black/30 ${eliminated ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted font-bold min-w-[25px]">#{idx + 1}</span>
                    <span className="text-gold">
                      {player.name}
                      {eliminated && ' ❌'}
                    </span>
                  </div>
                  <span className="text-brand-green font-bold">{player.score}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-line text-[11px] text-center">Tu ne peux pas jouer, mais tu peux suivre les stats en direct ! 📊</p>
      </div>
    </div>
  );
}

function PlayerView({ gameState, playerName }: { gameState: GameState; playerName: string }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  useEffect(() => {
    if (gameState.currentBuzz && !prevBuzzRef.current && gameState.currentBuzz.name !== playerName) {
      playBuzzSound();
    }
    prevBuzzRef.current = gameState.currentBuzz;
  }, [gameState.currentBuzz, playerName]);

  const allPlayers = gameState.players || [];
  const playerScore = allPlayers.find((p) => p.name === playerName)?.score || 0;
  const playerRank = [...allPlayers].sort((a, b) => b.score - a.score).findIndex((p) => p.name === playerName) + 1;
  const iBuzzed = gameState.currentBuzz && gameState.currentBuzz.name === playerName;
  const someoneElseBuzzed = gameState.currentBuzz && gameState.currentBuzz.name !== playerName;
  // Le joueur a déjà buzzé et répondu faux sur CETTE question : il ne peut
  // plus rebuzzer tant que la question n'a pas changé.
  const alreadyWrong = (gameState.wrongBuzzers || []).includes(playerName);
  const question = getCurrentQuestion(gameState, loadedQuestions);

  async function handleBuzz() {
    if (gameState.currentBuzz || alreadyWrong || !db) return;
    playBuzzSound();
    // Transaction atomique : si deux joueurs buzzent au même instant, seul le
    // premier arrivé côté serveur Firebase l'emporte réellement.
    const buzzRef = ref(db, `${STATE_PATH}/currentBuzz`);
    await runTransaction(buzzRef, (current: CurrentBuzz | null) => {
      if (current) return current;
      return { name: playerName, ts: Date.now() };
    });
  }

  const buzzDisabled = !!gameState.currentBuzz || alreadyWrong;
  const buzzBg = gameState.currentBuzz
    ? iBuzzed
      ? 'bg-linear-to-br from-gold to-gold-dark'
      : 'bg-buzzed'
    : alreadyWrong
      ? 'bg-buzzed'
      : 'bg-linear-to-br from-brand-green to-brand-green-dark';
  const buzzText = 'text-dark-ink';
  const buzzShadow = !buzzDisabled ? 'shadow-[0_0_50px_rgba(57,255,106,0.55),0_10px_30px_rgba(0,0,0,0.5)]' : '';

  let buzzLabel = 'BUZZ';
  if (gameState.currentBuzz) {
    buzzLabel = iBuzzed ? "C'EST TOI !" : 'BUZZÉ';
  } else if (alreadyWrong) {
    buzzLabel = 'DÉJÀ TENTÉ';
  }

  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
        <div className="text-[13px] text-center text-muted">
          <b className="text-gold">{playerName}</b> • Manche {gameState.currentManche}/3 Q{getQuestionInManche(gameState)}/
          {getQuestionsInManche(gameState.currentManche)}
        </div>
        {question && (
          <div className="w-full max-w-md rounded-xl p-4 mb-4 bg-panel/70 border border-brand-green/20">
            <p className="text-sm font-bold mb-2 text-center text-gold">{question.question}</p>
            {gameState.showAnswerReview ? (
              <div className="flex flex-col gap-2">
                {question.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-2 rounded-lg text-sm border ${
                      idx === question.correct
                        ? 'bg-brand-green/25 border-brand-green text-brand-green font-bold'
                        : 'bg-black/30 border-transparent text-body'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}. {opt} {idx === question.correct && '✅'}
                  </div>
                ))}
              </div>
            ) : gameState.showOptions ? (
              <div className="flex flex-col gap-2">
                {question.options.map((opt, idx) => (
                  <div key={idx} className="px-3 py-2 rounded-lg text-sm bg-black/30 text-body">
                    {String.fromCharCode(65 + idx)}. {opt}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg text-center bg-brand-green/8 border border-dashed border-brand-green/33">
                <p className="text-[13px] font-bold text-muted">❓ Réponses cachées</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleBuzz}
          disabled={buzzDisabled}
          className={`rounded-full flex items-center justify-center font-black transition-transform active:scale-95 disabled:active:scale-100 w-[200px] h-[200px] text-[28px] border-4 border-white/15 ${buzzBg} ${buzzText} ${buzzShadow}`}
        >
          {buzzLabel}
        </button>
        <p className="text-muted min-h-[20px] text-sm text-center">
          {someoneElseBuzzed && `${gameState.currentBuzz!.name} a buzzé`}
          {!gameState.currentBuzz && alreadyWrong && "Tu t'es déjà trompé sur cette question, attends la suivante"}
        </p>
        <div className="mt-6 w-full max-w-xs text-center p-4 rounded-xl bg-panel/70 border border-brand-green/20">
          <p className="text-muted text-xs mb-1.5">Ton classement</p>
          <p className="text-3xl font-black text-gold mb-1">#{playerRank}</p>
          <p className="text-brand-green text-base font-bold">{playerScore} pts</p>
        </div>
      </div>
    </div>
  );
}

function HostView({ gameState, saveGameState, loadedQuestions, onManageQuestions }: { gameState: GameState; saveGameState: SaveGameState; loadedQuestions: Question[]; onManageQuestions: () => void }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  useEffect(() => {
    if (gameState.currentBuzz && !prevBuzzRef.current) {
      playBuzzSound();
    }
    prevBuzzRef.current = gameState.currentBuzz;
  }, [gameState.currentBuzz]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const question = getCurrentQuestion(gameState, loadedQuestions);
  const gameOver = gameState.currentQuestionIndex >= loadedQuestions.length;

  if (!gameState.gameStarted) {
    return <HostLobbyView gameState={gameState} saveGameState={saveGameState} onManageQuestions={onManageQuestions} />;
  }

  async function handleGoodAnswer() {
    if (!gameState.currentBuzz) return;
    const winner = gameState.currentBuzz.name;
    const updatedPlayers = allPlayers.map((p) => (p.name === winner ? { ...p, score: p.score + 3 } : p));
    await saveGameState({
      ...gameState,
      players: updatedPlayers,
      currentBuzz: null,
      showAnswerReview: true,
      showOptions: false,
      wrongBuzzers: [],
    });
  }

  // Mauvaise réponse : le joueur qui vient de buzzer est écarté pour CETTE
  // question (il ne peut plus rebuzzer dessus), mais les autres joueurs actifs
  // peuvent continuer à buzzer jusqu'à ce qu'une bonne réponse soit trouvée
  // (ou que l'animateur force la révélation).
  async function handleWrongAnswer() {
    if (!gameState.currentBuzz) return;
    const wrongName = gameState.currentBuzz.name;
    await saveGameState({
      ...gameState,
      currentBuzz: null,
      wrongBuzzers: [...(gameState.wrongBuzzers || []), wrongName],
    });
  }

  async function handleRevealOptions() {
    await saveGameState({
      ...gameState,
      showOptions: true,
    });
  }

  async function handleShowAnswerReview() {
    await saveGameState({
      ...gameState,
      showAnswerReview: true,
      currentBuzz: null,
      showOptions: false,
    });
  }

  async function handleNextQuestion() {
    const nextQuestionIndex = gameState.currentQuestionIndex + 1;
    const questionsInCurrentManche = getQuestionsInManche(gameState.currentManche);
    const questionInManche = getQuestionInManche(gameState);
    const mancheEnding = questionInManche >= questionsInCurrentManche;

    let nextManche = gameState.currentManche;
    let activePlayers = gameState.activePlayers;
    let lastElimination: LastElimination | null = null;

    if (mancheEnding) {
      const { activePlayers: kept, eliminatedNames } = computeEliminationForManche(gameState, gameState.currentManche);
      activePlayers = kept;
      if (eliminatedNames.length > 0) {
        lastElimination = {
          manche: gameState.currentManche,
          eliminatedNames,
          remaining: kept.length,
        };
      }
      nextManche = Math.min(gameState.currentManche + 1, MANCHES_CONFIG.length);
    }

    await saveGameState({
      ...gameState,
      currentBuzz: null,
      currentManche: nextManche,
      currentQuestionIndex: nextQuestionIndex,
      activePlayers,
      lastElimination,
      showOptions: false,
      showAnswerReview: false,
      wrongBuzzers: [],
    });
  }

  async function handleResetGame() {
    await saveGameState(initGameState());
  }

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-[28px] font-bold font-heading text-gold">
              Manche {gameState.currentManche}/3 — Q{getQuestionInManche(gameState)}/{getQuestionsInManche(gameState.currentManche)} (Global{' '}
              {gameState.currentQuestionIndex + 1}/{loadedQuestions.length})
            </h1>
            <p className="text-muted mt-1">{gameState.activePlayers.length} joueur(s) actif(s) en course</p>
          </div>
          <button
            onClick={onManageQuestions}
            className="py-2 px-5 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold to-gold-dark text-dark-ink"
          >
            📝 Gérer les questions
          </button>
        </div>
        {gameState.lastElimination && (
          <div className="rounded-xl p-4 bg-danger-strong/12 border border-danger-dark">
            <p className="text-danger font-bold mb-1">
              🚫 Fin de manche {gameState.lastElimination.manche} — Éliminé(s) : {gameState.lastElimination.eliminatedNames.join(', ')}
            </p>
            <p className="text-body text-[13px]">Il reste {gameState.lastElimination.remaining} joueur(s) en course.</p>
          </div>
        )}
        {question && (
          <div className="w-full rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
            <p className="text-gold text-lg font-bold mb-3">{gameState.showAnswerReview ? '📚 DÉBRIEFING' : 'Question'}</p>
            <p className="text-ink text-base font-bold mb-3">{question.question}</p>
            {/* Visible uniquement par l'animateur, à tout moment (même avant
                de révéler quoi que ce soit aux joueurs), pour pouvoir juger
                les buzz sans avoir à retenir la bonne réponse à part. */}
            <div className="mb-4 rounded-lg p-3 bg-gold/10 border border-gold/40">
              <p className="text-gold-dark text-[11px] font-bold mb-1 tracking-[0.5px]">👁️ RÉPONSE (visible uniquement par toi)</p>
              <p className="text-gold text-sm font-bold">
                {String.fromCharCode(65 + question.correct)}. {question.options[question.correct]}
              </p>
            </div>
            {gameState.showAnswerReview ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {question.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      idx === question.correct ? 'bg-brand-green/25 border-2 border-brand-green' : 'bg-black/30 border-[#64646433]'
                    }`}
                  >
                    <p className={`text-sm ${idx === question.correct ? 'text-brand-green font-bold' : 'text-body font-normal'}`}>
                      <b>{String.fromCharCode(65 + idx)}.</b> {opt} {idx === question.correct && '✅'}
                    </p>
                  </div>
                ))}
              </div>
            ) : gameState.showOptions ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {question.options.map((opt, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-black/30 border border-[#64646433]">
                    <p className="text-body text-sm">
                      <b>{String.fromCharCode(65 + idx)}.</b> {opt}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-lg text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                <p className="text-muted text-sm font-bold">❓ Les réponses sont cachées</p>
              </div>
            )}
          </div>
        )}
        <div className="w-full rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
          {gameState.showAnswerReview ? (
            <>
              <p className="text-muted text-sm mb-3 font-bold">📚 DÉBRIEFING</p>
              <p className="text-gold text-sm mb-3">La bonne réponse est en évidence ci-dessus. Débattez ! 💬</p>
            </>
          ) : gameState.currentBuzz ? (
            <>
              <p className="text-muted text-sm mb-2">Buzzé</p>
              <p className="text-4xl font-black mb-6 text-brand-green [text-shadow:0_0_20px_rgba(57,255,106,0.5)]">{gameState.currentBuzz.name}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleGoodAnswer}
                  className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
                >
                  ✓ Bonne (+3)
                </button>
                <button
                  onClick={handleWrongAnswer}
                  className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border"
                >
                  ✗ Mauvaise
                </button>
              </div>
            </>
          ) : gameState.showOptions ? (
            <>
              <p className="text-muted text-sm mb-1 font-bold">⏳ En attente de réponses...</p>
              {gameState.wrongBuzzers.length > 0 && (
                <p className="text-danger text-[13px] mb-3">
                  Déjà écarté(s) sur cette question : {gameState.wrongBuzzers.join(', ')}
                </p>
              )}
              <button
                onClick={handleShowAnswerReview}
                className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border"
              >
                Montrer la réponse 👀
              </button>
            </>
          ) : (
            <button
              onClick={handleRevealOptions}
              className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
            >
              Révéler les réponses 🎯
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sorted.slice(0, 3).map((player, idx) => (
            <div
              key={player.name}
              className={`rounded-xl p-4 text-center border ${
                idx === 0 ? 'bg-linear-to-br from-gold/20 to-gold-dark/10 border-gold/33' : 'bg-panel/60 border-brand-green/13'
              }`}
            >
              <p className="text-muted text-xs mb-1">{idx === 0 ? '🥇 1ère' : idx === 1 ? '🥈 2e' : '🥉 3e'}</p>
              <p className="text-gold font-bold mb-0.5">{player.name}</p>
              <p className="text-2xl font-black text-brand-green">{player.score} pts</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-4 bg-panel/50 border border-brand-green/13">
          <div className="flex justify-between items-center mb-3">
            <p className="text-gold font-bold">Classement complet en direct</p>
            <p className="text-muted text-xs">({allPlayers.length} total)</p>
          </div>
          {allPlayers.length === 0 ? (
            <p className="text-faint text-center py-5">Aucun joueur connecté</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {sorted.map((player, idx) => {
                const eliminated = isPlayerEliminated(gameState, player.name);
                return (
                  <div
                    key={player.name}
                    className={`flex justify-between items-center p-3 rounded-lg bg-black/30 ${eliminated ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-muted font-bold min-w-[30px] text-center">#{idx + 1}</span>
                      <span className={`text-gold font-medium break-words ${eliminated ? 'line-through' : ''}`}>{player.name}</span>
                      {eliminated && <span className="text-danger text-xs font-bold">❌ Éliminé</span>}
                    </div>
                    <span className="text-lg font-black ml-4 text-brand-green min-w-[50px] text-right">{player.score}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {gameState.showAnswerReview && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleNextQuestion}
              className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
            >
              ✨ Question suivante
            </button>
            <button
              onClick={handleResetGame}
              className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border"
            >
              Recommencer
            </button>
          </div>
        )}
        {gameOver &&
          (() => {
            const stillActive = sorted.filter((p) => gameState.activePlayers.includes(p.name));
            const winner = stillActive[0] || sorted[0];
            return (
              <div className="rounded-xl p-6 text-center bg-gold/10 border-2 border-gold">
                <p className="text-gold text-2xl font-bold mb-2">🎉 JEU TERMINÉ ! 🎉</p>
                <p className="text-brand-green text-lg font-bold">{winner ? `🏆 ${winner.name} remporte la victoire !` : 'Aucun gagnant'}</p>
                <button
                  onClick={handleResetGame}
                  className="mt-6 w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border"
                >
                  Nouvelle partie
                </button>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

function HostLobbyView({ gameState, saveGameState, onManageQuestions }: { gameState: GameState; saveGameState: SaveGameState; onManageQuestions?: () => void }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);

  async function startGame() {
    const activePlayerNames = allPlayers.map((p) => p.name);
    await saveGameState({
      ...gameState,
      gameStarted: true,
      activePlayers: activePlayerNames,
    });
  }

  async function resetGame() {
    const confirmed = window.confirm('Êtes-vous sûr de vouloir réinitialiser le jeu ?');
    if (confirmed) {
      await saveGameState(initGameState());
    }
  }

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-center font-heading text-gold">🎮 Lobby</h1>
        <div className="rounded-2xl p-8 text-center bg-panel/80 border border-brand-green/27">
          <p className="text-muted text-sm mb-4">En attente de joueurs...</p>
          <p className="text-5xl font-black text-brand-green mb-2">{allPlayers.length}</p>
          <p className="text-body text-base">
            Joueur{allPlayers.length !== 1 ? 's' : ''} connecté{allPlayers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-xl p-6 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-3">Liste des joueurs</p>
          {allPlayers.length === 0 ? (
            <p className="text-faint text-center py-5">Aucun joueur pour l'instant. Partage le lien ! 📤</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sorted.map((player, idx) => (
                <div key={player.name} className="flex items-center gap-3 p-4 rounded-lg bg-black/30">
                  <span className="text-brand-green font-bold text-lg">#{idx + 1}</span>
                  <span className="text-gold font-medium">{player.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={startGame}
            disabled={allPlayers.length === 0}
            className="w-full py-5 rounded-xl font-bold text-lg transition-transform active:scale-95 disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
          >
            🚀 Démarrer le jeu
          </button>
          <button
            onClick={resetGame}
            className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border"
          >
            Réinitialiser
          </button>
          {onManageQuestions && (
            <button
              onClick={onManageQuestions}
              className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold to-gold-dark text-dark-ink"
            >
              📝 Gérer les questions
            </button>
          )}
        </div>
        <p className="text-line text-xs text-center">
          Partage ce lien avec tes joueurs. Une fois prêt, clique "Démarrer le jeu". <br />
          Les joueurs qui rejoignent après ne pourront que regarder les stats. 👀
        </p>
      </div>
    </div>
  );
}

// ============ VUE LIVE ============
function LiveView({
  gameState,
  onExit,
  eliminatedPlayerName,
}: {
  gameState: GameState;
  onExit?: () => void;
  // Rempli uniquement quand un joueur éliminé atterrit sur cette vue : ajoute
  // une bannière + une carte de stats personnelles, en plus du live normal.
  eliminatedPlayerName?: string;
}) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const question = getCurrentQuestion(gameState, loadedQuestions);
  const questionNum = getQuestionInManche(gameState);
  const hasBuzz = !!gameState.currentBuzz;
  const myScore = eliminatedPlayerName ? allPlayers.find((p) => p.name === eliminatedPlayerName)?.score || 0 : 0;
  const myRank = eliminatedPlayerName ? sorted.findIndex((p) => p.name === eliminatedPlayerName) + 1 : 0;

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-8">
      <Glow />
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-2 rounded-full mb-3 bg-brand-green/15 border border-brand-green">
            <p className="text-brand-green text-xs font-bold tracking-[1px]">🔴 LIVE</p>
          </div>
          <h1 className="text-gold text-4xl sm:text-5xl font-bold font-heading mb-2">Questions pour un Fonceday</h1>
          <p className="text-muted text-sm">
            Manche {gameState.currentManche} • Question {questionNum}
          </p>
        </div>

        {eliminatedPlayerName && (
          <div className="rounded-2xl p-5 mb-8 text-center bg-danger-strong/12 border-2 border-danger-dark">
            <p className="text-danger font-bold text-lg mb-1">
              ❌ {eliminatedPlayerName}, tu as été éliminé de la partie
            </p>
            <p className="text-body text-sm">Tu peux continuer à suivre la partie en direct ci-dessous ! 📊</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne gauche - Question */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {question && (
              <div className="rounded-3xl p-8 bg-panel/90 border-2 border-brand-green/27">
                <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">{gameState.showAnswerReview ? '📚 DÉBRIEFING' : 'QUESTION'}</p>
                <p className="text-ink text-[28px] font-bold mb-5 leading-[1.4]">{question.question}</p>

                {gameState.showAnswerReview ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {question.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`p-5 rounded-xl border ${
                          idx === question.correct ? 'bg-brand-green/25 border-2 border-brand-green' : 'bg-black/30 border-[#64646433]'
                        }`}
                      >
                        <p className={`text-base ${idx === question.correct ? 'text-brand-green font-bold' : 'text-body font-normal'}`}>
                          <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                          {opt} {idx === question.correct && '✅'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : gameState.showOptions ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {question.options.map((opt, idx) => (
                      <div key={idx} className="p-5 rounded-xl bg-black/30 border border-[#64646433]">
                        <p className="text-body text-base">
                          <span className="text-brand-green font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                          {opt}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 rounded-xl text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                    <p className="text-muted text-lg font-bold">❓ Les réponses sont cachées</p>
                  </div>
                )}
              </div>
            )}

            {/* Bannière élimination */}
            {gameState.lastElimination && (
              <div className="rounded-2xl p-5 bg-danger-strong/15 border-2 border-danger-dark">
                <p className="text-danger font-bold text-base mb-1">🚫 Éliminé(s) : {gameState.lastElimination.eliminatedNames.join(', ')}</p>
                <p className="text-body text-[13px]">Il reste {gameState.lastElimination.remaining} joueur(s) en course !</p>
              </div>
            )}

            {/* Buzz actif */}
            {hasBuzz && (
              <div className="rounded-3xl p-8 text-center bg-linear-to-br from-brand-green/20 to-brand-green/5 border-2 border-brand-green">
                <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">BUZZE</p>
                <p className="text-5xl font-black text-brand-green [text-shadow:0_0_30px_rgba(57,255,106,0.6)]">{gameState.currentBuzz!.name}</p>
              </div>
            )}

            {/* Déjà écartés sur cette question */}
            {gameState.wrongBuzzers.length > 0 && (
              <div className="rounded-2xl p-4 bg-black/30 border border-danger-dark/33">
                <p className="text-danger text-sm">❌ Déjà écarté(s) : {gameState.wrongBuzzers.join(', ')}</p>
              </div>
            )}
          </div>

          {/* Colonne droite - Classement */}
          <div className="flex flex-col gap-6">
            {eliminatedPlayerName && (
              <div className="rounded-3xl p-6 text-center bg-panel/90 border-2 border-danger-dark/33">
                <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">TES STATS</p>
                <p className="text-4xl font-black text-gold mb-1">#{myRank}</p>
                <p className="text-brand-green text-lg font-bold">{myScore} pts</p>
              </div>
            )}
            <div className="rounded-3xl p-6 bg-panel/90 border-2 border-brand-green/27">
              <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">CLASSEMENT</p>

              {sorted.length === 0 ? (
                <p className="text-faint text-center py-5">Aucun joueur</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sorted.slice(0, 5).map((player, idx) => {
                    const eliminated = isPlayerEliminated(gameState, player.name);
                    return (
                      <div
                        key={player.name}
                        className={`flex items-center gap-3 p-4 rounded-xl border ${
                          idx === 0 ? 'bg-gold/10 border-gold/33' : 'bg-black/30 border-[#64646433]'
                        } ${eliminated ? 'opacity-45' : ''}`}
                      >
                        <span className={`font-bold min-w-[30px] ${idx === 0 ? 'text-gold text-xl' : 'text-brand-green text-base'}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-ink font-semibold text-[15px] break-words ${eliminated ? 'line-through' : ''}`}>
                            {player.name}
                            {eliminated && ' ❌'}
                          </p>
                        </div>
                        <span className="text-brand-green font-bold text-lg min-w-[50px] text-right">{player.score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Infos jeu */}
            <div className="rounded-3xl p-6 bg-panel/80 border border-brand-green/13">
              <p className="text-muted text-xs font-bold mb-2 tracking-[1px]">STATS</p>
              <div className="space-y-4">
                <div>
                  <p className="text-muted text-xs mb-1">Joueurs en course</p>
                  <p className="text-brand-green text-2xl font-bold">
                    {gameState.activePlayers.length} / {allPlayers.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs mb-1">Manche</p>
                  <p className="text-gold text-2xl font-bold">
                    {gameState.currentManche} / {MANCHES_CONFIG.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Message communauté */}
        <div className="mt-12 text-center">
          <p className="text-gold text-lg sm:text-xl font-semibold font-heading italic">
            Ça se passe sur le Discord de Kanaé ! 🎮
          </p>
        </div>

        {/* Bouton retour discret (uniquement pour la vue live pilotée par état, pas pour l'URL ?live=1) */}
        {onExit && (
          <div className="mt-6 text-center">
            <button onClick={onExit} className="px-6 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line">
              Quitter le live
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Glow() {
  return <div className="absolute inset-0 pointer-events-none app-glow" />;
}
