import { useState } from 'react';
const SOCIAL_LINK = 'https://linktr.ee/kanaeclub';
export function SocialLinks() {
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

export function HostAuthScreen({ onAuth, onBack }: { onAuth: () => void; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const CORRECT_PASSWORD = 'jesuisanimateur';
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
            className={`w-full px-4 py-3 rounded-xl text-center outline-none mb-3 bg-panel text-ink border ${error ? 'border-danger-border' : 'border-brand-green/33'}`}
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

export function ConsentScreen({
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
                Votre nom/pseudo pourra apparaître dans des <b>rediffusions YouTube</b>, <b>Instagram</b>,
                TikTok ou autres réseaux sociaux
              </li>
              <li className="mb-2">
                Les contenus vidéo peuvent être réutilisés pour la promotion ou l'archivage
              </li>
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
        <p className="text-faint text-[11px] text-center leading-[1.5]">
          Merci de votre compréhension. Amusez-vous bien ! 🎮
        </p>
      </div>
    </div>
  );
}

export function Glow() {
  return <div className="absolute inset-0 pointer-events-none app-glow" />;
}
