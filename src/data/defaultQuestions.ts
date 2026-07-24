import type { QuestionBanks } from '../lib/game';

const qcm = (id: number, question: string, options: string[], correct: number, round: 'buzzer' | 'simultaneous') => ({
  id,
  round,
  type: 'qcm' as const,
  question,
  options,
  correct,
});

export const defaultQuestionBanks: QuestionBanks = {
  buzzer: [
    qcm(1, "Qui est l'inventeur du trampoline moderne ?", ['George Nissen', 'Thomas Edison', 'Nikola Tesla', 'Charles Goodyear'], 0, 'buzzer'),
    qcm(2, 'Combien de coeurs possède une pieuvre ?', ['1', '2', '3', '5'], 2, 'buzzer'),
    { id: 3, round: 'buzzer', type: 'free-text', question: 'Quel est le plus grand océan du monde ?', options: [], correct: 0, acceptedAnswer: 'Pacifique' },
  ],
  simultaneous: [
    qcm(101, "Quel fruit flotte naturellement sur l'eau ?", ['La noix de coco', 'La banane', 'La pêche', 'La poire'], 0, 'simultaneous'),
    qcm(102, 'Quelle planète tourne presque couchée sur elle-même ?', ['Mars', 'Uranus', 'Saturne', 'Neptune'], 1, 'simultaneous'),
    { id: 103, round: 'simultaneous', type: 'numeric', question: 'Combien de minutes dure une heure ?', options: [], correct: 0, numericAnswer: 60 },
  ],
  final: [
    { id: 201, round: 'final', type: 'free-text', question: 'Quel est le satellite naturel de la Terre ?', options: [], correct: 0, acceptedAnswer: 'Lune' },
    qcm(202, 'Quelle couleur obtient-on en mélangeant bleu et jaune ?', ['Violet', 'Vert', 'Orange', 'Rose'], 1, 'buzzer'),
  ].map((question) => ({ ...question, round: 'final' as const })),
};
