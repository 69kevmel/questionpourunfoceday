import { describe, expect, it } from 'vitest';
import { defaultQuestionBanks } from './defaultQuestions';

const verifiedQcmAnswers = new Map([
  [1, 'Le mercure'],
  [2, 'Le pancréas'],
  [3, 'Le dioxyde de carbone'],
  [4, 'Le Nil'],
  [5, 'Le yen'],
  [6, 'Antoine de Saint-Exupéry'],
  [7, 'Le guépard'],
  [8, "L'Australie"],
  [9, 'Le diamant'],
  [10, 'Cinq'],
  [201, 'La mole'],
  [202, 'Isaac Newton'],
  [203, 'Le Vatican'],
  [204, 'Le fémur'],
  [205, '1989'],
  [206, "L'hydrogène"],
  [207, 'Vincent van Gogh'],
  [208, 'Le Tigre'],
  [209, 'Uranus'],
  [210, 'Samuel Beckett'],
]);

describe('banques de questions par défaut', () => {
  it('contient toutes les questions attendues dans la bonne manche', () => {
    expect(defaultQuestionBanks.buzzer.map((question) => question.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(defaultQuestionBanks.simultaneous.map((question) => question.id)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
    expect(defaultQuestionBanks.final.map((question) => question.id)).toEqual([201, 202, 203, 204, 205, 206, 207, 208, 209, 210]);

    for (const question of defaultQuestionBanks.buzzer) {
      expect(question).toMatchObject({ round: 'buzzer', type: 'qcm' });
    }
    for (const question of defaultQuestionBanks.simultaneous) {
      expect(question).toMatchObject({ round: 'simultaneous', type: 'numeric' });
    }
    for (const question of defaultQuestionBanks.final) {
      expect(question).toMatchObject({ round: 'final', type: 'qcm' });
    }
  });

  it('possède des identifiants uniques et des réponses QCM valides', () => {
    const questions = Object.values(defaultQuestionBanks).flat();
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

    for (const question of questions) {
      if (question.type === 'qcm') {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.options[question.correct]).toBe(verifiedQcmAnswers.get(question.id));
      }
    }

    expect(verifiedQcmAnswers.size).toBe(20);
  });

  it('conserve les valeurs simultanées vérifiées', () => {
    expect(defaultQuestionBanks.simultaneous.map((question) => question.numericAnswer)).toEqual([
      88,
      42_195,
      206,
      151,
      236,
      330,
      384_400,
      604_800,
      11,
      299_792_458,
      204,
    ]);
  });
});
