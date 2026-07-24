import { useState, useEffect, useRef } from 'react';
import { ref, onValue, set as dbSet, runTransaction } from 'firebase/database';
import { db, isFirebaseConfigured } from './firebase';
import buzzSoundUrl from './assets/dry-cough-soundbible.mp3';
import fonceyPosterUrl from './assets/fonceday-poster.webp';
import QuestionManager from './components/QuestionManager';
import { loadQuestionBanks } from './lib/questionManager';
import type { QuestionBanks, GameState, QuestionRound, CurrentBuzz, Question } from './lib/game';
import {
  createGameState,
  normalizeGameState,
  questionsForRound,
  getCurrentQuestion,
  getActivePlayers,
  timerDuration,
  calculateEliminations,
  computeNumericOutcome,
  computeQcmOutcome,
  computeFreeTextOutcome,
} from './lib/game';

const STATE_PATH = 'fonceday-game-state';
const SOCIAL_LINK = 'https://linktr.ee/kanaeclub?utm_source=linktree_profile_share&ltsid=f022cf4b-fffb-4e58-9fb5-8ee79d86e340';
const TEST_BOTS = ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Diana'];

type SaveGameState = (newState: GameState) => Promise<void>;
type Role = 'host' | 'join' | 'consent' | 'lobby' | null;

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

// ============ HELPERS ============

function getBankIndex(banks: QuestionBanks, round: QuestionRound, index: number): Question | null {
  const questions = questionsForRound(banks, round);
  return questions[index] || null;
}

function isPlayerEliminated(state: GameState, playerName: string): boolean {
  if (!state.gameStarted) return false;
  if (state.activePlayerIds.includes(getPlayerId(state, playerName))) return false;
  return getActivePlayers(state).some((player) => player.name === playerName) ||
         state.players.some((player) => player.name === playerName);
}

function getPlayerId(state: GameState, playerName: string): string {
  return state.players.find((player) => player.name === playerName)?.id || playerName;
}

function getEliminationPlan(state: GameState): { afterBuzzer: number; afterSimultaneous: number } {
  return state.eliminationPlan || calculateEliminations(state.players.length);
}

// ============ APP ============

export default function FoncedayLive() {
  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loadedBanks, setLoadedBanks] = useState<QuestionBanks>({ buzzer: [], simultaneous: [], final: [] });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connecting, setConnecting] = useState(isFirebaseConfigured);
  const [syncError, setSyncError] = useState(false);
  const [hostAuth, setHostAuth] = useState(false);
  const [showQuestionManager, setShowQuestionManager] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [previewLive, setPreviewLive] = useState(false);
  const [hostGateOpen, setHostGateOpen] = useState(false);
  const titleClicksRef = useRef(0);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLiveUrlView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('live') === '1';
  });

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
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

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    return loadQuestionBanks(setLoadedBanks);
  }, []);

  async function saveGameState(newState: GameState) {
    if (!db) return;
    try {
      await dbSet(ref(db, STATE_PATH), newState);
      setGameState(newState);
    } catch (e) {
      console.error('Save failed', e);
      setSyncError(true);
    }
  }

  function handleTitleClick() {
    titleClicksRef.current += 1;
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    if (titleClicksRef.current === 3) {
      setHostGateOpen(true);
      titleClicksRef.current = 0;
    }
    titleTimeoutRef.current = setTimeout(() => { titleClicksRef.current = 0; }, 500);
  }

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />;
  if (connecting) return <ConnectingScreen />;
  if (syncError && !gameState) return <SyncErrorScreen />;

  if (isLiveUrlView && gameState) return <LiveView gameState={gameState} banks={loadedBanks} />;

  if (hostGateOpen && !hostAuth) return (
    <HostAuthScreen
      onAuth={() => { setHostAuth(true); setHostGateOpen(false); setRole('host'); }}
      onBack={() => setHostGateOpen(false)}
    />
  );

  if (!role) return <RoleSelect setRole={setRole} onTitleClick={handleTitleClick} />;
  if (role === 'join') return <NameInput nameInput={nameInput} setNameInput={setNameInput} onSubmit={() => { setName(nameInput.trim()); setRole('consent'); }} />;
  if (role === 'consent') return <ConsentScreen playerName={name} onAccept={() => setRole('lobby')} onReject={() => { setName(''); setNameInput(''); setRole('join'); }} />;

  if (role === 'lobby' && gameState) {
    const isActivePlayer = gameState.activePlayerIds.includes(getPlayerId(gameState, name));
    const wasRegistered = gameState.players.some((player) => player.name === name);
    if (isActivePlayer && gameState.gameStarted) return <PlayerView gameState={gameState} banks={loadedBanks} playerName={name} />;
    if (!gameState.gameStarted) return <LobbyPlayerView gameState={gameState} playerName={name} />;
    if (wasRegistered) return <LiveView gameState={gameState} banks={loadedBanks} eliminatedPlayerName={name} />;
    return <SpectatorView gameState={gameState} />;
  }

  if (role === 'host' && gameState) {
    if (showQuestionManager) return <QuestionManager onExit={() => setShowQuestionManager(false)} />;
    if (testMode) return <TestModeView gameState={gameState} banks={loadedBanks} saveGameState={saveGameState} onExit={() => setTestMode(false)} />;
    if (previewLive) return <LiveView gameState={gameState} banks={loadedBanks} onExit={() => setPreviewLive(false)} />;
    return <HostView gameState={gameState} banks={loadedBanks} saveGameState={saveGameState} onManageQuestions={() => setShowQuestionManager(true)} onStartTest={() => setTestMode(true)} onPreviewLive={() => setPreviewLive(true)} />;
  }
  return null;
}

// ============ SCREENS ============

function FirebaseSetupNotice() {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <div className="relative z-10 w-full max-w-md flex flex-col gap-4">
        <h2 className="text-2xl font-bold font-heading text-danger">⚠️ Synchronisation non configurée</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-danger-dark/33 text-left">
          <p className="text-body text-sm mb-3">
            Les variables Firebase (<code className="text-gold">VITE_FIREBASE_*</code>) sont manquantes.
          </p>
          <ol className="text-muted text-[13px] leading-[1.7] pl-5 list-decimal">
            <li>Crée un projet Firebase gratuit (console.firebase.google.com)</li>
            <li>Active "Realtime Database"</li>
            <li>Copie <code className="text-gold">.env.example</code> vers <code className="text-gold">.env</code> et renseigne les valeurs</li>
            <li>Redémarre le serveur (ou redéploie sur Vercel)</li>
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
        <p className="text-muted text-sm">Vérifie ta connexion internet et réessaie.</p>
        <button onClick={() => window.location.reload()} className="mt-2 px-6 py-2 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">Réessayer</button>
      </div>
    </div>
  );
}

function RoleSelect({ setRole, onTitleClick }: { setRole: (r: Role) => void; onTitleClick: () => void }) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6 text-center">
      <Glow />
      <img src={fonceyPosterUrl} alt="Questions pour un Fonceday" onClick={onTitleClick} className="relative z-10 w-full max-w-xs sm:max-w-sm cursor-pointer select-none rounded-2xl mb-8 [box-shadow:0_0_40px_rgba(57,255,106,0.25)]" draggable={false} />
      <div className="relative z-10 flex flex-col gap-4 w-full max-w-xs">
        <button onClick={() => setRole('join')} className="py-4 rounded-2xl font-bold text-base transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">Je suis un fonceday</button>
      </div>
      <SocialLinks />
    </div>
  );
}

