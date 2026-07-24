import { get, onValue, ref, runTransaction, set } from 'firebase/database';
import { defaultQuestionBanks } from '../data/defaultQuestions';
import { db } from '../firebase';
import type { Question, QuestionBanks, QuestionRound } from './game';

const QUESTIONS_PATH = 'fonceday-question-banks';
const LEGACY_QUESTIONS_PATH = 'fonceday-questions';

function cloneDefaults(): QuestionBanks {
  return JSON.parse(JSON.stringify(defaultQuestionBanks)) as QuestionBanks;
}

function normalizeBanks(value: unknown): QuestionBanks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return cloneDefaults();
  const source = value as Partial<QuestionBanks>;
  return {
    buzzer: Array.isArray(source.buzzer) ? source.buzzer : [],
    simultaneous: Array.isArray(source.simultaneous) ? source.simultaneous : [],
    final: Array.isArray(source.final) ? source.final : [],
  };
}

export function loadQuestionBanks(callback: (banks: QuestionBanks) => void, onError?: (error: Error) => void): () => void {
  if (!db) {
    callback(cloneDefaults());
    return () => {};
  }
  return onValue(ref(db, QUESTIONS_PATH), async (snapshot) => {
    const value = snapshot.val();
    if (!value) {
      const legacy = (await get(ref(db, LEGACY_QUESTIONS_PATH))).val();
      const migrated = Array.isArray(legacy) && legacy.length > 0
        ? {
            buzzer: legacy.slice(0, 9).map((question) => ({ ...question, round: 'buzzer' as const, type: 'qcm' as const })),
            simultaneous: legacy.slice(9, 17).map((question) => ({ ...question, round: 'simultaneous' as const, type: 'qcm' as const })),
            final: legacy.slice(17).map((question) => ({ ...question, round: 'final' as const, type: 'qcm' as const })),
          }
        : cloneDefaults();
      await runTransaction(ref(db, QUESTIONS_PATH), (current) => current || migrated);
      callback(migrated);
      return;
    }
    callback(normalizeBanks(value));
  }, (error) => {
    console.error('Erreur chargement questions:', error);
    onError?.(error);
    callback(cloneDefaults());
  });
}

export function updateQuestionBanks(update: (banks: QuestionBanks) => QuestionBanks): Promise<void> {
  if (!db) throw new Error('Firebase non disponible');
  return runTransaction(ref(db, QUESTIONS_PATH), (current) => update(normalizeBanks(current))).then(() => undefined);
}

export async function addQuestion(round: QuestionRound, question: Omit<Question, 'id' | 'round'>): Promise<void> {
  await updateQuestionBanks((banks) => {
    const ids = Object.values(banks).flat().map((item) => item.id);
    return { ...banks, [round]: [...banks[round], { ...question, id: Math.max(0, ...ids) + 1, round }] };
  });
}

export async function updateQuestion(round: QuestionRound, id: number, updates: Omit<Question, 'id' | 'round'>): Promise<void> {
  await updateQuestionBanks((banks) => ({
    ...banks,
    [round]: banks[round].map((question) => question.id === id ? { ...question, ...updates } : question),
  }));
}

export async function deleteQuestion(round: QuestionRound, id: number): Promise<void> {
  await updateQuestionBanks((banks) => ({ ...banks, [round]: banks[round].filter((question) => question.id !== id) }));
}

export async function reorderQuestions(round: QuestionRound, ids: number[]): Promise<void> {
  await updateQuestionBanks((banks) => {
    const byId = new Map(banks[round].map((question) => [question.id, question]));
    return { ...banks, [round]: ids.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question)) };
  });
}

export async function getQuestionBanks(): Promise<QuestionBanks> {
  if (!db) return cloneDefaults();
  const value = (await get(ref(db, QUESTIONS_PATH))).val();
  return value ? normalizeBanks(value) : cloneDefaults();
}
