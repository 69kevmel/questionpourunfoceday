import { useEffect, useState } from 'react';
import { addQuestion, deleteQuestion, loadQuestionBanks, reorderQuestions, updateQuestion } from '../lib/questionManager';
import type { Question, QuestionBanks, QuestionRound, QuestionType } from '../lib/game';

type Screen = 'list' | 'form';

interface QuestionForm {
  round: QuestionRound;
  type: QuestionType;
  question: string;
  options: string[];
  correct: number;
  numericAnswer: string;
  acceptedAnswer: string;
}

const ROUND_LABELS: Record<QuestionRound, string> = {
  buzzer: 'Manche buzzer',
  simultaneous: 'Manche simultanee',
  final: 'Banque finale',
};

const emptyForm = (round: QuestionRound = 'buzzer'): QuestionForm => ({
  round,
  type: 'qcm',
  question: '',
  options: ['', '', '', ''],
  correct: 0,
  numericAnswer: '',
  acceptedAnswer: '',
});

export default function QuestionManager({ onExit }: { onExit: () => void }) {
  const [banks, setBanks] = useState<QuestionBanks>({ buzzer: [], simultaneous: [], final: [] });
  const [screen, setScreen] = useState<Screen>('list');
  const [round, setRound] = useState<QuestionRound>('buzzer');
  const [form, setForm] = useState<QuestionForm>(emptyForm());
  const [editing, setEditing] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => loadQuestionBanks(setBanks), []);

  function openAdd(targetRound = round) {
    setRound(targetRound);
    setForm(emptyForm(targetRound));
    setEditing(null);
    setScreen('form');
  }

  function openEdit(question: Question) {
    setRound(question.round);
    setEditing(question);
    setForm({
      round: question.round,
      type: question.type,
      question: question.question,
      options: [...question.options, '', '', '', ''].slice(0, 4),
      correct: question.correct,
      numericAnswer: question.numericAnswer?.toString() || '',
      acceptedAnswer: question.acceptedAnswer || '',
    });
    setScreen('form');
  }

  async function save() {
    if (!form.question.trim()) return;
    if (form.type === 'qcm' && form.options.some((option) => !option.trim())) return;
    if (form.type === 'numeric' && !Number.isFinite(Number(form.numericAnswer.replace(',', '.')))) return;
    if (form.type === 'free-text' && !form.acceptedAnswer.trim()) return;
    const payload = {
      type: form.type,
      question: form.question.trim(),
      options: form.type === 'qcm' ? form.options.map((option) => option.trim()) : [],
      correct: form.type === 'qcm' ? form.correct : 0,
      numericAnswer: form.type === 'numeric' ? Number(form.numericAnswer.replace(',', '.')) : undefined,
      acceptedAnswer: form.type === 'free-text' ? form.acceptedAnswer.trim() : undefined,
    } as Omit<Question, 'id' | 'round'>;
    setSaving(true);
    try {
      if (editing) await updateQuestion(editing.round, editing.id, payload);
      else await addQuestion(form.round, payload);
      setScreen('list');
    } finally {
      setSaving(false);
    }
  }

  async function move(question: Question, direction: -1 | 1) {
    const items = banks[question.round];
    const index = items.findIndex((item) => item.id === question.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    const next = [...items];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    await reorderQuestions(question.round, next.map((item) => item.id));
  }

  if (screen === 'form') {
    const qcmInvalid = form.type === 'qcm' && form.options.some((option) => !option.trim());
    const numericInvalid = form.type === 'numeric' && !Number.isFinite(Number(form.numericAnswer.replace(',', '.')));
    const textInvalid = form.type === 'free-text' && !form.acceptedAnswer.trim();
    return (
      <div className="app-bg min-h-screen p-4 sm:p-6">
        <Glow />
        <main className="relative z-10 mx-auto flex max-w-2xl flex-col gap-5">
          <header className="flex items-center justify-between gap-3">
            <button onClick={() => setScreen('list')} className="rounded-lg border border-line bg-[#64646433] px-4 py-2 text-sm font-bold text-muted">Retour</button>
            <h1 className="font-heading text-2xl font-bold text-gold">{editing ? 'Modifier la question' : 'Nouvelle question'}</h1>
          </header>
          <section className="rounded-xl border border-brand-green/27 bg-panel/90 p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <label className="text-sm font-bold text-body">Liste
                <select value={form.round} onChange={(event) => setForm((current) => ({ ...current, round: event.target.value as QuestionRound }))} className="mt-2 w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-ink">
                  <option value="buzzer">Manche buzzer</option>
                  <option value="simultaneous">Manche simultanee</option>
                  <option value="final">Banque finale</option>
                </select>
              </label>
              <label className="text-sm font-bold text-body">Type de question
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as QuestionType }))} className="mt-2 w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-ink">
                  <option value="qcm">Choix multiples (4 reponses)</option>
                  <option value="numeric">Chiffre le plus proche / valeur exacte</option>
                  <option value="free-text">Sans choix de reponse</option>
                </select>
              </label>
              <label className="text-sm font-bold text-body">Question
                <textarea value={form.question} onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))} rows={3} className="mt-2 w-full resize-none rounded-lg border border-line bg-black/30 px-3 py-2 text-ink" />
              </label>
              {form.type === 'qcm' && <div className="flex flex-col gap-3">
                <p className="text-sm font-bold text-body">Quatre propositions. Coche la bonne reponse.</p>
                {form.options.map((option, index) => <label key={index} className={`flex items-center gap-3 rounded-lg border p-3 ${form.correct === index ? 'border-brand-green bg-brand-green/10' : 'border-line bg-black/20'}`}>
                  <input type="radio" checked={form.correct === index} onChange={() => setForm((current) => ({ ...current, correct: index }))} />
                  <span className="font-bold text-gold">{String.fromCharCode(65 + index)}.</span>
                  <input value={option} onChange={(event) => setForm((current) => { const options = [...current.options]; options[index] = event.target.value; return { ...current, options }; })} className="min-w-0 flex-1 bg-transparent text-ink outline-none" />
                </label>)}
              </div>}
              {form.type === 'numeric' && <label className="text-sm font-bold text-body">Valeur cible
                <input value={form.numericAnswer} onChange={(event) => setForm((current) => ({ ...current, numericAnswer: event.target.value }))} inputMode="decimal" placeholder="Ex : 42 ou 3,14" className="mt-2 w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-ink" />
              </label>}
              {form.type === 'free-text' && <label className="text-sm font-bold text-body">Reponse de reference pour l'animateur
                <input value={form.acceptedAnswer} onChange={(event) => setForm((current) => ({ ...current, acceptedAnswer: event.target.value }))} className="mt-2 w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-ink" />
              </label>}
              <button onClick={save} disabled={saving || !form.question.trim() || qcmInvalid || numericInvalid || textInvalid} className="rounded-lg bg-brand-green px-5 py-3 font-bold text-dark-ink disabled:opacity-40">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const questions = banks[round];
  return (
    <div className="app-bg min-h-screen p-4 sm:p-6">
      <Glow />
      <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><button onClick={onExit} className="rounded-lg border border-line bg-[#64646433] px-4 py-2 text-sm font-bold text-muted">Retour au jeu</button><h1 className="font-heading text-2xl font-bold text-gold">Questions</h1></div>
          <button onClick={() => openAdd()} className="rounded-lg bg-brand-green px-5 py-3 font-bold text-dark-ink">Ajouter</button>
        </header>
        <nav className="grid grid-cols-1 gap-2 sm:grid-cols-3">{(Object.keys(ROUND_LABELS) as QuestionRound[]).map((key) => <button key={key} onClick={() => setRound(key)} className={`rounded-lg border px-3 py-3 text-sm font-bold ${round === key ? 'border-brand-green bg-brand-green/15 text-brand-green' : 'border-line bg-panel/70 text-muted'}`}>{ROUND_LABELS[key]} ({banks[key].length})</button>)}</nav>
        <p className="text-sm text-muted">La manche buzzer et la manche simultanee sont jouees integralement. La banque finale est utilisee pour les departages et la finale a deux.</p>
        <section className="flex flex-col gap-3">
          {questions.length === 0 && <p className="rounded-lg border border-line bg-panel/70 p-5 text-center text-muted">Aucune question dans cette liste.</p>}
          {questions.map((question, index) => <article key={question.id} className="flex gap-3 rounded-xl border border-brand-green/20 bg-panel/85 p-4">
            <div className="flex flex-col gap-1"><button onClick={() => move(question, -1)} disabled={index === 0} className="rounded p-1 text-gold disabled:opacity-20">Haut</button><button onClick={() => move(question, 1)} disabled={index === questions.length - 1} className="rounded p-1 text-gold disabled:opacity-20">Bas</button></div>
            <div className="min-w-0 flex-1"><p className="mb-1 text-xs font-bold uppercase text-brand-green">{question.type === 'qcm' ? 'QCM' : question.type === 'numeric' ? 'Chiffre' : 'Reponse libre'}</p><p className="font-bold text-ink">{question.question}</p><p className="mt-2 text-sm text-muted">{question.type === 'qcm' ? question.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`).join(' | ') : question.type === 'numeric' ? `Cible : ${question.numericAnswer}` : `Reference : ${question.acceptedAnswer}`}</p></div>
            <div className="flex flex-col gap-2"><button onClick={() => openEdit(question)} className="rounded border border-line px-3 py-2 text-sm text-gold">Modifier</button><button onClick={() => deleteQuestion(question.round, question.id)} className="rounded border border-danger-dark px-3 py-2 text-sm text-danger">Supprimer</button></div>
          </article>)}
        </section>
      </main>
    </div>
  );
}

function Glow() { return <div className="pointer-events-none absolute inset-0 app-glow" />; }
