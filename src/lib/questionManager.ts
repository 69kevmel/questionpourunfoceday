import { ref, onValue, set, get, remove, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { defaultQuestions } from '../data/defaultQuestions';

type Question = {
  id: number;
  question: string;
  options: string[];
  correct: number;
};

const QUESTIONS_PATH = 'fonceday-questions';

// Charge les questions depuis Firebase. Si le path est vide, initialise avec
// les questions par défaut (une seule fois, en transaction atomique).
export function loadQuestions(
  callback: (questions: Question[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    callback(defaultQuestions);
    return () => {};
  }

  const questionsRef = ref(db, QUESTIONS_PATH);

  return onValue(
    questionsRef,
    async (snapshot) => {
      const val = snapshot.val();
      if (!val || !Array.isArray(val) || val.length === 0) {
        // Première utilisation : on seed avec les questions par défaut
        await runTransaction(ref(db, QUESTIONS_PATH), () => defaultQuestions);
        callback(defaultQuestions);
      } else {
        callback(val as Question[]);
      }
    },
    (err) => {
      console.error('Erreur chargement questions:', err);
      onError?.(err);
      callback(defaultQuestions);
    }
  );
}

export function getAllQuestions(): Promise<Question[]> {
  if (!db) return Promise.resolve(defaultQuestions);
  return get(ref(db, QUESTIONS_PATH)).then((snap) => {
    const val = snap.val();
    return (Array.isArray(val) && val.length > 0) ? val : defaultQuestions;
  }).catch(() => defaultQuestions);
}

export function addQuestion(q: Omit<Question, 'id'>): Promise<Question> {
  if (!db) throw new Error('Firebase non disponible');
  return get(ref(db, QUESTIONS_PATH)).then((snap) => {
    const existing = snap.val() as Question[] | null;
    const questions = Array.isArray(existing) ? existing : [];
    const maxId = questions.reduce((max, q2) => Math.max(max, q2.id), 0);
    const newQ: Question = { ...q, id: maxId + 1 };
    return set(ref(db, QUESTIONS_PATH), [...questions, newQ]).then(() => newQ);
  });
}

export function updateQuestion(id: number, updates: Partial<Pick<Question, 'question' | 'options' | 'correct'>>): Promise<void> {
  if (!db) throw new Error('Firebase non disponible');
  return runTransaction(ref(db, QUESTIONS_PATH), (current: Question[] | null) => {
    if (!Array.isArray(current)) return current;
    return current.map((q) => (q.id === id ? { ...q, ...updates } : q));
  });
}

export function deleteQuestion(id: number): Promise<void> {
  if (!db) throw new Error('Firebase non disponible');
  return runTransaction(ref(db, QUESTIONS_PATH), (current: Question[] | null) => {
    if (!Array.isArray(current)) return current;
    return current.filter((q) => q.id !== id);
  });
}

export function reorderQuestions(newOrder: number[]): Promise<void> {
  if (!db) throw new Error('Firebase non disponible');
  return runTransaction(ref(db, QUESTIONS_PATH), (current: Question[] | null) => {
    if (!Array.isArray(current)) return current;
    const map = new Map(current.map((q) => [q.id, q]));
    return newOrder.map((id) => map.get(id)!).filter(Boolean);
  });
}
