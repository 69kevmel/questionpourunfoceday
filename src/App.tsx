import { useState, useEffect, useRef } from 'react';
import { ref, onValue, runTransaction } from 'firebase/database';
import { db, isFirebaseConfigured } from './firebase';
import buzzSoundUrl from './assets/dry-cough-soundbible.mp3';
import fonceyPosterUrl from './assets/fonceday-poster.webp';
import QuestionManager from './components/QuestionManager';
import { loadQuestionBanks } from './lib/questionManager';
import type { QuestionBanks, GameState, QuestionRound, Question } from './lib/game';
import {
  createGameState,
  normalizeGameState,
  getCurrentQuestion,
  getActivePlayers,
  timerDuration,
  calculateEliminations,
  advanceGame,
  resolveEliminationTie,
  isValidPlayerName,
  computeNumericOutcome,
  computeQcmOutcome,
  computeFreeTextOutcome,
} from './lib/game';

const STATE_PATH = 'fonceday-game-state';
const SOCIAL_LINK = 'https://linktr.ee/kanaeclub?utm_source=linktree_profile_share&ltsid=f022cf4b-fffb-4e58-9fb5-8ee79d86e340';
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 15;
let serverTimeOffsetMs = 0;

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

function isPlayerEliminated(state: GameState, playerName: string): boolean {
  if (!state.gameStarted) return false;
  if (state.activePlayerIds.includes(getPlayerId(state, playerName))) return false;
  return getActivePlayers(state).some((player) => player.name === playerName) ||
         state.players.some((player) => player.name === playerName);
}

function getPlayerId(state: GameState, playerName: string): string {
  return state.players.find((player) => player.name === playerName)?.id || playerName;
}

function getSubmission(state: GameState, playerId: string, playerName: string) {
  return state.submittedAnswers[playerId] || state.submittedAnswers[playerName];
}

function getQuestionWinnerIds(state: GameState, question: Question): string[] {
  const entries = getActivePlayers(state).map((player) => {
    const submission = getSubmission(state, player.id, player.name);
    if (!submission) return null;
    if (question.type === 'numeric') {
      const outcome = computeNumericOutcome(question, submission.value);
      return Number.isFinite(outcome.diff) ? { playerId: player.id, correct: outcome.correct, diff: outcome.diff, submittedAt: submission.submittedAt } : null;
    }
    const correct = question.type === 'qcm'
      ? computeQcmOutcome(question, submission.value)
      : computeFreeTextOutcome(question, submission.value);
    return { playerId: player.id, correct, diff: correct ? 0 : Infinity, submittedAt: submission.submittedAt };
  }).filter((entry): entry is { playerId: string; correct: boolean; diff: number; submittedAt: number } => entry !== null);

  if (question.type !== 'numeric') return entries.filter((entry) => entry.correct).map((entry) => entry.playerId);
  if (!entries.length) return [];
  const bestDiff = Math.min(...entries.map((entry) => entry.diff));
  return entries
    .filter((entry) => entry.diff === bestDiff)
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .slice(0, 1)
    .map((entry) => entry.playerId);
}

async function updateGameState(update: (current: GameState) => GameState): Promise<void> {
  if (!db) return;
  await runTransaction(ref(db, STATE_PATH), (current: unknown) => update(normalizeGameState(current)));
}

function timestamp(): number {
  return Date.now() + serverTimeOffsetMs;
}

// ============ APP ============

