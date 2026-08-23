import { describe, expect, it } from 'vitest';
import { defaultQuestionBanks } from './defaultQuestions';

const verifiedQcmAnswers = new Map([
  [301, 'Blanche-Neige et les Sept Nains'],
  [302, 'Tétrahydrocannabinol'],
  [303, 'Ottawa'],
  [304, 'Jupiter'],
  [305, 'Pablo Picasso'],
  [306, 'Le portugais'],
  [307, 'Au'],
  [308, '12'],
  [309, 'Neil Armstrong'],
  [310, "L'océan Indien"],
  [501, 'Le grec ancien'],
  [502, 'La fosse des Mariannes'],
  [503, 'George Orwell'],
  [504, '26'],
  [505, 'Wellington'],
  [506, 'Tim Berners-Lee'],
  [507, 'Le Pérou'],
  [508, 'Le Voyage de Chihiro'],
  [509, 'La baleine bleue'],
  [510, 'Vénus'],
]);

describe('banques de questions par défaut', () => {
  it('contient toutes les questions attendues dans la bonne manche', () => {
    expect(defaultQuestionBanks.buzzer.map((question) => question.id)).toEqual([301, 302, 303, 304, 305, 306, 307, 308, 309, 310]);
    expect(defaultQuestionBanks.simultaneous.map((question) => question.id)).toEqual([401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411]);
    expect(defaultQuestionBanks.final.map((question) => question.id)).toEqual([501, 502, 503, 504, 505, 506, 507, 508, 509, 510]);

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
      52,
      5,
      27,
      15,
      24,
      8,
      2,
      60,
      6,
      7,
      21,
    ]);
  });
});