function SocialLinks() {
  const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'currentColor' };
  return (
    <div className="relative z-10 flex items-center gap-4 mt-10">
      <a href={SOCIAL_LINK} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10">
        <svg {...iconProps}><path d="M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2.01 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 21.99 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43-.26-.66-.6-1.22-1.16-1.77-.55-.56-1.11-.9-1.77-1.16-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.5.21 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.13.36.3.88.34 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.5-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.13-.88.3-1.86.34-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.5-.21-1.86-.34-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.13-.36-.3-.88-.34-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.04-.98.21-1.5.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.13.88-.3 1.86-.34 1.05-.05 1.37-.06 4.04-.06zm0 3.06a5.14 5.14 0 100 10.28 5.14 5.14 0 000-10.28zm0 8.48a3.34 3.34 0 110-6.68 3.34 3.34 0 010 6.68zm5.34-8.68a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z" /></svg>
      </a>
      <a href={SOCIAL_LINK} target="_blank" rel="noopener noreferrer" aria-label="Twitch" className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10">
        <svg {...iconProps}><path d="M4.3 2 2 7.6v12.1h5.2V22l3.1-2.3h3.7L20 14V2H4.3zm14 11.3-3.1 3.1h-3.7L8.4 19v-2.6H4.6V3.7h13.7v9.6z" /><path d="M15.9 6.6h1.7v5.2h-1.7zM11.2 6.6h1.7v5.2h-1.7z" /></svg>
      </a>
      <a href={SOCIAL_LINK} target="_blank" rel="noopener noreferrer" aria-label="Discord" className="w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-ink transition-transform active:scale-90 hover:bg-white/10">
        <svg {...iconProps}><path d="M20.32 5.37a17.9 17.9 0 0 0-4.43-1.37.07.07 0 0 0-.07.03c-.19.34-.4.78-.55 1.13a16.5 16.5 0 0 0-4.94 0 8.3 8.3 0 0 0-.56-1.13.07.07 0 0 0-.07-.03c-1.53.26-3 .72-4.43 1.37a.06.06 0 0 0-.03.03C2.99 9.24 2.32 12.98 2.65 16.68a.08.08 0 0 0 .03.05 18 18 0 0 0 5.43 2.75.07.07 0 0 0 .08-.03c.42-.57.79-1.18 1.11-1.81a.07.07 0 0 0-.04-.1 11.9 11.9 0 0 1-1.7-.81.07.07 0 0 1-.01-.12c.11-.09.23-.18.34-.27a.07.07 0 0 1 .07-.01c3.57 1.63 7.44 1.63 10.97 0a.07.07 0 0 1 .07.01c.11.09.22.18.34.27a.07.07 0 0 1-.01.12c-.54.32-1.11.58-1.7.81a.07.07 0 0 0-.04.1c.33.63.7 1.24 1.11 1.81a.07.07 0 0 0 .08.03 17.9 17.9 0 0 0 5.44-2.75.07.07 0 0 0 .03-.05c.4-4.28-.66-7.99-2.79-11.28a.06.06 0 0 0-.03-.03zM9.68 14.4c-1.07 0-1.95-.98-1.95-2.19 0-1.2.86-2.18 1.95-2.18 1.1 0 1.97.99 1.95 2.18 0 1.21-.86 2.19-1.95 2.19zm5.66 0c-1.07 0-1.95-.98-1.95-2.19 0-1.2.86-2.18 1.95-2.18 1.1 0 1.97.99 1.95 2.18 0 1.21-.85 2.19-1.95 2.19z" /></svg>
      </a>
    </div>
  );
}

function HostAuthScreen({ onAuth, onBack }: { onAuth: () => void; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const CORRECT_PASSWORD = 'jesuisanimateur';
  function handleSubmit() {
    if (password === CORRECT_PASSWORD) { setError(false); onAuth(); }
    else { setError(true); setPassword(''); }
  }
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center font-heading text-gold">Accès animateur</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-brand-green/20">
          <p className="text-sm mb-4 text-center text-body">Entrez le mot de passe animateur</p>
          <input autoFocus type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(false); }} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Mot de passe" className={`w-full px-4 py-3 rounded-xl text-center outline-none mb-3 bg-panel text-ink border ${error ? 'border-danger-border' : 'border-brand-green/33'}`} />
          {error && <p className="text-danger text-[13px] text-center mb-3">Mot de passe incorrect</p>}
          <button onClick={handleSubmit} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 mb-3 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">Accéder</button>
          <button onClick={onBack} className="w-full py-2 rounded-xl font-bold transition-transform active:scale-95 bg-[#64646433] text-muted border border-line">Retour</button>
        </div>
      </div>
    </div>
  );
}

function NameInput({ nameInput, setNameInput, onSubmit }: { nameInput: string; setNameInput: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-4">
        <p className="text-center mb-2 text-body">Ton pseudo pour la partie</p>
        <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Pseudo" maxLength={20} className="px-4 py-3 rounded-xl text-center outline-none bg-panel border border-brand-green/33 text-ink" />
        <button disabled={!nameInput.trim()} onClick={onSubmit} className="py-3 rounded-xl font-bold disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">Entrer</button>
      </div>
    </div>
  );
}