export default function FoncedayLive() {
  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState('');
  const [playerId, setPlayerId] = useState(() => typeof window === 'undefined' ? '' : sessionStorage.getItem('fonceday-player-id') || '');
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
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/live' || new URLSearchParams(window.location.search).get('live') === '1';
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

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    return onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
      serverTimeOffsetMs = Number(snapshot.val()) || 0;
    });
  }, []);

  async function saveGameState(newState: GameState) {
    try {
      await updateGameState(() => newState);
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
  const gameBanks = gameState?.questionBanks || loadedBanks;

  if (isLiveUrlView && gameState) return <LiveView gameState={gameState} banks={gameBanks} />;

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
    const registeredPlayer = gameState.players.find((player) => player.id === playerId && player.name === name);
    const isActivePlayer = registeredPlayer ? gameState.activePlayerIds.includes(registeredPlayer.id) : false;
    const wasRegistered = Boolean(registeredPlayer);
    if (gameState.phase === 'game-over' && wasRegistered) return <LiveView gameState={gameState} banks={gameBanks} eliminatedPlayerName={name} />;
    if (isActivePlayer && gameState.gameStarted) return <PlayerView key={`${gameState.round}-${gameState.questionIndex}-${gameState.phase}`} gameState={gameState} banks={gameBanks} playerName={name} />;
    if (!gameState.gameStarted) return <LobbyPlayerView gameState={gameState} playerName={name} playerId={playerId} onRegistered={setPlayerId} onBack={() => { setName(''); setNameInput(''); setRole('join'); }} />;
    if (wasRegistered) return <LiveView gameState={gameState} banks={gameBanks} eliminatedPlayerName={name} />;
    return <SpectatorView gameState={gameState} />;
  }

  if (role === 'host' && gameState) {
    if (showQuestionManager && !gameState.gameStarted) return <QuestionManager onExit={() => setShowQuestionManager(false)} />;
    if (testMode) return <TestModeView onExit={() => setTestMode(false)} />;
    if (previewLive) return <LiveView gameState={gameState} banks={gameBanks} onExit={() => setPreviewLive(false)} />;
    return <HostView gameState={gameState} banks={gameBanks} saveGameState={saveGameState} onManageQuestions={() => setShowQuestionManager(true)} onStartTest={() => setTestMode(true)} onPreviewLive={() => setPreviewLive(true)} />;
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
  const valid = isValidPlayerName(nameInput);
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-4">
        <p className="text-center mb-2 text-body">Ton pseudo pour la partie</p>
        <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Pseudo" maxLength={20} className="px-4 py-3 rounded-xl text-center outline-none bg-panel border border-brand-green/33 text-ink" />
        {nameInput.trim() && !valid && <p className="text-danger text-xs text-center">Entre 2 et 20 caractères, sans . # $ [ ] ou /</p>}
        <button disabled={!valid} onClick={onSubmit} className="py-3 rounded-xl font-bold disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">Entrer</button>
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

function LobbyPlayerView({ gameState, playerName, playerId, onRegistered, onBack }: { gameState: GameState; playerName: string; playerId: string; onRegistered: (id: string) => void; onBack: () => void }) {
  const registeredRef = useRef(false);
  const [registrationId] = useState(() => playerId || `player-${timestamp()}-${Math.random().toString(36).slice(2, 8)}`);
  const [registrationError, setRegistrationError] = useState('');
  useEffect(() => {
    if (registeredRef.current) return;
    const alreadyKnown = gameState.players.some((player) => player.id === playerId && player.name === playerName);
    if (alreadyKnown) { registeredRef.current = true; return; }
    if (!db) return;
    async function registerPlayer() {
      const stateRef = ref(db!, STATE_PATH);
      const id = registrationId;
      const result = await runTransaction(stateRef, (current: unknown) => {
        const base = normalizeGameState(current);
        if (base.gameStarted || base.players.length >= MAX_PLAYERS || !isValidPlayerName(playerName)) return base;
        if (base.players.some((player) => player.id === id)) return base;
        if (base.players.some((player) => player.name.toLocaleLowerCase() === playerName.toLocaleLowerCase())) return base;
        return { ...base, players: [...base.players, { id, name: playerName, score: 0 }], activePlayerIds: [...base.activePlayerIds, id] };
      });
      const saved = normalizeGameState(result.snapshot.val()).players.some((player) => player.id === id && player.name === playerName);
      if (saved) {
        registeredRef.current = true;
        sessionStorage.setItem('fonceday-player-id', id);
        onRegistered(id);
      } else {
        registeredRef.current = true;
        setRegistrationError(gameState.players.length >= MAX_PLAYERS ? 'Le lobby est complet.' : 'Ce pseudo est déjà utilisé. Choisis-en un autre.');
      }
    }
    void registerPlayer();
  }, [playerId, playerName, registrationId, gameState.players, onRegistered]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        <h1 className="text-[32px] font-bold font-heading text-gold">Lobby</h1>
        <div className="w-full rounded-2xl p-6 text-center bg-panel/80 border border-brand-green/27">
          <p className="text-sm mb-3 text-body">Bienvenue <b className="text-gold">{playerName}</b> !</p>
          <p className={`text-[13px] ${registrationError ? 'text-danger' : 'text-muted'}`}>{registrationError || 'En attente du démarrage... 🎮'}</p>
          {registrationError && <button onClick={onBack} className="mt-4 px-4 py-2 rounded-lg bg-[#64646433] text-body border border-line font-bold">Changer de pseudo</button>}
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
  const timerLeft = useCountdown(gameState.timerEndsAt, gameState.phase === 'question');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [numericInput, setNumericInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const playerId = getPlayerId(gameState, playerName);
  const question = getCurrentQuestion(gameState, banks);
  const submission = gameState.submittedAnswers[playerId] || gameState.submittedAnswers[playerName];
  const submitted = submission?.round === gameState.round && submission.questionIndex === gameState.questionIndex;

  useEffect(() => {
    if (gameState.currentBuzz && !prevBuzzRef.current && gameState.currentBuzz.playerId !== playerId) {
      playBuzzSound();
    }
    prevBuzzRef.current = gameState.currentBuzz;
  }, [gameState.currentBuzz, playerId]);

  async function submitAnswer(value: string) {
    if (!question || submitted || !value.trim()) return;
    const expectedRound = gameState.round;
    const expectedIndex = gameState.questionIndex;
    const submittedAt = timestamp();
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== expectedRound || current.questionIndex !== expectedIndex) return current;
      if (!current.activePlayerIds.includes(playerId) || !current.timerEndsAt || submittedAt > current.timerEndsAt) return current;
      if (current.submittedAnswers[playerId]) return current;
      return {
        ...current,
        submittedAnswers: {
          ...current.submittedAnswers,
          [playerId]: { value: value.trim(), submittedAt, round: expectedRound, questionIndex: expectedIndex },
        },
      };
    });
  }

  async function handleBuzz() {
    if (gameState.currentBuzz || gameState.round !== 'buzzer') return;
    playBuzzSound();
    const buzzedAt = timestamp();
    const expectedIndex = gameState.questionIndex;
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== 'buzzer' || current.questionIndex !== expectedIndex || current.currentBuzz) return current;
      if (!current.activePlayerIds.includes(playerId) || current.wrongBuzzers.includes(playerId)) return current;
      return { ...current, currentBuzz: { playerId, name: playerName, ts: buzzedAt } };
    });
  }

  function handleValidate() {
    if (!question) return;
    const value = question.type === 'qcm'
      ? (selectedOption === null ? '' : String.fromCharCode(65 + selectedOption))
      : question.type === 'numeric' ? numericInput : textInput;
    void submitAnswer(value);
  }

  const allPlayers = gameState.players || [];
  const playerScore = allPlayers.find((player) => player.name === playerName)?.score || 0;
  const playerRank = [...allPlayers].sort((a, b) => b.score - a.score).findIndex((player) => player.name === playerName) + 1;
  const iBuzzed = gameState.currentBuzz?.playerId === playerId;
  const someoneElseBuzzed = !!gameState.currentBuzz && gameState.currentBuzz.playerId !== playerId;
  const alreadyWrong = gameState.wrongBuzzers.includes(playerId);
  const active = gameState.activePlayerIds.includes(playerId);
  const canSubmit = gameState.phase === 'question' && timerLeft > 0 && !submitted;

  const buzzDisabled = !!gameState.currentBuzz || alreadyWrong || gameState.round !== 'buzzer';
  const buzzBg = gameState.currentBuzz ? (iBuzzed ? 'bg-linear-to-br from-gold to-gold-dark' : 'bg-buzzed') : alreadyWrong ? 'bg-buzzed' : 'bg-linear-to-br from-brand-green to-brand-green-dark';
  const buzzText = 'text-dark-ink';
  const buzzShadow = !buzzDisabled ? 'shadow-[0_0_50px_rgba(57,255,106,0.55),0_10px_30px_rgba(0,0,0,0.5)]' : '';

  let buzzLabel = 'BUZZ';
  if (gameState.currentBuzz) { buzzLabel = iBuzzed ? "C'EST TOI !" : 'BUZZÉ'; }
  else if (alreadyWrong) { buzzLabel = 'DÉJÀ TENTÉ'; }

  function renderQuestionContent() {
    if (!question) return null;
    if (gameState.phase === 'review') return <AnswerReveal question={question} selectedValue={submission?.value} compact />;
    if (gameState.phase === 'tiebreak') return <div className="p-4 rounded-lg text-center bg-gold/10 border border-gold-dark"><p className="text-gold font-bold">Départage en cours avec l'animateur</p></div>;
    if (gameState.round === 'buzzer') return question.type === 'qcm'
      ? <QuestionOptions question={question} />
      : <div className="p-4 rounded-lg text-center bg-brand-green/8 border border-dashed border-brand-green/33"><p className="text-[13px] font-bold text-muted">Buzz puis réponds oralement sur Discord</p></div>;
    if (!gameState.timerEndsAt) return <div className="p-4 rounded-lg text-center bg-black/30 border border-line"><p className="text-sm font-bold text-muted">En attente du lancement du timer</p></div>;
    if (submitted) return <div className="p-4 rounded-lg text-center bg-brand-green/10 border border-brand-green"><p className="font-bold text-brand-green">Réponse envoyée</p><p className="mt-1 text-sm text-body">{submission.value}</p></div>;

    switch (question.type) {
      case 'qcm':
        return (
          <div className="flex flex-col gap-2">
            {question.options.map((option, index) => (
                <button key={index} onClick={() => setSelectedOption(index)} className={`px-3 py-2 rounded-lg text-sm border text-left ${selectedOption === index ? 'bg-brand-green/25 border-brand-green text-brand-green font-bold' : 'bg-black/30 border-transparent text-body'}`}>
                  {String.fromCharCode(65 + index)}. {option}
                </button>
            ))}
            <button onClick={handleValidate} disabled={!canSubmit || selectedOption === null} className="mt-1 px-4 py-2 rounded-lg bg-brand-green text-dark-ink font-bold disabled:opacity-40">Valider</button>
          </div>
        );
      case 'numeric':
        return (
          <div className="flex gap-2">
            <input value={numericInput} onChange={(e) => setNumericInput(e.target.value)} placeholder="Ex : 42 ou 3,14" className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-line text-ink" />
            <button onClick={handleValidate} disabled={!canSubmit || !numericInput.trim()} className="px-4 py-2 rounded-lg bg-brand-green text-dark-ink font-bold disabled:opacity-40">Valider</button>
          </div>
        );
      default:
        return <div className="flex gap-2"><input value={textInput} onChange={(event) => setTextInput(event.target.value)} placeholder="Ta réponse" className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-line text-ink" /><button onClick={handleValidate} disabled={!canSubmit || !textInput.trim()} className="px-4 py-2 rounded-lg bg-brand-green text-dark-ink font-bold disabled:opacity-40">Valider</button></div>;
    }
  }

  return (
    <div className="app-bg min-h-screen w-full flex flex-col items-center justify-center p-6">
      <Glow />
      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
        <div className="text-[13px] text-center text-muted">
          <b className="text-gold">{playerName}</b> • {phaseLabel(gameState)} • {currentQuestionInRound(gameState)}
          {gameState.phase === 'question' && timerLeft > 0 && <span className="ml-2 text-brand-green font-bold">{timerLeft}s</span>}
        </div>
        {question && (
          <div className="w-full max-w-md rounded-xl p-4 mb-4 bg-panel/70 border border-brand-green/20">
            <p className="text-sm font-bold mb-2 text-center text-gold">{question.question}</p>
            {renderQuestionContent()}
          </div>
        )}
        {gameState.phase === 'question' && gameState.round === 'buzzer' && active && (
          <button onClick={handleBuzz} disabled={buzzDisabled} className={`rounded-full flex items-center justify-center font-black transition-transform active:scale-95 disabled:active:scale-100 w-[200px] h-[200px] text-[28px] border-4 border-white/15 ${buzzBg} ${buzzText} ${buzzShadow}`}>
            {buzzLabel}
          </button>
        )}
        {gameState.phase === 'question' && gameState.round === 'buzzer' && !active && (
          <div className="rounded-full flex items-center justify-center w-[200px] h-[200px] text-[28px] border-4 border-white/15 bg-buzzed text-muted font-black">ÉLIMINÉ</div>
        )}
        <p className="text-muted min-h-[20px] text-sm text-center">
          {someoneElseBuzzed && `${gameState.currentBuzz!.name} a buzzé`}
          {!gameState.currentBuzz && alreadyWrong && "Tu t'es déjà trompé sur cette question, attends la suivante"}
        </p>
        <div className="mt-2 w-full max-w-md p-3 rounded-xl bg-panel/70 border border-brand-green/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted text-xs font-bold">Classement en direct</p>
            <p className="text-xs"><span className="text-gold font-bold">#{playerRank}</span> <span className="text-brand-green font-bold">{playerScore} pts</span></p>
          </div>
          <CompactScoreboard players={allPlayers} currentPlayerId={playerId} activePlayerIds={gameState.activePlayerIds} />
        </div>
      </div>
    </div>
  );
}

