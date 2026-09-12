import { get, onValue, ref, runTransaction } from 'firebase/database';
import { defaultQuestionBanks } from '../data/defaultQuestions';
import { db } from '../firebase';
import { normalizeNumericAnswer, type Question, type QuestionBanks, type QuestionRound } from './game';

const QUESTIONS_PATH = 'fonceday-question-banks';
const QUESTION_BANK_VERSION = 20260912;

// A read never writes or replaces existing custom questions, regardless of version.
export function normalizeBanks(value: unknown): QuestionBanks {
  if (value === null || value === undefined) return structuredClone(defaultQuestionBanks);
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Format de banque invalide. Les données ont été conservées.');
  const source = value as Partial<QuestionBanks>;
  for (const key of ['buzzer', 'simultaneous', 'final'] as const) {
    if (source[key] != null && !Array.isArray(source[key]))
      throw new Error('Format de banque invalide. Les données ont été conservées.');
  }
  function readRound(round: QuestionRound): Question[] {
    return (source[round] || []).map((question) => {
      if (!question || typeof question !== 'object' || typeof question.question !== 'string') {
        throw new Error('Une question est invalide. Les données ont été conservées.');
      }
      // Firebase omits empty arrays, notably options on numeric and free-text questions.
      return { ...question, round, options: Array.isArray(question.options) ? question.options : [] };
    });
  }
  return { buzzer: readRound('buzzer'), simultaneous: readRound('simultaneous'), final: readRound('final') };
}

export function cleanQuestion(question: Question): Question {
  const clean: Question = {
    id: question.id,
    round: question.round,
    type: question.type,
    question: question.question.trim(),
    options: question.type === 'qcm' ? question.options.map((option) => option.trim()) : [],
    correct: question.type === 'qcm' ? question.correct : 0,
  };
  if (!clean.question) throw new Error('Renseigne la question.');
  if (clean.round === 'buzzer' && clean.type !== 'qcm')
    throw new Error('La première manche accepte uniquement les QCM.');
  if (
    clean.type === 'qcm' &&
    (clean.options.length !== 4 ||
      clean.options.some((option) => !option) ||
      new Set(clean.options.map((option) => option.toLocaleLowerCase('fr'))).size !== 4 ||
      !Number.isInteger(clean.correct) ||
      clean.correct < 0 ||
      clean.correct > 3)
  )
    throw new Error('Renseigne quatre propositions distinctes et une bonne réponse.');
  if (clean.type === 'numeric') {
    const value = normalizeNumericAnswer(String(question.numericAnswer ?? ''));
    if (value === null) throw new Error('Renseigne une valeur cible numérique.');
    clean.numericAnswer = value;
  }
  if (clean.type === 'free-text') {
    if (!question.acceptedAnswer?.trim()) throw new Error('Renseigne une réponse de référence.');
    clean.acceptedAnswer = question.acceptedAnswer.trim();
    clean.acceptedAnswers = (question.acceptedAnswers || []).map((answer) => answer.trim()).filter(Boolean);
  }
  if (clean.round === 'final' && question.reserve) clean.reserve = true;
  return clean;
}

export function replaceQuestion(
  banks: QuestionBanks,
  from: QuestionRound,
  id: number,
  updated: Question,
): QuestionBanks {
  if (!banks[from].some((question) => question.id === id))
    throw new Error('Cette question a été supprimée. Actualise la liste.');
  const question = cleanQuestion({ ...updated, id });
  if (from === question.round)
    return { ...banks, [from]: banks[from].map((item) => (item.id === id ? question : item)) };
  return {
    ...banks,
    [from]: banks[from].filter((item) => item.id !== id),
    [question.round]: [...banks[question.round], question],
  };
}

export function loadQuestionBanks(
  callback: (banks: QuestionBanks) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!db) {
    callback(normalizeBanks(null));
    return () => {};
  }
  return onValue(
    ref(db, QUESTIONS_PATH),
    (snapshot) => {
      try {
        callback(normalizeBanks(snapshot.val()));
      } catch (error) {
        onError?.(error as Error);
      }
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function updateQuestionBanks(update: (banks: QuestionBanks) => QuestionBanks): Promise<void> {
  if (!db) throw new Error('Firebase non disponible');
  await runTransaction(ref(db, QUESTIONS_PATH), (current) => ({
    ...update(normalizeBanks(current)),
    _version: Math.max(Number(current?._version) || 0, QUESTION_BANK_VERSION),
  }));
}

export async function addQuestion(
  round: QuestionRound,
  input: Omit<Question, 'id' | 'round'>,
): Promise<void> {
  await updateQuestionBanks((banks) => {
    const id =
      Math.max(
        0,
        ...Object.values(banks)
          .flat()
          .map((question) => question.id),
      ) + 1;
    return { ...banks, [round]: [...banks[round], cleanQuestion({ ...input, id, round })] };
  });
}

export async function updateQuestion(
  from: QuestionRound,
  id: number,
  updates: Omit<Question, 'id'>,
): Promise<void> {
  await updateQuestionBanks((banks) => replaceQuestion(banks, from, id, { ...updates, id }));
}

export async function deleteQuestion(round: QuestionRound, id: number): Promise<void> {
  await updateQuestionBanks((banks) => ({
    ...banks,
    [round]: banks[round].filter((question) => question.id !== id),
  }));
}

export async function reorderQuestions(round: QuestionRound, ids: number[]): Promise<void> {
  await updateQuestionBanks((banks) => {
    const byId = new Map(banks[round].map((question) => [question.id, question]));
    const ordered = [...new Set(ids)]
      .map((id) => byId.get(id))
      .filter((question): question is Question => Boolean(question));
    return {
      ...banks,
      [round]: [...ordered, ...banks[round].filter((question) => !ids.includes(question.id))],
    };
  });
}

export async function getQuestionBanks(): Promise<QuestionBanks> {
  return db ? normalizeBanks((await get(ref(db, QUESTIONS_PATH))).val()) : normalizeBanks(null);
}