function ConsentScreen({ playerName, onAccept, onReject }: { playerName: string; onAccept: () => void; onReject: () => void }) {
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-md flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-center font-heading text-gold">Consentement</h2>
        <div className="rounded-2xl p-6 bg-panel/80 border border-brand-green/20">
          <p className="text-sm leading-[1.6] mb-3 text-body">Bienvenue <b className="text-gold">{playerName}</b> !</p>
          <div className="text-muted text-[13px] leading-[1.7]">
            <p className="mb-3 text-body">En participant à ce jeu, vous acceptez que :</p>
            <ul className="mb-3 pl-5 list-disc">
              <li className="mb-2">Votre pseudonyme et votre performance seront <b>diffusés en direct</b> sur Twitch</li>
              <li className="mb-2">Votre nom/pseudo pourra apparaître dans des <b>rediffusions YouTube</b>, <b>Instagram</b>, TikTok ou autres réseaux sociaux</li>
              <li className="mb-2">Les contenus vidéo peuvent être réutilisés pour la promotion ou l'archivage</li>
              <li>Vous consentez à cette utilisation en jouant</li>
            </ul>
            <p className="text-faint text-xs">Si vous refusez, veuillez quitter maintenant.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onAccept} className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">✓ J'accepte et je joue</button>
          <button onClick={onReject} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-danger-strong/20 text-danger border border-danger-dark">✗ Je refuse</button>
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
    const alreadyKnown = gameState.players.some((player) => player.name === playerName);
    if (alreadyKnown) { registeredRef.current = true; return; }
    if (!db) return;
    let cancelled = false;
    async function registerPlayer() {
      const stateRef = ref(db!, STATE_PATH);
      await runTransaction(stateRef, (current: unknown) => {
        const base = normalizeGameState(current);
        if (base.players.some((player) => player.name === playerName)) return base;
        const id = `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return { ...base, players: [...base.players, { id, name: playerName, score: 0 }], activePlayerIds: [...base.activePlayerIds, id] };
      });
      if (!cancelled) registeredRef.current = true;
    }
    registerPlayer();
    return () => { cancelled = true; };
  }, [playerName, gameState.players]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        <h1 className="text-[32px] font-bold font-heading text-gold">Lobby</h1>
        <div className="w-full rounded-2xl p-6 text-center bg-panel/80 border border-brand-green/27">
          <p className="text-sm mb-3 text-body">Bienvenue <b className="text-gold">{playerName}</b> !</p>
          <p className="text-[13px] text-muted">En attente du démarrage... 🎮</p>
        </div>
        <div className="w-full rounded-xl p-4 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-2">Joueurs connectés ({allPlayers.length})</p>
          <div className="flex flex-col gap-2">
            {sorted.map((player) => (
              <div key={player.id} className="px-4 py-2 rounded-lg bg-black/30">
                <p className="text-body text-sm">{player.name === playerName && '✓ '} {player.name}</p>
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
          <p className="text-xs text-muted">{phaseLabel(gameState)} • Question {currentQuestionInRound(gameState)}</p>
        </div>
        <div className="w-full rounded-xl p-4 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-2">Classement en direct</p>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {sorted.map((player, idx) => {
              const eliminated = isPlayerEliminated(gameState, player.name);
              return (
                <div key={player.id} className={`flex justify-between items-center p-3 rounded-lg bg-black/30 ${eliminated ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-muted font-bold min-w-[25px]">#{idx + 1}</span>
                    <span className="text-gold">{player.name}{eliminated && ' ❌'}</span>
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

// ============ PLAYER VIEW ============

function PlayerView({ gameState, banks, playerName }: { gameState: GameState; banks: QuestionBanks; playerName: string }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  const [timerLeft, setTimerLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [numericInput, setNumericInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (gameState.currentBuzz && !prevBuzzRef.current && gameState.currentBuzz.playerId !== getPlayerId(gameState, playerName)) {
      playBuzzSound();
    }
    prevBuzzRef.current = gameState.currentBuzz;
  }, [gameState.currentBuzz, playerName]);

  useEffect(() => {
    if (gameState.timerEndsAt && gameState.phase === 'question' && !gameState.pause) {
      const update = () => {
        const left = Math.max(0, Math.ceil((gameState.timerEndsAt! - Date.now()) / 1000));
        setTimerLeft(left);
        if (left <= 0) clearInterval(timerRef.current!);
      };
      update();
      timerRef.current = setInterval(update, 250);
    } else {
      setTimerLeft(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.timerEndsAt, gameState.phase, gameState.pause]);

  async function submitAnswer() {
    if (!db || submitted || gameState.phase !== 'question' || gameState.timerEndsAt === null) return;
    const question = getCurrentQuestion(gameState, banks);
    if (!question) return;
    const value = question.type === 'numeric' ? numericInput : question.type === 'qcm' ? (selectedOption !== null ? String.fromCharCode(65 + selectedOption) : '') : '';
    const submittedAt = Date.now();
    const saved = await runTransaction(ref(db, `${STATE_PATH}/submittedAnswers/${playerName}`), (current: unknown) => {
      if (current && typeof current === 'object' && 'submittedAt' in (current as Record<string, unknown>)) return current;
      return { value, submittedAt };
    });
    if (saved) setSubmitted(true);
  }

  function handleBuzz() {
    if (gameState.currentBuzz || !db || gameState.phase !== 'question') return;
    playBuzzSound();
    const buzzRef = ref(db, `${STATE_PATH}/currentBuzz`);
    runTransaction(buzzRef, (current: CurrentBuzz | null) => {
      if (current) return current;
      return { playerId: getPlayerId(gameState, playerName), name: playerName, ts: Date.now() };
    });
  }

  function handleValidate() {
    if (gameState.phase !== 'question' || gameState.pause) return;
    submitAnswer();
  }

  function handleFiftyFifty() {
    if (!db || gameState.phase !== 'question' || gameState.pause) return;
    runTransaction(ref(db, `${STATE_PATH}/fiftyFiftyPlayers`), (current: string[] | null) => {
      const list = current || [];
      if (list.includes(playerName)) return list;
      return [...list, playerName];
    });
    runTransaction(ref(db, `${STATE_PATH}/usedJokers/${playerName}`), (current: string[] | null) => {
      const list = current || [];
      if (list.includes('fifty-fifty')) return list;
      return [...list, 'fifty-fifty'];
    });
  }

  function handlePhoneAStranger() {
    if (!db || gameState.phase !== 'question' || gameState.pause) return;
    runTransaction(ref(db, `${STATE_PATH}/pause`), (_current: unknown) => ({
      joker: 'phone-a-stranger',
      playerName,
      remainingMs: null,
    }));
    runTransaction(ref(db, `${STATE_PATH}/usedJokers/${playerName}`), (current: string[] | null) => {
      const list = current || [];
      if (list.includes('phone-a-stranger')) return list;
      return [...list, 'phone-a-stranger'];
    });
  }

  function handleOpponentHelp() {
    if (!db || gameState.phase !== 'question' || gameState.pause) return;
    runTransaction(ref(db, `${STATE_PATH}/pause`), (_current: unknown) => ({
      joker: 'opponent-help',
      playerName,
    }));
    runTransaction(ref(db, `${STATE_PATH}/usedJokers/${playerName}`), (current: string[] | null) => {
      const list = current || [];
      if (list.includes('opponent-help')) return list;
      return [...list, 'opponent-help'];
    });
  }

  const allPlayers = gameState.players || [];
  const playerScore = allPlayers.find((player) => player.name === playerName)?.score || 0;
  const playerRank = [...allPlayers].sort((a, b) => b.score - a.score).findIndex((player) => player.name === playerName) + 1;
  const iBuzzed = gameState.currentBuzz && gameState.currentBuzz.playerId === getPlayerId(gameState, playerName);
  const someoneElseBuzzed = gameState.currentBuzz && gameState.currentBuzz.playerId !== getPlayerId(gameState, playerName);
  const alreadyWrong = (gameState.wrongBuzzers || []).includes(getPlayerId(gameState, playerName));
  const question = getCurrentQuestion(gameState, banks);
  const active = gameState.activePlayerIds.includes(getPlayerId(gameState, playerName));
  const fiftyFiftyUsed = (gameState.usedJokers[playerName] || []).includes('fifty-fifty');
  const fiftyFiftyHidden = fiftyFiftyUsed && question?.type === 'qcm';
  const canUseJoker = gameState.phase === 'question' && !gameState.pause && !submitted;

  const buzzDisabled = !!gameState.currentBuzz || alreadyWrong || gameState.phase === 'final';
  const buzzBg = gameState.currentBuzz ? (iBuzzed ? 'bg-linear-to-br from-gold to-gold-dark' : 'bg-buzzed') : alreadyWrong ? 'bg-buzzed' : 'bg-linear-to-br from-brand-green to-brand-green-dark';
  const buzzText = 'text-dark-ink';
  const buzzShadow = !buzzDisabled ? 'shadow-[0_0_50px_rgba(57,255,106,0.55),0_10px_30px_rgba(0,0,0,0.5)]' : '';

  let buzzLabel = 'BUZZ';
  if (gameState.currentBuzz) { buzzLabel = iBuzzed ? "C'EST TOI !" : 'BUZZÉ'; }
  else if (alreadyWrong) { buzzLabel = 'DÉJÀ TENTÉ'; }

  function renderQuestionContent() {
    if (!question) return null;
    if (gameState.pause) return <div className="p-4 rounded-lg text-center bg-warn-bg border border-warn-border"><p className="text-gold-dark font-bold">⏸️ Pause — {gameState.pause.joker === 'phone-a-stranger' ? 'Appel à un inconnu' : 'Aide d\'un adversaire'} en cours...</p></div>;
    if (gameState.phase === 'final') return <div className="p-4 rounded-lg text-center bg-gold/10 border border-gold-dark"><p className="text-gold-dark font-bold">🏆 Finale — Ta réponse orale sur Discord</p></div>;
    if (gameState.phase === 'review') return null;

    switch (question.type) {
      case 'qcm':
        return (
          <div className="flex flex-col gap-2">
            {question.options.map((option, index) => {
              if (fiftyFiftyHidden && index !== question.correct && index !== question.correct - 1 && index !== question.correct + 1) return null;
              return (
                <button key={index} onClick={() => setSelectedOption(index)} className={`px-3 py-2 rounded-lg text-sm border text-left ${selectedOption === index ? 'bg-brand-green/25 border-brand-green text-brand-green font-bold' : 'bg-black/30 border-transparent text-body'}`}>
                  {String.fromCharCode(65 + index)}. {option}
                </button>
              );
            })}
          </div>
        );
      case 'numeric':
        return (
          <div className="flex gap-2">
            <input value={numericInput} onChange={(e) => setNumericInput(e.target.value)} placeholder="Ex : 42 ou 3,14" className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-line text-ink" />
            <button onClick={handleValidate} disabled={submitted} className="px-4 py-2 rounded-lg bg-brand-green text-dark-ink font-bold disabled:opacity-40">Valider</button>
          </div>
        );
      default:
        return <div className="p-4 rounded-lg text-center bg-brand-green/8 border border-dashed border-brand-green/33"><p className="text-[13px] font-bold text-muted">Réponds oralement sur Discord</p></div>;
    }
  }

  function renderJokers() {
    if (gameState.phase !== 'question' || gameState.pause) return null;
    const isNumericOrQcm = question?.type === 'numeric' || question?.type === 'qcm';
    return (
      <div className="flex gap-2 flex-wrap">
        {question?.type === 'qcm' && !fiftyFiftyUsed && (
          <button onClick={handleFiftyFifty} disabled={!canUseJoker} className="px-3 py-2 rounded-lg text-sm font-bold bg-warn-bg text-gold-dark border border-warn-border disabled:opacity-40">
            50/50
          </button>
        )}
        {isNumericOrQcm && !((gameState.usedJokers[playerName] || []).includes('phone-a-stranger')) && (
          <button onClick={handlePhoneAStranger} disabled={!canUseJoker} className="px-3 py-2 rounded-lg text-sm font-bold bg-warn-bg text-gold-dark border border-warn-border disabled:opacity-40">
            Appel
          </button>
        )}
        {isNumericOrQcm && !((gameState.usedJokers[playerName] || []).includes('opponent-help')) && (
          <button onClick={handleOpponentHelp} disabled={!canUseJoker} className="px-3 py-2 rounded-lg text-sm font-bold bg-warn-bg text-gold-dark border border-warn-border disabled:opacity-40">
            Aide adverse
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
        <div className="text-[13px] text-center text-muted">
          <b className="text-gold">{playerName}</b> • {phaseLabel(gameState)} • {currentQuestionInRound(gameState)}
          {gameState.phase === 'question' && !gameState.pause && timerLeft > 0 && <span className="ml-2 text-brand-green font-bold">{timerLeft}s</span>}
        </div>
        {question && (
          <div className="w-full max-w-md rounded-xl p-4 mb-4 bg-panel/70 border border-brand-green/20">
            <p className="text-sm font-bold mb-2 text-center text-gold">{question.question}</p>
            {renderQuestionContent()}
            <div className="mt-3">{renderJokers()}</div>
          </div>
        )}
        {gameState.phase === 'question' && active && (
          <button onClick={handleBuzz} disabled={buzzDisabled} className={`rounded-full flex items-center justify-center font-black transition-transform active:scale-95 disabled:active:scale-100 w-[200px] h-[200px] text-[28px] border-4 border-white/15 ${buzzBg} ${buzzText} ${buzzShadow}`}>
            {buzzLabel}
          </button>
        )}
        {gameState.phase === 'question' && !active && (
          <div className="rounded-full flex items-center justify-center w-[200px] h-[200px] text-[28px] border-4 border-white/15 bg-buzzed text-muted font-black">ÉLIMINÉ</div>
        )}
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

// ============ HOST VIEW ============

function HostView({ gameState, banks, saveGameState, onManageQuestions, onStartTest, onPreviewLive }: { gameState: GameState; banks: QuestionBanks; saveGameState: SaveGameState; onManageQuestions: () => void; onStartTest?: () => void; onPreviewLive?: () => void }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  useEffect(() => { if (gameState.currentBuzz && !prevBuzzRef.current) playBuzzSound(); prevBuzzRef.current = gameState.currentBuzz; }, [gameState.currentBuzz]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const active = getActivePlayers(gameState);
  const question = getCurrentQuestion(gameState, banks);
  const gameOver = gameState.phase === 'game-over';

  if (!gameState.gameStarted) return <HostLobbyView gameState={gameState} saveGameState={saveGameState} onManageQuestions={onManageQuestions} onStartTest={onStartTest} onPreviewLive={onPreviewLive} />;

  async function handleGoodAnswer() {
    if (!gameState.currentBuzz) return;
    const player = gameState.players.find((p) => p.id === gameState.currentBuzz.playerId);
    if (!player) return;
    await saveGameState({
      ...gameState,
      players: allPlayers.map((p) => p.id === player.id ? { ...p, score: p.score + 1 } : p),
      currentBuzz: null,
      phase: 'review',
      wrongBuzzers: [],
    });
  }

  async function handleWrongAnswer() {
    if (!gameState.currentBuzz) return;
    await saveGameState({
      ...gameState,
      currentBuzz: null,
      wrongBuzzers: [...(gameState.wrongBuzzers || []), gameState.currentBuzz.playerId],
    });
  }

  async function handleRevealOptions() {
    await saveGameState({ ...gameState, phase: 'review' });
  }

  async function handleShowAnswerReview() {
    await saveGameState({ ...gameState, phase: 'review', currentBuzz: null });
  }

  function computeNumericWinners(): string[] {
    if (!question || question.type !== 'numeric') return [];
    const outcomes = active.map((player) => {
      const submission = gameState.submittedAnswers[player.name];
      if (!submission) return null;
      const result = computeNumericOutcome(question, submission.value);
      return { player, ...result, submittedAt: submission.submittedAt };
    }).filter(Boolean) as Array<{ player: { id: string; name: string }; correct: boolean; diff: number; submittedAt: number }>;
    if (!outcomes.length) return [];
    const bestDiff = Math.min(...outcomes.map((o) => o.diff));
    const winners = outcomes.filter((o) => o.diff === bestDiff);
    if (winners.length === 1) return [winners[0].player.name];
    return winners.sort((a, b) => a.submittedAt - b.submittedAt).slice(0, 1).map((o) => o.player.name);
  }

  function computeQcmWinners(): string[] {
    if (!question || question.type !== 'qcm') return [];
    return active
      .map((player) => {
        const submission = gameState.submittedAnswers[player.name];
        if (!submission) return null;
        return computeQcmOutcome(question, submission.value) ? player.name : null;
      })
      .filter(Boolean) as string[];
  }

  function computeFreeTextWinners(): string[] {
    if (!question || question.type !== 'free-text') return [];
    return active
      .map((player) => {
        const submission = gameState.submittedAnswers[player.name];
        if (!submission) return null;
        return computeFreeTextOutcome(question, submission.value) ? player.name : null;
      })
      .filter(Boolean) as string[];
  }

  function getNumericWinners(): string[] {
    if (!question || question.type !== 'numeric') return [];
    return computeNumericWinners();
  }

  function getQcmWinners(): string[] {
    if (!question || question.type !== 'qcm') return [];
    return computeQcmWinners();
  }

  function getFreeTextWinners(): string[] {
    if (!question || question.type !== 'free-text') return [];
    return computeFreeTextWinners();
  }

  async function handleStartTimer() {
    if (gameState.phase !== 'question' || gameState.timerEndsAt) return;
    const dur = question ? timerDuration(question) : 15_000;
    await saveGameState({ ...gameState, timerEndsAt: Date.now() + dur });
  }

  async function handleAutoResolve() {
    if (!question || question.type !== 'numeric') return;
    const winners = getNumericWinners();
    const updatedPlayers = allPlayers.map((p) => winners.includes(p.name) ? { ...p, score: p.score + 1 } : p);
    await saveGameState({
      ...gameState,
      players: updatedPlayers,
      timerEndsAt: null,
      phase: 'review',
      currentBuzz: null,
    });
  }

  async function handleQcmAutoResolve() {
    if (!question || question.type !== 'qcm') return;
    const winners = getQcmWinners();
    const updatedPlayers = allPlayers.map((p) => winners.includes(p.name) ? { ...p, score: p.score + 1 } : p);
    await saveGameState({
      ...gameState,
      players: updatedPlayers,
      timerEndsAt: null,
      phase: 'review',
      currentBuzz: null,
    });
  }

  async function handleFreeTextValidate(name: string, valid: boolean) {
    if (!question || question.type !== 'free-text') return;
    if (valid) {
      const updatedPlayers = allPlayers.map((p) => p.name === name ? { ...p, score: p.score + 1 } : p);
      await saveGameState({ ...gameState, players: updatedPlayers });
    }
  }

  async function handleNextQuestion() {
    const round = gameState.round;
    const roundQuestions = questionsForRound(banks, round);
    const nextIndex = gameState.questionIndex + 1;
    const endOfRound = nextIndex >= roundQuestions.length;
    let nextRound = round;
    let nextIndex2 = nextIndex;
    let activePlayerIds = gameState.activePlayerIds;
    let lastElimination = gameState.lastElimination;
    const plan = getEliminationPlan(gameState);

    if (endOfRound) {
      if (round === 'buzzer') {
        const toEliminate = plan.afterBuzzer;
        if (toEliminate > 0) {
          const { kept, eliminated } = applyElimination(gameState, toEliminate);
          activePlayerIds = kept;
          lastElimination = { round: 'buzzer', eliminatedNames: eliminated, remaining: kept.length };
        }
        nextRound = 'simultaneous';
        nextIndex2 = 0;
      } else if (round === 'simultaneous') {
        const toEliminate = plan.afterSimultaneous;
        if (toEliminate > 0) {
          const { kept, eliminated } = applyElimination(gameState, toEliminate);
          activePlayerIds = kept;
          lastElimination = { round: 'simultaneous', eliminatedNames: eliminated, remaining: kept.length };
        }
        nextRound = 'final';
        nextIndex2 = 0;
      } else {
        const stillActive = activePlayerIds.filter((id) => gameState.players.some((p) => p.id === id));
        if (stillActive.length <= 1) {
          const winnerId = stillActive[0] || gameState.players[0]?.id;
          await saveGameState({ ...gameState, phase: 'game-over', winnerId });
          return;
        }
        nextIndex2 = (gameState.questionIndex + 1) % roundQuestions.length;
      }
    }

    await saveGameState({
      ...gameState,
      currentBuzz: null,
      phase: 'question',
      round: nextRound,
      questionIndex: nextIndex2,
      activePlayerIds,
      lastElimination,
      wrongBuzzers: [],
      submittedAnswers: {},
      answerOutcomes: {},
      timerEndsAt: null,
      pause: null,
    });
  }

  async function handleResetGame() {
    await saveGameState(createGameState());
  }

  async function handleSkipQuestion() {
    await handleNextQuestion();
  }

  async function handleCancelPause() {
    await saveGameState({ ...gameState, pause: null, timerEndsAt: null });
  }

  async function handleFreeTextNext(name: string) {
    await handleNextQuestion();
  }

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-[28px] font-bold font-heading text-gold">
              {phaseLabel(gameState)} — Question {currentQuestionInRound(gameState)}
            </h1>
            <p className="text-muted mt-1">{active.length} joueur(s) actif(s) en course</p>
          </div>
          <button onClick={onManageQuestions} className="py-2 px-5 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold to-gold-dark text-dark-ink">📝 Gérer les questions</button>
        </div>
        {gameState.lastElimination && (
          <div className="rounded-xl p-4 bg-danger-strong/12 border border-danger-dark">
            <p className="text-danger font-bold mb-1">🚫 Fin de manche {gameState.lastElimination.round} — Éliminé(s) : {gameState.lastElimination.eliminatedNames.join(', ')}</p>
            <p className="text-body text-[13px]">Il reste {gameState.lastElimination.remaining} joueur(s) en course.</p>
          </div>
        )}
        {question && (
          <div className="w-full rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
            <p className="text-gold text-lg font-bold mb-3">{gameState.phase === 'review' ? '📚 DÉBRIEFING' : 'Question'}</p>
            <p className="text-ink text-base font-bold mb-3">{question.question}</p>
            <div className="mb-4 rounded-lg p-3 bg-gold/10 border border-gold/40">
              <p className="text-gold-dark text-[11px] font-bold mb-1 tracking-[0.5px]">👁️ RÉPONSE (visible uniquement par toi)</p>
              <p className="text-gold text-sm font-bold">
                {question.type === 'qcm' ? `${String.fromCharCode(65 + question.correct)}. ${question.options[question.correct]}` : question.type === 'numeric' ? `Cible : ${question.numericAnswer}` : `Référence : ${question.acceptedAnswer}`}
              </p>
            </div>
            {gameState.phase === 'review' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {question.options.map((option, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border ${idx === question.correct ? 'bg-brand-green/25 border-2 border-brand-green' : 'bg-black/30 border-[#64646433]'}`}>
                    <p className={`text-sm ${idx === question.correct ? 'text-brand-green font-bold' : 'text-body font-normal'}`}><b>{String.fromCharCode(65 + idx)}.</b> {option} {idx === question.correct && '✅'}</p>
                  </div>
                ))}
              </div>
            ) : gameState.phase === 'question' ? (
              question.type === 'qcm' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {question.options.map((option, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-black/30 border border-[#64646433]"><p className="text-body text-sm"><b>{String.fromCharCode(65 + idx)}.</b> {option}</p></div>
                  ))}
                </div>
              ) : question.type === 'numeric' ? (
                <div className="p-6 rounded-lg text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                  <p className="text-muted text-sm font-bold">⏱️ Temps de réponse — Saisie numérique</p>
                  {gameState.timerEndsAt && <p className="text-brand-green font-bold mt-2">{Math.max(0, Math.ceil((gameState.timerEndsAt - Date.now()) / 1000))}s restant{Math.ceil((gameState.timerEndsAt - Date.now()) / 1000) > 1 ? 's' : ''}</p>}
                </div>
              ) : (
                <div className="p-6 rounded-lg text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                  <p className="text-muted text-sm font-bold mb-3">❓ Réponse libre — Validation animatrice</p>
                  <div className="flex flex-col gap-2">
                    {active.map((player) => {
                      const submission = gameState.submittedAnswers[player.name];
                      if (!submission) return null;
                      return (
                        <div key={player.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30">
                          <div>
                            <span className="text-gold font-bold">{player.name}</span>
                            <span className="text-body ml-2">→ {submission.value}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleFreeTextValidate(player.name, true)} className="px-3 py-1 rounded-lg bg-brand-green text-dark-ink font-bold text-sm">Correct</button>
                            <button onClick={() => handleFreeTextValidate(player.name, false)} className="px-3 py-1 rounded-lg bg-danger-strong/20 text-danger font-bold text-sm">Incorrect</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}
        <div className="w-full rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
          {gameState.phase === 'review' ? (
            <>
              <p className="text-muted text-sm mb-3 font-bold">📚 DÉBRIEFING</p>
              <p className="text-gold text-sm mb-3">La bonne réponse est en évidence ci-dessus. Débattez ! 💬</p>
            </>
          ) : gameState.currentBuzz ? (
            <>
              <p className="text-muted text-sm mb-2">Buzzé</p>
              <p className="text-4xl font-black mb-6 text-brand-green [text-shadow:0_0_20px_rgba(57,255,106,0.5)]">{gameState.currentBuzz.name}</p>
              <div className="flex gap-3">
                <button onClick={handleGoodAnswer} className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">✓ Bonne (+1)</button>
                <button onClick={handleWrongAnswer} className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border">✗ Mauvaise</button>
              </div>
            </>
          ) : gameState.phase === 'question' ? (
            <>
              <p className="text-muted text-sm mb-1 font-bold">⏳ En attente de réponses...</p>
              {gameState.wrongBuzzers.length > 0 && <p className="text-danger text-[13px] mb-3">Déjà écarté(s) sur cette question : {gameState.wrongBuzzers.map((id) => gameState.players.find((p) => p.id === id)?.name).join(', ')}</p>}
              {question?.type === 'numeric' && (
                <div className="mb-3">
                  <p className="text-body text-sm mb-2">Réponses reçues :</p>
                  {active.map((player) => {
                    const submission = gameState.submittedAnswers[player.name];
                    if (!submission) return null;
                    const outcome = computeNumericOutcome(question, submission.value);
                    return (
                      <div key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-black/30 mb-1">
                        <span className="text-gold">{player.name}</span>
                        <span className="text-body">{submission.value}</span>
                        <span className={`font-bold ${outcome.correct ? 'text-brand-green' : 'text-danger'}`}>écart : {outcome.diff === Infinity ? '?' : outcome.diff}</span>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 mt-2">
                    {gameState.timerEndsAt && (
                      <button onClick={handleAutoResolve} className="flex-1 py-2 rounded-lg bg-brand-green text-dark-ink font-bold">Résoudre ({getNumericWinners().join(', ') || 'personne'})</button>
                    )}
                  </div>
                </div>
              )}
              {question?.type === 'qcm' && (
                <div className="mb-3">
                  <p className="text-body text-sm mb-2">Réponses reçues :</p>
                  {active.map((player) => {
                    const submission = gameState.submittedAnswers[player.name];
                    if (!submission) return null;
                    const correct = computeQcmOutcome(question, submission.value);
                    return (
                      <div key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-black/30 mb-1">
                        <span className="text-gold">{player.name}</span>
                        <span className="text-body">{submission.value}</span>
                        <span className={`font-bold ${correct ? 'text-brand-green' : 'text-danger'}`}>{correct ? '✓' : '✗'}</span>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 mt-2">
                    {gameState.timerEndsAt && (
                      <button onClick={handleQcmAutoResolve} className="flex-1 py-2 rounded-lg bg-brand-green text-dark-ink font-bold">Résoudre ({getQcmWinners().join(', ') || 'personne'})</button>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={handleRevealOptions} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border">Montrer la réponse 👀</button>
                <button onClick={handleSkipQuestion} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-[#64646433] text-muted border border-line">Passer ⏭️</button>
                {(question?.type === 'numeric' || question?.type === 'qcm') && !gameState.timerEndsAt && (
                  <button onClick={handleStartTimer} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">▶️ Commencer le timer</button>
                )}
              </div>
            </>
          ) : gameState.pause ? (
            <button onClick={handleCancelPause} className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">▶️ Continuer</button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sorted.slice(0, 3).map((player, idx) => (
            <div key={player.id} className={`rounded-xl p-4 text-center border ${idx === 0 ? 'bg-linear-to-br from-gold/20 to-gold-dark/10 border-gold/33' : 'bg-panel/60 border-brand-green/13'}`}>
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
          {allPlayers.length === 0 ? <p className="text-faint text-center py-5">Aucun joueur connecté</p> : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {sorted.map((player, idx) => {
                const eliminated = isPlayerEliminated(gameState, player.name);
                return (
                  <div key={player.id} className={`flex justify-between items-center p-3 rounded-lg bg-black/30 ${eliminated ? 'opacity-50' : ''}`}>
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
        {gameState.phase === 'review' && (
          <div className="flex flex-col gap-3">
            <button onClick={handleNextQuestion} className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">✨ Question suivante</button>
            <button onClick={handleResetGame} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border">Recommencer</button>
          </div>
        )}
        {gameOver && (
          <div className="rounded-xl p-6 text-center bg-gold/10 border-2 border-gold">
            <p className="text-gold text-2xl font-bold mb-2">🎉 JEU TERMINÉ ! 🎉</p>
            <p className="text-brand-green text-lg font-bold">{gameState.winnerId ? `🏆 ${gameState.players.find((p) => p.id === gameState.winnerId)?.name} remporte la victoire !` : 'Aucun gagnant'}</p>
            <button onClick={handleResetGame} className="mt-6 w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border">Nouvelle partie</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ HOST LOBBY ============

function HostLobbyView({ gameState, saveGameState, onManageQuestions, onStartTest, onPreviewLive }: { gameState: GameState; saveGameState: SaveGameState; onManageQuestions?: () => void; onStartTest?: () => void; onPreviewLive?: () => void }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  async function startGame() {
    await saveGameState({ ...gameState, gameStarted: true, activePlayerIds: allPlayers.map((player) => player.id), eliminationPlan: calculateEliminations(allPlayers.length), phase: 'question', round: 'buzzer', questionIndex: 0 });
  }
  async function resetGame() {
    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser le jeu ?')) await saveGameState(createGameState());
  }
  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-center font-heading text-gold">🎮 Lobby</h1>
        <div className="rounded-2xl p-8 text-center bg-panel/80 border border-brand-green/27">
          <p className="text-muted text-sm mb-4">En attente de joueurs...</p>
          <p className="text-5xl font-black text-brand-green mb-2">{allPlayers.length}</p>
          <p className="text-body text-base">Joueur{allPlayers.length !== 1 ? 's' : ''} connecté{allPlayers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl p-6 bg-panel/60 border border-brand-green/13">
          <p className="text-gold font-bold mb-3">Liste des joueurs</p>
          {allPlayers.length === 0 ? <p className="text-faint text-center py-5">Aucun joueur pour l'instant. Partage le lien ! 📤</p> : (
            <div className="flex flex-col gap-2">
              {sorted.map((player, idx) => (
                <div key={player.id} className="flex items-center gap-3 p-4 rounded-lg bg-black/30">
                  <span className="text-brand-green font-bold text-lg">#{idx + 1}</span>
                  <span className="text-gold font-medium">{player.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={startGame} disabled={allPlayers.length === 0} className="w-full py-5 rounded-xl font-bold text-lg transition-transform active:scale-95 disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">🚀 Démarrer le jeu</button>
          <button onClick={resetGame} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border">Réinitialiser</button>
          {onManageQuestions && <button onClick={onManageQuestions} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold to-gold-dark text-dark-ink">📝 Gérer les questions</button>}
          {onStartTest && <button onClick={onStartTest} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border">🤖 Mode test (4 bots)</button>}
          {onPreviewLive && <button onClick={onPreviewLive} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold/80 to-gold-dark/80 text-dark-ink">👁️ Preview Live</button>}
        </div>
        <p className="text-line text-xs text-center">Partage ce lien avec tes joueurs. Une fois prêt, clique "Démarrer le jeu". <br />Les joueurs qui rejoignent après ne pourront que regarder les stats. 👀</p>
      </div>
    </div>
  );
}

// ============ TEST MODE ============

function TestModeView({ gameState, banks, saveGameState, onExit }: { gameState: GameState; banks: QuestionBanks; saveGameState: SaveGameState; onExit: () => void }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  const [simulating, setSimulating] = useState(false);
  useEffect(() => { if (!gameState.gameStarted && gameState.players.length >= 4) { const activePlayerIds = gameState.players.map((player) => player.id); saveGameState({ ...gameState, gameStarted: true, activePlayerIds, phase: 'question', round: 'buzzer', questionIndex: 0 }); } }, [gameState.gameStarted, gameState.players, saveGameState]);
  useEffect(() => { if (gameState.currentBuzz && !prevBuzzRef.current && !simulating) playBuzzSound(); prevBuzzRef.current = gameState.currentBuzz; }, [gameState.currentBuzz, simulating]);
  useEffect(() => {
    if (!gameState.currentBuzz || simulating) return;
    const delay = 1000 + Math.random() * 3000;
    const timer = setTimeout(async () => {
      setSimulating(true);
      const winner = gameState.currentBuzz.name;
      const winnerId = gameState.currentBuzz.playerId;
      const updatedPlayers = gameState.players.map((p) => p.id === winnerId ? { ...p, score: p.score + 1 } : p);
      await saveGameState({ ...gameState, players: updatedPlayers, currentBuzz: null, phase: 'review', wrongBuzzers: [], activePlayerIds: gameState.activePlayerIds });
      setSimulating(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [gameState.currentBuzz, gameState.players, gameState.wrongBuzzers, saveGameState, simulating]);
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const question = getCurrentQuestion(gameState, banks);
  const gameOver = gameState.phase === 'game-over';
  async function handleNext() {
    const round = gameState.round;
    const roundQuestions = questionsForRound(banks, round);
    const nextIndex = gameState.questionIndex + 1;
    const endOfRound = nextIndex >= roundQuestions.length;
    let nextRound = round;
    let nextIndex2 = nextIndex;
    let activePlayerIds = gameState.activePlayerIds;
    if (endOfRound) {
      if (round === 'buzzer') { nextRound = 'simultaneous'; nextIndex2 = 0; }
      else if (round === 'simultaneous') { nextRound = 'final'; nextIndex2 = 0; }
      else { nextIndex2 = (gameState.questionIndex + 1) % roundQuestions.length; }
    }
    await saveGameState({ ...gameState, currentBuzz: null, phase: 'question', round: nextRound, questionIndex: nextIndex2, activePlayerIds, wrongBuzzers: [], submittedAnswers: {}, answerOutcomes: {} });
  }
  async function handleReset() { await saveGameState(createGameState()); }
  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold font-heading text-gold">🤖 Mode test</h1>
          <button onClick={onExit} className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line">← Retour</button>
        </div>
        <p className="text-muted text-sm">Simulation automatique avec {TEST_BOTS.length} bots. Le jeu avance tout seul.</p>
        {question && (
          <div className="w-full rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
            <p className="text-gold text-lg font-bold mb-3">{gameState.phase === 'review' ? '📚 DÉBRIEFING' : 'Question'}</p>
            <p className="text-ink text-base font-bold mb-3">{question.question}</p>
            <div className="mb-4 rounded-lg p-3 bg-gold/10 border border-gold/40">
              <p className="text-gold-dark text-[11px] font-bold mb-1 tracking-[0.5px]">👁️ RÉPONSE (visible uniquement par toi)</p>
              <p className="text-gold text-sm font-bold">{question.type === 'qcm' ? `${String.fromCharCode(65 + question.correct)}. ${question.options[question.correct]}` : `Cible : ${question.numericAnswer}`}</p>
            </div>
            {gameState.phase === 'review' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {question.options.map((option, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border ${idx === question.correct ? 'bg-brand-green/25 border-2 border-brand-green' : 'bg-black/30 border-[#64646433]'}`}>
                    <p className={`text-sm ${idx === question.correct ? 'text-brand-green font-bold' : 'text-body font-normal'}`}><b>{String.fromCharCode(65 + idx)}.</b> {option} {idx === question.correct && '✅'}</p>
                  </div>
                ))}
              </div>
            ) : gameState.phase === 'question' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {question.options.map((option, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-black/30 border border-[#64646433]"><p className="text-body text-sm"><b>{String.fromCharCode(65 + idx)}.</b> {option}</p></div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {gameState.currentBuzz && (
          <div className="rounded-2xl p-6 text-center bg-linear-to-br from-brand-green/20 to-brand-green/5 border-2 border-brand-green">
            <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">BUZZÉ</p>
            <p className="text-4xl font-black text-brand-green [text-shadow:0_0_20px_rgba(57,255,106,0.5)]">{gameState.currentBuzz.name}</p>
            {simulating && <p className="text-muted text-sm mt-2">🤖 Bot en train de répondre...</p>}
          </div>
        )}
        {gameState.wrongBuzzers.length > 0 && <div className="rounded-2xl p-4 bg-black/30 border border-danger-dark/33"><p className="text-danger text-sm">❌ Déjà écarté(s) : {gameState.wrongBuzzers.map((id) => gameState.players.find((p) => p.id === id)?.name).join(', ')}</p></div>}
        <div className="rounded-xl p-4 bg-panel/50 border border-brand-green/13">
          <p className="text-gold font-bold mb-3">Classement</p>
          <div className="flex flex-col gap-2">
            {sorted.map((player, idx) => (
              <div key={player.id} className={`flex justify-between items-center p-3 rounded-lg bg-black/30 ${isPlayerEliminated(gameState, player.name) ? 'opacity-50' : ''}`}>
                <span className="text-gold font-medium">{player.name}</span>
                <span className="text-brand-green font-bold">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
        {gameState.phase === 'review' && <button onClick={handleNext} className="w-full py-4 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">✨ Question suivante</button>}
        {gameOver && (
          <div className="rounded-xl p-6 text-center bg-gold/10 border-2 border-gold">
            <p className="text-gold text-2xl font-bold mb-2">🎉 TEST TERMINÉ ! 🎉</p>
            <button onClick={handleReset} className="mt-4 w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border">Relancer le test</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ LIVE VIEW ============

function LiveView({ gameState, banks, onExit, eliminatedPlayerName }: { gameState: GameState; banks: QuestionBanks; onExit?: () => void; eliminatedPlayerName?: string }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const question = getCurrentQuestion(gameState, banks);
  const questionNum = currentQuestionInRound(gameState);
  const hasBuzz = !!gameState.currentBuzz;
  const myScore = eliminatedPlayerName ? allPlayers.find((player) => player.name === eliminatedPlayerName)?.score || 0 : 0;
  const myRank = eliminatedPlayerName ? sorted.findIndex((player) => player.name === eliminatedPlayerName) + 1 : 0;
  const active = getActivePlayers(gameState);
  const timerDisplay = gameState.timerEndsAt && gameState.phase === 'question' && !gameState.pause ? Math.max(0, Math.ceil((gameState.timerEndsAt - Date.now()) / 1000)) : 0;

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-8">
      <Glow />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-2 rounded-full mb-3 bg-brand-green/15 border border-brand-green">
            <p className="text-brand-green text-xs font-bold tracking-[1px]">🔴 LIVE</p>
          </div>
          <h1 className="text-gold text-4xl sm:text-5xl font-bold font-heading mb-2">Questions pour un Fonceday</h1>
          <p className="text-muted text-sm">{phaseLabel(gameState)} • Question {questionNum}</p>
        </div>
        {eliminatedPlayerName && (
          <div className="rounded-2xl p-5 mb-8 text-center bg-danger-strong/12 border-2 border-danger-dark">
            <p className="text-danger font-bold text-lg mb-1">❌ {eliminatedPlayerName}, tu as été éliminé de la partie</p>
            <p className="text-body text-sm">Tu peux continuer à suivre la partie en direct ci-dessous ! 📊</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {question && (
              <div className="rounded-3xl p-8 bg-panel/90 border-2 border-brand-green/27">
                <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">{gameState.phase === 'review' ? '📚 DÉBRIEFING' : 'QUESTION'}</p>
                <p className="text-ink text-[28px] font-bold mb-5 leading-[1.4]">{question.question}</p>
                {gameState.phase === 'review' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {question.options.map((option, idx) => (
                      <div key={idx} className={`p-5 rounded-xl border ${idx === question.correct ? 'bg-brand-green/25 border-2 border-brand-green' : 'bg-black/30 border-[#64646433]'}`}>
                        <p className={`text-base ${idx === question.correct ? 'text-brand-green font-bold' : 'text-body font-normal'}`}><span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>{option} {idx === question.correct && '✅'}</p>
                      </div>
                    ))}
                  </div>
                ) : gameState.phase === 'question' && question.type === 'qcm' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {question.options.map((option, idx) => (
                      <div key={idx} className="p-5 rounded-xl bg-black/30 border border-[#64646433]"><p className="text-body text-base"><span className="text-brand-green font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>{option}</p></div>
                    ))}
                  </div>
                ) : gameState.phase === 'question' && question.type === 'numeric' ? (
                  <div className="p-8 rounded-xl text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                    <p className="text-muted text-lg font-bold">⏱️ Chiffre le plus proche</p>
                    {timerDisplay > 0 && <p className="text-brand-green text-3xl font-black mt-2">{timerDisplay}s</p>}
                    {gameState.phase === 'review' && (
                      <div className="mt-4">
                        {active.map((player) => {
                          const submission = gameState.submittedAnswers[player.name];
                          if (!submission) return null;
                          const outcome = computeNumericOutcome(question, submission.value);
                          return (
                            <div key={player.id} className="flex justify-between items-center p-3 rounded-lg bg-black/30 mt-2">
                              <span className="text-gold">{player.name}</span>
                              <span className="text-body">{submission.value}</span>
                              <span className={`font-bold ${outcome.correct ? 'text-brand-green' : 'text-danger'}`}>écart : {outcome.diff === Infinity ? '?' : outcome.diff}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : gameState.phase === 'question' ? (
                  <div className="p-8 rounded-xl text-center bg-brand-green/10 border-2 border-dashed border-brand-green"><p className="text-muted text-lg font-bold">❓ Réponse libre</p></div>
                ) : null}
              </div>
            )}
            {gameState.lastElimination && (
              <div className="rounded-2xl p-5 bg-danger-strong/15 border-2 border-danger-dark">
                <p className="text-danger font-bold text-base mb-1">🚫 Éliminé(s) : {gameState.lastElimination.eliminatedNames.join(', ')}</p>
                <p className="text-body text-[13px]">Il reste {gameState.lastElimination.remaining} joueur(s) en course !</p>
              </div>
            )}
            {hasBuzz && (
              <div className="rounded-3xl p-8 text-center bg-linear-to-br from-brand-green/20 to-brand-green/5 border-2 border-brand-green">
                <p className="text-muted text-xs font-bold mb-3 tracking-[1px]">BUZZÉ</p>
                <p className="text-5xl font-black text-brand-green [text-shadow:0_0_30px_rgba(57,255,106,0.6)]">{gameState.currentBuzz!.name}</p>
              </div>
            )}
            {gameState.pause && (
              <div className="rounded-3xl p-8 text-center bg-warn-bg border-2 border-warn-border">
                <p className="text-gold-dark text-lg font-bold">⏸️ Pause — {gameState.pause.joker === 'phone-a-stranger' ? 'Appel à un inconnu en cours' : 'Aide d\'un adversaire en cours'}</p>
                {gameState.pause.remainingMs !== null && <p className="text-body text-sm mt-2">Temps restant : {Math.ceil(gameState.pause.remainingMs / 1000)}s</p>}
              </div>
            )}
            {gameState.wrongBuzzers.length > 0 && (
              <div className="rounded-2xl p-4 bg-black/30 border border-danger-dark/33">
                <p className="text-danger text-sm">❌ Déjà écarté(s) : {gameState.wrongBuzzers.map((id) => gameState.players.find((p) => p.id === id)?.name).join(', ')}</p>
              </div>
            )}
          </div>
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
              {sorted.length === 0 ? <p className="text-faint text-center py-5">Aucun joueur</p> : (
                <div className="flex flex-col gap-3">
                  {sorted.slice(0, 5).map((player, idx) => {
                    const eliminated = isPlayerEliminated(gameState, player.name);
                    return (
                      <div key={player.id} className={`flex items-center gap-3 p-4 rounded-xl border ${idx === 0 ? 'bg-gold/10 border-gold/33' : 'bg-black/30 border-[#64646433]'} ${eliminated ? 'opacity-45' : ''}`}>
                        <span className={`font-bold min-w-[30px] ${idx === 0 ? 'text-gold text-xl' : 'text-brand-green text-base'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-ink font-semibold text-[15px] break-words ${eliminated ? 'line-through' : ''}`}>{player.name}{eliminated && ' ❌'}</p>
                        </div>
                        <span className="text-brand-green font-bold text-lg min-w-[50px] text-right">{player.score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-3xl p-6 bg-panel/80 border border-brand-green/13">
              <p className="text-muted text-xs font-bold mb-2 tracking-[1px]">STATS</p>
              <div className="space-y-4">
                <div><p className="text-muted text-xs mb-1">Joueurs en course</p><p className="text-brand-green text-2xl font-bold">{active.length} / {allPlayers.length}</p></div>
                <div><p className="text-muted text-xs mb-1">Manche</p><p className="text-gold text-2xl font-bold">{phaseLabel(gameState)}</p></div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-gold text-lg sm:text-xl font-semibold font-heading italic">Ça se passe sur le Discord de Kanaé ! 🎮</p>
        </div>
        {onExit && (
          <div className="mt-6 text-center">
            <button onClick={onExit} className="px-6 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line">Quitter le live</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ UTILITIES ============

function applyElimination(state: GameState, count: number): { kept: string[]; eliminated: string[] } {
  const activeData = getActivePlayers(state);
  if (count >= activeData.length) return { kept: [], eliminated: activeData.map((player) => player.name) };
  const rankedDesc = [...activeData].sort((a, b) => b.score - a.score);
  const kept = rankedDesc.slice(count).map((player) => player.id);
  const eliminated = rankedDesc.slice(0, count).map((player) => player.name);
  return { kept, eliminated };
}

function phaseLabel(state: GameState): string {
  switch (state.phase) {
    case 'lobby': return 'Lobby';
    case 'question': return state.round === 'buzzer' ? 'Manche buzzer' : state.round === 'simultaneous' ? 'Manche simultanee' : 'Finale';
    case 'review': return 'Révision';
    case 'pause': return 'Pause joker';
    case 'tiebreak': return 'Départage';
    case 'game-over': return 'Terminé';
    default: return '—';
  }
}

function currentQuestionInRound(state: GameState): number {
  return state.questionIndex + 1;
}

function Glow() { return <div className="absolute inset-0 pointer-events-none app-glow" />; }