// ============ HOST VIEW ============

function HostView({ gameState, banks, saveGameState, onManageQuestions, onStartTest, onPreviewLive }: { gameState: GameState; banks: QuestionBanks; saveGameState: SaveGameState; onManageQuestions: () => void; onStartTest?: () => void; onPreviewLive?: () => void }) {
  const prevBuzzRef = useRef(gameState.currentBuzz);
  const [tieSelection, setTieSelection] = useState<string[]>([]);
  useEffect(() => { if (gameState.currentBuzz && !prevBuzzRef.current) playBuzzSound(); prevBuzzRef.current = gameState.currentBuzz; }, [gameState.currentBuzz]);

  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const active = getActivePlayers(gameState);
  const question = getCurrentQuestion(gameState, banks);
  const gameOver = gameState.phase === 'game-over';
  const timerLeft = useCountdown(gameState.timerEndsAt, gameState.phase === 'question');

  if (!gameState.gameStarted) return <HostLobbyView gameState={gameState} banks={banks} saveGameState={saveGameState} onManageQuestions={onManageQuestions} onStartTest={onStartTest} onPreviewLive={onPreviewLive} />;

  async function handleGoodAnswer() {
    const expectedBuzz = gameState.currentBuzz;
    const expectedIndex = gameState.questionIndex;
    if (!expectedBuzz) return;
    await updateGameState((current) => {
      const buzz = current.currentBuzz;
      if (current.phase !== 'question' || current.round !== 'buzzer' || current.questionIndex !== expectedIndex || !buzz) return current;
      if (buzz.playerId !== expectedBuzz.playerId || buzz.ts !== expectedBuzz.ts) return current;
      if (!current.players.some((player) => player.id === buzz.playerId)) return current;
      return {
        ...current,
        players: current.players.map((player) => player.id === buzz.playerId ? { ...player, score: player.score + 1 } : player),
        answerOutcomes: { [buzz.playerId]: { value: 'Réponse orale', correct: true, points: 1 } },
        currentBuzz: null,
        phase: 'review',
        wrongBuzzers: [],
      };
    });
  }

  async function handleWrongAnswer() {
    const expectedBuzz = gameState.currentBuzz;
    const expectedIndex = gameState.questionIndex;
    if (!expectedBuzz) return;
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== 'buzzer' || current.questionIndex !== expectedIndex || !current.currentBuzz) return current;
      if (current.currentBuzz.playerId !== expectedBuzz.playerId || current.currentBuzz.ts !== expectedBuzz.ts) return current;
      return {
        ...current,
        currentBuzz: null,
        wrongBuzzers: [...new Set([...current.wrongBuzzers, current.currentBuzz.playerId])],
      };
    });
  }

  async function handleRevealOptions() {
    const expectedRound = gameState.round;
    const expectedIndex = gameState.questionIndex;
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== expectedRound || current.questionIndex !== expectedIndex) return current;
      return { ...current, phase: 'review', currentBuzz: null, timerEndsAt: null };
    });
  }

  async function handleStartTimer() {
    if (!question) return;
    const expectedRound = gameState.round;
    const expectedIndex = gameState.questionIndex;
    const endsAt = timestamp() + timerDuration(question);
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round === 'buzzer' || current.timerEndsAt) return current;
      if (current.round !== expectedRound || current.questionIndex !== expectedIndex) return current;
      return { ...current, timerEndsAt: endsAt };
    });
  }

  async function handleResolveAnswers() {
    const expectedRound = gameState.round;
    const expectedIndex = gameState.questionIndex;
    const resolvedAt = timestamp();
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== expectedRound || current.questionIndex !== expectedIndex) return current;
      const currentQuestion = getCurrentQuestion(current, banks);
      if (!currentQuestion || current.round === 'buzzer') return current;
      const allSubmitted = getActivePlayers(current).every((player) => Boolean(getSubmission(current, player.id, player.name)));
      if (!allSubmitted && (!current.timerEndsAt || resolvedAt < current.timerEndsAt)) return current;
      const winnerIds = getQuestionWinnerIds(current, currentQuestion);
      const answerOutcomes = Object.fromEntries(getActivePlayers(current).map((player) => {
        const playerSubmission = getSubmission(current, player.id, player.name);
        return [player.id, { value: playerSubmission?.value || '', correct: winnerIds.includes(player.id), points: winnerIds.includes(player.id) ? 1 : 0 }];
      }));
      return {
        ...current,
        players: current.players.map((player) => winnerIds.includes(player.id) ? { ...player, score: player.score + 1 } : player),
        finalScores: current.round === 'final'
          ? Object.fromEntries(current.activePlayerIds.map((id) => [id, (current.finalScores[id] || 0) + (winnerIds.includes(id) ? 1 : 0)]))
          : current.finalScores,
        answerOutcomes,
        timerEndsAt: null,
        phase: 'review',
        currentBuzz: null,
      };
    });
  }

  async function handleNextQuestion() {
    await updateGameState((current) => advanceGame(current, banks));
  }

  async function handleResetGame() {
    if (!window.confirm('Réinitialiser la partie et supprimer tous les joueurs ?')) return;
    await saveGameState(createGameState());
  }

  async function handleSkipQuestion() {
    const expectedRound = gameState.round;
    const expectedIndex = gameState.questionIndex;
    await updateGameState((current) => {
      if (current.phase !== 'question' || current.round !== expectedRound || current.questionIndex !== expectedIndex) return current;
      return advanceGame({ ...current, phase: 'review' }, banks);
    });
  }

  async function handleResolveTie() {
    const selected = [...tieSelection];
    await updateGameState((current) => resolveEliminationTie(current, selected));
    setTieSelection([]);
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
          <div className="flex flex-wrap gap-2">
            <button disabled title="Les questions sont verrouillées pendant la partie" className="py-2 px-5 rounded-xl font-bold bg-[#64646433] text-muted border border-line opacity-60">Questions verrouillées</button>
            <button onClick={handleResetGame} className="py-2 px-5 rounded-xl font-bold bg-reset-bg text-gold-dark border border-reset-border">Réinitialiser</button>
          </div>
        </div>
        {gameState.lastElimination && (
          <div className="rounded-xl p-4 bg-danger-strong/12 border border-danger-dark">
            <p className="text-danger font-bold mb-1">🚫 Fin de manche {gameState.lastElimination.round} — Éliminé(s) : {gameState.lastElimination.eliminatedNames.join(', ')}</p>
            <p className="text-body text-[13px]">Il reste {gameState.lastElimination.remaining} joueur(s) en course.</p>
          </div>
        )}
        {gameState.phase === 'tiebreak' && gameState.pendingElimination && (
          <div className="rounded-2xl p-6 bg-warn-bg border-2 border-warn-border">
            <p className="text-gold text-lg font-bold mb-2">Égalité au seuil d'élimination</p>
            <p className="text-body text-sm mb-4">Fais un départage oral, puis sélectionne exactement {gameState.pendingElimination.eliminateCount} joueur(s) à éliminer.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {gameState.pendingElimination.candidateIds.map((id) => {
                const player = gameState.players.find((item) => item.id === id);
                const selected = tieSelection.includes(id);
                return <button key={id} onClick={() => setTieSelection((current) => selected ? current.filter((item) => item !== id) : [...current, id])} className={`p-3 rounded-lg border text-left font-bold ${selected ? 'border-danger bg-danger-strong/20 text-danger' : 'border-line bg-black/30 text-body'}`}>{player?.name || id}</button>;
              })}
            </div>
            <button onClick={handleResolveTie} disabled={tieSelection.length !== gameState.pendingElimination.eliminateCount} className="w-full py-3 rounded-xl font-bold bg-brand-green text-dark-ink disabled:opacity-40">Valider le départage</button>
          </div>
        )}
        {gameState.phase === 'tiebreak' && !gameState.pendingElimination && (
          <div className="rounded-2xl p-6 text-center bg-danger-strong/15 border-2 border-danger-dark">
            <p className="text-danger text-lg font-bold mb-2">Départage incomplet</p>
            <p className="text-body text-sm mb-4">L'état du départage n'a pas été conservé. Réinitialise la partie pour repartir proprement.</p>
            <button onClick={handleResetGame} className="px-5 py-3 rounded-xl font-bold bg-reset-bg text-gold-dark border border-reset-border">Réinitialiser la partie</button>
          </div>
        )}
        {question && gameState.phase !== 'tiebreak' && !gameOver && (
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
              <AnswerReveal question={question} />
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
                  {timerLeft > 0 && <p className="text-brand-green font-bold mt-2">{timerLeft}s restantes</p>}
                </div>
              ) : (
                <div className="p-6 rounded-lg text-center bg-brand-green/10 border-2 border-dashed border-brand-green">
                  <p className="text-muted text-sm font-bold mb-3">❓ Réponse libre — Validation animatrice</p>
                  <div className="flex flex-col gap-2">
                    {active.map((player) => {
                      const submission = getSubmission(gameState, player.id, player.name);
                      if (!submission) return null;
                      return (
                        <div key={player.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30">
                          <div>
                            <span className="text-gold font-bold">{player.name}</span>
                            <span className="text-body ml-2">→ {submission.value}</span>
                          </div>
                          <span className={`font-bold ${computeFreeTextOutcome(question, submission.value) ? 'text-brand-green' : 'text-danger'}`}>{computeFreeTextOutcome(question, submission.value) ? 'Correct' : 'Incorrect'}</span>
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
                    const submission = getSubmission(gameState, player.id, player.name);
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
                    {gameState.timerEndsAt && <button onClick={handleResolveAnswers} className="flex-1 py-2 rounded-lg bg-brand-green text-dark-ink font-bold">Résoudre les réponses</button>}
                  </div>
                </div>
              )}
              {question?.type === 'qcm' && (
                <div className="mb-3">
                  <p className="text-body text-sm mb-2">Réponses reçues :</p>
                  {active.map((player) => {
                    const submission = getSubmission(gameState, player.id, player.name);
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
                    {gameState.timerEndsAt && <button onClick={handleResolveAnswers} className="flex-1 py-2 rounded-lg bg-brand-green text-dark-ink font-bold">Résoudre les réponses</button>}
                  </div>
                </div>
              )}
              {question?.type === 'free-text' && gameState.timerEndsAt && <button onClick={handleResolveAnswers} className="w-full mb-3 py-2 rounded-lg bg-brand-green text-dark-ink font-bold">Résoudre les réponses</button>}
              <div className="flex gap-3">
                {gameState.round === 'buzzer' && <button onClick={handleRevealOptions} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border">Montrer la réponse 👀</button>}
                <button onClick={handleSkipQuestion} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-[#64646433] text-muted border border-line">Passer ⏭️</button>
                {gameState.round !== 'buzzer' && !gameState.timerEndsAt && (
                  <button onClick={handleStartTimer} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">▶️ Commencer le timer</button>
                )}
              </div>
            </>
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

function HostLobbyView({ gameState, banks, saveGameState, onManageQuestions, onStartTest, onPreviewLive }: { gameState: GameState; banks: QuestionBanks; saveGameState: SaveGameState; onManageQuestions?: () => void; onStartTest?: () => void; onPreviewLive?: () => void }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
  const playerCountValid = allPlayers.length >= MIN_PLAYERS && allPlayers.length <= MAX_PLAYERS;
  const banksValid = banks.buzzer.length > 0 && banks.simultaneous.length > 0 && banks.final.length > 0;
  async function startGame() {
    if (!playerCountValid || !banksValid) return;
    await updateGameState((current) => {
      if (current.gameStarted || current.players.length < MIN_PLAYERS || current.players.length > MAX_PLAYERS) return current;
      return {
        ...current,
        gameStarted: true,
        activePlayerIds: current.players.map((player) => player.id),
        eliminationPlan: calculateEliminations(current.players.length),
        phase: 'question',
        round: 'buzzer',
        questionIndex: 0,
        currentBuzz: null,
        submittedAnswers: {},
        answerOutcomes: {},
        finalScores: {},
        questionBanks: banks,
        winnerId: null,
      };
    });
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
          {!playerCountValid && <p className="text-danger text-sm text-center">Il faut entre {MIN_PLAYERS} et {MAX_PLAYERS} joueurs pour démarrer.</p>}
          {!banksValid && <p className="text-danger text-sm text-center">Chaque manche doit contenir au moins une question.</p>}
          <button onClick={startGame} disabled={!playerCountValid || !banksValid} className="w-full py-5 rounded-xl font-bold text-lg transition-transform active:scale-95 disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink">🚀 Démarrer le jeu</button>
          <button onClick={resetGame} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-reset-bg text-gold-dark border border-reset-border">Réinitialiser</button>
          {onManageQuestions && <button onClick={onManageQuestions} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold to-gold-dark text-dark-ink">📝 Gérer les questions</button>}
          {onStartTest && <button onClick={onStartTest} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-warn-bg text-gold-dark border border-warn-border">Simuler les effectifs</button>}
          {onPreviewLive && <button onClick={onPreviewLive} className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-gold/80 to-gold-dark/80 text-dark-ink">👁️ Preview Live</button>}
        </div>
        <p className="text-line text-xs text-center">Partage ce lien avec tes joueurs. Une fois prêt, clique "Démarrer le jeu". <br />Les joueurs qui rejoignent après ne pourront que regarder les stats. 👀</p>
      </div>
    </div>
  );
}

// ============ TEST MODE ============

function TestModeView({ onExit }: { onExit: () => void }) {
  const simulations = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => {
    const players = MIN_PLAYERS + index;
    const plan = calculateEliminations(players);
    return { players, ...plan, finalists: players - plan.afterBuzzer - plan.afterSimultaneous };
  });
  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold font-heading text-gold">Simulation des effectifs</h1>
          <button onClick={onExit} className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line">← Retour</button>
        </div>
        <p className="text-muted text-sm">Cette simulation est locale et ne modifie pas la partie Firebase.</p>
        <div className="rounded-xl overflow-hidden border border-brand-green/20 bg-panel/80">
          <div className="grid grid-cols-4 gap-2 p-3 text-xs font-bold text-muted border-b border-line"><span>Joueurs</span><span>Buzzer</span><span>Simultanée</span><span>Finale</span></div>
          {simulations.map((row) => <div key={row.players} className="grid grid-cols-4 gap-2 p-3 text-sm text-body border-b border-line/40 last:border-0"><span className="font-bold text-gold">{row.players}</span><span>-{row.afterBuzzer}</span><span>-{row.afterSimultaneous}</span><span className="font-bold text-brand-green">{row.finalists}</span></div>)}
        </div>
      </div>
    </div>
  );
}

// ============ LIVE VIEW ============

function LiveView({ gameState, banks, onExit, eliminatedPlayerName }: { gameState: GameState; banks: QuestionBanks; onExit?: () => void; eliminatedPlayerName?: string }) {
  const allPlayers = gameState.players || [];
  const sorted = [...allPlayers].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const question = getCurrentQuestion(gameState, banks);
  const active = getActivePlayers(gameState);
  const isWaiting = !gameState.gameStarted || gameState.phase === 'lobby';
  const isGameOver = gameState.phase === 'game-over';
  const winner = allPlayers.find((player) => player.id === gameState.winnerId);
  const viewerId = eliminatedPlayerName ? getPlayerId(gameState, eliminatedPlayerName) : undefined;
  const viewerEliminated = viewerId ? !gameState.activePlayerIds.includes(viewerId) : false;
  const timerDisplay = useCountdown(gameState.timerEndsAt, gameState.phase === 'question');

  return (
    <div className="live-screen app-bg w-full">
      <Glow />
      <div className="live-layout relative z-10 mx-auto max-w-[1600px]">
        <header className="live-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="live-dot" aria-hidden="true" />
              <p className="text-brand-green text-[10px] font-bold tracking-[1px]">LIVE</p>
            </div>
            <h1 className="text-gold font-heading font-bold truncate">Questions pour un Fonceday</h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-ink text-xs sm:text-sm font-bold">{liveStatusLabel(gameState)}</p>
            <p className="text-muted text-[10px] sm:text-xs">{active.length} / {allPlayers.length} joueurs en course</p>
          </div>
          {onExit && <button onClick={onExit} title="Quitter le live" aria-label="Quitter le live" className="live-exit">×</button>}
        </header>

        <div className="live-progress" aria-label="Progression de la partie">
          {(['buzzer', 'simultaneous', 'final'] as QuestionRound[]).map((round, index) => {
            const currentRound = (['buzzer', 'simultaneous', 'final'] as QuestionRound[]).indexOf(gameState.round);
            const done = gameState.gameStarted && (index < currentRound || isGameOver);
            const current = gameState.gameStarted && !isGameOver && index === currentRound;
            return <div key={round} className={`live-progress-step ${current ? 'is-current' : done ? 'is-done' : ''}`}><span>{roundLabel(round)}</span></div>;
          })}
        </div>

        <main className="live-main">
          <section className="live-stage live-card">
            {isWaiting ? (
              <div className="live-center-state">
                <p className="text-brand-green text-xs font-bold tracking-[1px]">EN ATTENTE</p>
                <h2 className="text-gold font-heading font-bold">Le jeu va commencer</h2>
                <p className="text-body">{allPlayers.length} joueur{allPlayers.length > 1 ? 's' : ''} inscrit{allPlayers.length > 1 ? 's' : ''}</p>
              </div>
            ) : isGameOver ? (
              <div className="live-center-state">
                <p className="text-gold text-xs font-bold tracking-[1px]">PARTIE TERMINÉE</p>
                <h2 className="text-ink font-heading font-bold">{winner ? `${winner.name} remporte la partie` : 'La partie est terminée'}</h2>
                {winner && <p className="text-brand-green font-black">{gameState.finalScores[winner.id] ?? winner.score} pts en finale</p>}
              </div>
            ) : gameState.phase === 'tiebreak' ? (
              <div className="live-center-state">
                <p className="text-gold text-xs font-bold tracking-[1px]">DÉPARTAGE</p>
                <h2 className="text-ink font-heading font-bold">Égalité au seuil d'élimination</h2>
                <p className="text-body">{gameState.pendingElimination ? gameState.pendingElimination.candidateIds.map((id) => gameState.players.find((player) => player.id === id)?.name).filter(Boolean).join(', ') : "L'animateur prépare le départage"}</p>
              </div>
            ) : question ? (
              <>
                <div className="live-question-head">
                  <p className="text-muted text-[10px] sm:text-xs font-bold tracking-[1px]">{gameState.phase === 'review' ? 'RÉSULTAT' : 'QUESTION EN COURS'}</p>
                  <p className="text-brand-green text-xs font-bold">Question {currentQuestionInRound(gameState)}{timerDisplay > 0 ? ` · ${timerDisplay}s` : ''}</p>
                </div>
                <p className="live-question text-ink font-bold">{question.question}</p>
                {gameState.phase === 'review' ? (
                  <div className="live-review">
                    <AnswerReveal question={question} compact />
                    <LiveAnswerResults gameState={gameState} question={question} />
                  </div>
                ) : question.type === 'qcm' ? (
                  <QuestionOptions question={question} live />
                ) : (
                  <div className="live-answer-mode">
                    <p className="text-brand-green font-black">{question.type === 'numeric' ? 'Chiffre le plus proche' : 'Réponse libre'}</p>
                  </div>
                )}
                {gameState.currentBuzz && <div className="live-alert is-buzz"><span>BUZZ</span><b>{gameState.currentBuzz.name}</b></div>}
                {gameState.wrongBuzzers.length > 0 && <div className="live-alert is-wrong">Déjà écartés : {gameState.wrongBuzzers.map((id) => gameState.players.find((player) => player.id === id)?.name).filter(Boolean).join(', ')}</div>}
                {gameState.lastElimination && <div className="live-alert is-elimination">Éliminés : {gameState.lastElimination.eliminatedNames.join(', ')}</div>}
              </>
            ) : null}
          </section>

          <aside className="live-ranking live-card">
            <div className="live-ranking-head">
              <p className="text-muted text-[10px] sm:text-xs font-bold tracking-[1px]">CLASSEMENT EN DIRECT</p>
              {eliminatedPlayerName && viewerEliminated && <span className="text-danger text-[10px] font-bold">ÉLIMINÉ</span>}
            </div>
            <div className="live-score-grid">
              {sorted.map((player, index) => {
                const eliminated = !gameState.activePlayerIds.includes(player.id) && gameState.gameStarted;
                return (
                  <div key={player.id} className={`live-score-row ${index === 0 ? 'is-first' : ''} ${eliminated ? 'is-eliminated' : ''} ${player.id === viewerId ? 'is-viewer' : ''}`}>
                    <span className="live-rank">{index + 1}</span>
                    <span className="live-player-name">{player.name}</span>
                    <b>{player.score}</b>
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
        <div key={index} className={live ? 'live-option' : 'px-3 py-2 rounded-lg bg-black/30 border border-line'}>
          <span className="text-brand-green font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
          <span className="text-body">{option}</span>
        </div>
      ))}
    </div>
  );
}

function CompactScoreboard({ players, currentPlayerId, activePlayerIds }: { players: GameState['players']; currentPlayerId?: string; activePlayerIds: string[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {sorted.map((player, index) => {
        const eliminated = !activePlayerIds.includes(player.id);
        return (
          <div key={player.id} className={`min-w-0 px-2 py-1.5 rounded-md border flex items-center gap-1 ${player.id === currentPlayerId ? 'border-gold bg-gold/10' : 'border-line/50 bg-black/25'} ${eliminated ? 'opacity-45' : ''}`}>
            <span className="text-muted text-[10px] shrink-0">{index + 1}</span>
            <span className="text-body text-[11px] font-bold truncate flex-1">{player.name}</span>
            <span className="text-brand-green text-[11px] font-black shrink-0">{player.score}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatAnswer(question: Question, value: string): string {
  if (!value) return 'Pas de réponse';
  if (question.type !== 'qcm') return value;
  const index = value.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < question.options.length ? `${value.toUpperCase()}. ${question.options[index]}` : value;
}

function LiveAnswerResults({ gameState, question }: { gameState: GameState; question: Question }) {
  const outcomes = getActivePlayers(gameState)
    .map((player) => ({ player, outcome: gameState.answerOutcomes[player.id] || gameState.answerOutcomes[player.name] }))
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

function AnswerReveal({ question, selectedValue, compact = false }: { question: Question; selectedValue?: string; compact?: boolean }) {
  if (question.type === 'qcm') {
    const selectedIndex = selectedValue ? selectedValue.toUpperCase().charCodeAt(0) - 65 : -1;
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}>
        {question.options.map((option, idx) => {
          const correct = idx === question.correct;
          const selected = idx === selectedIndex;
          return (
            <div key={idx} className={`${compact ? 'p-2' : 'p-4'} rounded-lg border ${correct ? 'bg-brand-green/25 border-brand-green' : selected ? 'bg-danger-strong/15 border-danger' : 'bg-black/30 border-[#64646433]'}`}>
              <p className={`${compact ? 'text-xs' : 'text-sm'} ${correct ? 'text-brand-green font-bold' : selected ? 'text-danger font-bold' : 'text-body'}`}>
                <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>{option}{correct && ' ✓'}{selected && <span className="ml-2 text-[10px] uppercase">Ton choix</span>}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  const answer = question.type === 'numeric' ? question.numericAnswer : question.acceptedAnswer;
  return (
    <div className={`rounded-xl text-center bg-brand-green/15 border border-brand-green ${compact ? 'p-2' : 'p-6 sm:p-8'}`}>
      <p className="text-muted text-[10px] font-bold tracking-[1px] mb-1">BONNE RÉPONSE</p>
      <p className={`text-brand-green font-black break-words ${compact ? 'text-lg' : 'text-3xl sm:text-4xl'}`}>{answer ?? 'Réponse non renseignée'}</p>
      {selectedValue && <p className="text-body text-xs mt-1">Ta réponse : <b>{selectedValue}</b></p>}
    </div>
  );
}

// ============ UTILITIES ============

function useCountdown(endsAt: number | null, running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!endsAt || !running) return;
    const interval = setInterval(() => setSeconds(Math.max(0, Math.ceil((endsAt - timestamp()) / 1000))), 200);
    return () => clearInterval(interval);
  }, [endsAt, running]);
  return endsAt && running ? seconds : 0;
}

function phaseLabel(state: GameState): string {
  switch (state.phase) {
    case 'lobby': return 'Lobby';
    case 'question': return state.round === 'buzzer' ? 'Manche buzzer' : state.round === 'simultaneous' ? 'Manche simultanee' : 'Finale';
    case 'review': return 'Révision';
    case 'tiebreak': return 'Départage';
    case 'game-over': return 'Terminé';
    default: return '—';
  }
}

function roundLabel(round: QuestionRound): string {
  switch (round) {
    case 'buzzer': return 'Manche buzzer';
    case 'simultaneous': return 'Manche simultanée';
    case 'final': return 'Finale';
  }
}

function liveStatusLabel(state: GameState): string {
  if (!state.gameStarted || state.phase === 'lobby') return 'Le jeu n\'a pas commencé';
  if (state.phase === 'game-over') return 'Partie terminée';
  if (state.phase === 'review') return `${roundLabel(state.round)} • Réponse à la question ${currentQuestionInRound(state)}`;
  if (state.phase === 'tiebreak') return `Départage • Question ${currentQuestionInRound(state)}`;
  return `${roundLabel(state.round)} • Question ${currentQuestionInRound(state)}`;
}

function currentQuestionInRound(state: GameState): number {
  return state.questionIndex + 1;
}

function Glow() { return <div className="absolute inset-0 pointer-events-none app-glow" />; }
