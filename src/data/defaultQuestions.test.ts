import { describe, expect, it } from 'vitest';
import { defaultQuestionBanks } from './defaultQuestions';

describe('banques de questions par défaut', () => {
  it('contient les effectifs demandés pour une partie complète', () => {
    expect(defaultQuestionBanks.buzzer).toHaveLength(10);
    expect(defaultQuestionBanks.simultaneous).toHaveLength(11);
    expect(defaultQuestionBanks.final).toHaveLength(10);
  });

  it('possède des identifiants uniques et des réponses QCM valides', () => {
    const questions = Object.values(defaultQuestionBanks).flat();
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);

    for (const question of questions) {
      if (question.type === 'qcm') {
        expect(question.options[question.correct]).toBeTruthy();
      }
    }
  });

  it('conserve les valeurs simultanées corrigées', () => {
    expect(defaultQuestionBanks.simultaneous.map((question) => question.numericAnswer)).toEqual([
      0,
      4_773_000,
      18,
      22,
      848_000,
      256,
      50,
      19,
      189_819,
      102.4,
      321,
    ]);
  });
});
