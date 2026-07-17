import { useState, useEffect, useCallback } from 'react';
import { loadQuestions, addQuestion, updateQuestion, deleteQuestion, reorderQuestions } from '../lib/questionManager';

type Question = {
  id: number;
  question: string;
  options: string[];
  correct: number;
};

type Mode = 'list' | 'add' | 'edit';

interface QuestionFormData {
  question: string;
  options: string[];
  correct: number;
}

const EMPTY_FORM: QuestionFormData = {
  question: '',
  options: ['', '', '', ''],
  correct: 0,
};

export default function QuestionManager({ onExit }: { onExit: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<QuestionFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    return loadQuestions(setQuestions, (err) => {
      console.error('Impossible de charger les questions', err);
    });
  }, []);

  const sortAsc = useCallback((qs: Question[]) => [...qs].sort((a, b) => a.id - b.id), []);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setMode('add');
  }

  function openEdit(q: Question) {
    setForm({ question: q.question, options: [...q.options], correct: q.correct });
    setEditingId(q.id);
    setMode('edit');
  }

  function cancel() {
    setMode('list');
    setEditingId(null);
  }

  async function handleSave() {
    if (!form.question.trim()) return;
    const validOptions = form.options.filter((o) => o.trim());
    if (validOptions.length < 2) return;
    setSaving(true);
    try {
      const trimmed = validOptions.map((o) => o.trim());
      const clampedCorrect = Math.min(form.correct, trimmed.length - 1);
      if (mode === 'add') {
        await addQuestion({ question: form.question.trim(), options: trimmed, correct: clampedCorrect });
      } else if (editingId != null) {
        await updateQuestion(editingId, { question: form.question.trim(), options: trimmed, correct: clampedCorrect });
      }
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (questions.length <= 1) return;
    try {
      await deleteQuestion(id);
    } finally {
      setDeleteConfirmId(null);
    }
  }

  async function handleMove(id: number, dir: -1 | 1) {
    const sorted = sortAsc(questions);
    const idx = sorted.findIndex((q) => q.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = [...sorted];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    await reorderQuestions(newOrder.map((q) => q.id));
  }

  function handleOptionChange(idx: number, value: string) {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = value;
      return { ...f, options: opts };
    });
  }

  // ============ FORM VIEW ============
  if (mode === 'add' || mode === 'edit') {
    return (
      <div className="app-bg min-h-screen w-full p-4 sm:p-6">
        <Glow />
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <button
              onClick={cancel}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line"
            >
              ← Retour
            </button>
            <h1 className="text-2xl font-bold font-heading text-gold">
              {mode === 'add' ? 'Ajouter une question' : `Modifier — #${editingId}`}
            </h1>
          </div>

          <div className="rounded-2xl p-6 bg-panel/80 border border-brand-green/27">
            <div className="flex flex-col gap-4">
              {/* Question text */}
              <div>
                <label className="block text-body text-sm mb-1 font-bold">Question</label>
                <textarea
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                  placeholder="Ex : Combien de planètes dans le système solaire ?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl outline-none bg-black/30 border border-brand-green/33 text-ink resize-none"
                />
              </div>

              {/* Options */}
              <div>
                <label className="block text-body text-sm mb-2 font-bold">Options (clique pour marquer la bonne réponse)</label>
                <div className="flex flex-col gap-2">
                  {form.options.map((opt, idx) => (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                        idx === form.correct
                          ? 'bg-brand-green/15 border-brand-green'
                          : 'bg-black/30 border-[#64646433]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="correct"
                        checked={idx === form.correct}
                        onChange={() => setForm((f) => ({ ...f, correct: idx }))}
                        className="accent-brand-green"
                      />
                      <span className="text-gold font-bold min-w-[20px]">{String.fromCharCode(65 + idx)}.</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 bg-transparent outline-none text-ink"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={cancel}
                  className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-[#64646433] text-muted border border-line"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.question.trim() || form.options.filter((o) => o.trim()).length < 2}
                  className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 disabled:opacity-40 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
                >
                  {mode === 'add' ? 'Ajouter' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ LIST VIEW ============
  const sorted = sortAsc(questions);

  return (
    <div className="app-bg min-h-screen w-full p-4 sm:p-6">
      <Glow />
      <div className="relative z-10 max-w-3xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-70 bg-[#64646433] text-muted border border-line"
            >
              ← Retour au jeu
            </button>
            <h1 className="text-2xl font-bold font-heading text-gold">
              Gestion des questions ({sorted.length})
            </h1>
          </div>
          <button
            onClick={openAdd}
            className="py-3 px-6 rounded-xl font-bold transition-transform active:scale-95 bg-linear-to-br from-brand-green to-brand-green-dark text-dark-ink"
          >
            + Ajouter une question
          </button>
        </div>

        {/* Questions list */}
        {sorted.length === 0 ? (
          <div className="rounded-2xl p-8 text-center bg-panel/80 border border-brand-green/27">
            <p className="text-muted text-lg">Aucune question. Ajoute ta première question !</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sorted.map((q, idx) => (
              <div
                key={q.id}
                className="rounded-2xl p-5 bg-panel/80 border border-brand-green/27 hover:border-brand-green/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Drag handles */}
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      onClick={() => handleMove(q.id, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 rounded flex items-center justify-center text-gold text-sm disabled:opacity-20 transition-opacity hover:bg-white/5"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMove(q.id, 1)}
                      disabled={idx === sorted.length - 1}
                      className="w-7 h-7 rounded flex items-center justify-center text-gold text-sm disabled:opacity-20 transition-opacity hover:bg-white/5"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Question content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gold text-sm font-bold mb-2">
                      #{q.id} — {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className={`px-3 py-2 rounded-lg text-sm border ${
                            oIdx === q.correct
                              ? 'bg-brand-green/20 border-brand-green text-brand-green font-bold'
                              : 'bg-black/30 border-transparent text-body'
                          }`}
                        >
                          <span className="text-gold font-bold mr-1">{String.fromCharCode(65 + oIdx)}.</span>
                          {opt}
                          {oIdx === q.correct && ' ✅'}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(q)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-muted transition-colors hover:bg-white/5 hover:text-ink"
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    {questions.length > 1 && (
                      <button
                        onClick={() => setDeleteConfirmId(q.id)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-danger transition-colors hover:bg-danger/10"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteConfirmId != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="rounded-2xl p-6 max-w-sm w-full bg-panel border border-danger-dark">
              <p className="text-danger font-bold mb-4">Supprimer cette question ?</p>
              <p className="text-body text-sm mb-6 line-clamp-2">
                {questions.find((q) => q.id === deleteConfirmId)?.question}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 rounded-xl font-bold bg-[#64646433] text-muted border border-line"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-2 rounded-xl font-bold bg-danger-strong/20 text-danger border border-danger-border"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Glow() {
  return <div className="absolute inset-0 pointer-events-none app-glow" />;
}
