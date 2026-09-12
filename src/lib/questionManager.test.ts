import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionBanks, Question } from './game';
const fake = vi.hoisted(() => ({ value: null as unknown, writes: 0 }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (_ref: unknown, callback: (snapshot: { val: () => unknown }) => void) => {
    callback({ val: () => fake.value });
    return () => {};
  },
  get: async () => ({ val: () => fake.value }),
  runTransaction: async (_ref: unknown, update: (value: unknown) => unknown) => {
    const result = update(fake.value);
    const check = (value: unknown) => {
      if (value === undefined) throw new Error('Firebase rejects undefined');
      if (value && typeof value === 'object') Object.values(value).forEach(check);
    };
    check(result);
    fake.value = result;
    fake.writes++;
    return { committed: true, snapshot: { val: () => result } };
  },
}));
import {
  addQuestion,
  cleanQuestion,
  getQuestionBanks,
  loadQuestionBanks,
  normalizeBanks,
  reorderQuestions,
  updateQuestion,
} from './questionManager';
const numeric: Question = {
  id: 1,
  round: 'simultaneous',
  question: 'Combien ?',
  type: 'numeric',
  numericAnswer: 0,
  options: [],
  correct: 0,
};
const custom: QuestionBanks = { buzzer: [], simultaneous: [numeric], final: [] };

beforeEach(() => {
  fake.value = { ...structuredClone(custom), _version: 1 };
  fake.writes = 0;
});
describe('gestionnaire de questions', () => {
  it('charge une ancienne banque personnalisée sans aucune écriture', async () => {
    const callback = vi.fn();
    loadQuestionBanks(callback);
    expect(callback).toHaveBeenCalledWith(custom);
    expect(await getQuestionBanks()).toEqual(custom);
    expect(fake.writes).toBe(0);
  });
  it('préserve une banque intentionnellement vide', () => {
    expect(normalizeBanks({ _version: 1 })).toEqual({ buzzer: [], simultaneous: [], final: [] });
    expect(normalizeBanks(null).buzzer.length).toBeGreaterThan(0);
    expect(fake.writes).toBe(0);
  });
  it('rejette une cible absente mais accepte zéro', () => {
    expect(() => cleanQuestion({ ...numeric, numericAnswer: undefined })).toThrow();
    expect(cleanQuestion(numeric).numericAnswer).toBe(0);
  });
  it('enregistre sans undefined et sans écraser les anciennes questions', async () => {
    await addQuestion('final', {
      type: 'qcm',
      question: 'Question ajoutée',
      options: ['A', 'B', 'C', 'D'],
      correct: 0,
      numericAnswer: undefined,
      acceptedAnswer: undefined,
    });
    const saved = await getQuestionBanks();
    expect(saved.simultaneous).toEqual(custom.simultaneous);
    expect(saved.final[0]).not.toHaveProperty('numericAnswer');
    expect(saved.final[0]).not.toHaveProperty('acceptedAnswer');
  });
  it('déplace atomiquement une question et nettoie les champs de son ancien type', async () => {
    await updateQuestion('simultaneous', 1, {
      ...numeric,
      round: 'final',
      type: 'free-text',
      acceptedAnswer: 'Évry',
      acceptedAnswers: ['Evry-Courcouronnes'],
    });
    const saved = await getQuestionBanks();
    expect(saved.simultaneous).toEqual([]);
    expect(saved.final[0]).toMatchObject({ id: 1, round: 'final', type: 'free-text' });
    expect(saved.final[0]).not.toHaveProperty('numericAnswer');
    expect(fake.writes).toBe(1);
  });
  it('ne perd pas une question ajoutée pendant une réorganisation', async () => {
    fake.value = { ...custom, simultaneous: [numeric, { ...numeric, id: 2 }, { ...numeric, id: 3 }] };
    await reorderQuestions('simultaneous', [2, 1]);
    expect((await getQuestionBanks()).simultaneous.map((question) => question.id)).toEqual([2, 1, 3]);
  });
  it('rejette une donnée malformée sans la remplacer', () => {
    expect(() => normalizeBanks({ final: 'incorrect' })).toThrow();
    expect(fake.writes).toBe(0);
  });
  it('restaure les tableaux vides omis par Firebase pour éditer une question numérique', async () => {
    const serialized = JSON.parse(JSON.stringify(numeric));
    delete serialized.options;
    delete serialized.round;
    fake.value = { simultaneous: [serialized], _version: 1 };
    const saved = await getQuestionBanks();
    expect(saved.simultaneous[0].options).toEqual([]);
    expect(saved.simultaneous[0].round).toBe('simultaneous');
    expect(fake.writes).toBe(0);
    await updateQuestion('simultaneous', 1, { ...saved.simultaneous[0], question: 'Nouvelle formulation' });
    expect((await getQuestionBanks()).simultaneous[0].numericAnswer).toBe(0);
  });
});
