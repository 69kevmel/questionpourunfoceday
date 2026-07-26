import type { QuestionBanks, QuestionRound } from '../lib/game';

const qcm = (id: number, question: string, options: string[], correct: number, round: QuestionRound) => ({
  id,
  round,
  type: 'qcm' as const,
  question,
  options,
  correct,
});

const numeric = (id: number, question: string, numericAnswer: number) => ({
  id,
  round: 'simultaneous' as const,
  type: 'numeric' as const,
  question,
  options: [],
  correct: 0,
  numericAnswer,
});

export const defaultQuestionBanks: QuestionBanks = {
  buzzer: [
    qcm(1, 'Quel élément chimique a pour symbole W ?', ['Tungstène', 'Titane', 'Tantale', 'Tellure'], 0, 'buzzer'),
    qcm(2, 'Quelle planète du Système solaire possède le jour le plus court ?', ['Mars', 'Jupiter', 'Mercure', 'Vénus'], 1, 'buzzer'),
    qcm(3, 'Quel est le plus grand organe du corps humain ?', ['Le foie', 'Le poumon', 'La peau', "L'intestin grêle"], 2, 'buzzer'),
    qcm(4, "Quelle est la capitale de l'Australie ?", ['Sydney', 'Melbourne', 'Perth', 'Canberra'], 3, 'buzzer'),
    qcm(5, 'Qui a inventé le World Wide Web ?', ['Steve Jobs', 'Tim Berners-Lee', 'Bill Gates', 'Vint Cerf'], 1, 'buzzer'),
    qcm(6, 'Dans quel océan se trouve le point le plus profond connu sur Terre ?', ["L'océan Indien", "L'océan Atlantique", "L'océan Pacifique", "L'océan Arctique"], 2, 'buzzer'),
    qcm(7, 'Quel animal possède trois cœurs ?', ['Le dauphin', 'La pieuvre', 'Le requin', 'La méduse'], 1, 'buzzer'),
    qcm(8, 'Lequel de ces fruits est botaniquement une baie ?', ['La fraise', 'La framboise', 'La cerise', 'La banane'], 3, 'buzzer'),
    qcm(9, "Quel continent est traversé à la fois par l'équateur et les deux tropiques ?", ["L'Afrique", "L'Asie", "L'Amérique du Sud", "L'Océanie"], 0, 'buzzer'),
    qcm(10, 'Quel pays a offert la statue de la Liberté aux États-Unis ?', ["L'Italie", "Le Royaume-Uni", 'La France', "L'Espagne"], 2, 'buzzer'),
  ],
  simultaneous: [
    numeric(101, "Combien de petits la femelle Hippocampus kuda met-elle elle-même au monde ?", 0),
    numeric(102, 'À vol d’oiseau, environ combien de décimètres séparent les centres de Limoges et de Porrentruy ?', 4_773_000),
    numeric(103, 'Combien de doigts possède normalement un Maine Coon non polydactyle ?', 18),
    numeric(104, 'Combien de points possède la coccinelle Psyllobora vigintiduopunctata ?', 22),
    numeric(105, 'Combien de milligrammes de sucre contiennent 8 litres de Coca-Cola Original Taste ?', 848_000),
    numeric(106, 'Environ combien de pattes possède un Archispirostreptus gigas adulte ?', 256),
    numeric(107, 'Quelle longueur maximale, en millimètres, peut atteindre la limace Malacolimax tenellus ?', 50),
    numeric(108, 'Combien de Miraculous contient la boîte chinoise principale dans Miraculous ?', 19),
    numeric(109, 'Combien de lettres comporte le nom chimique théorique complet de la titine, selon le décompte couramment cité ?', 189_819),
    numeric(110, 'Selon Sony, combien de millions de PlayStation originales ont été vendues dans le monde au 31 mars 2012 ?', 102.4),
    numeric(111, 'Quelle longueur record, en centimètres, a été rapportée pour un Varanus salvator ?', 321),
  ],
  final: [
    qcm(201, 'Quel est le lac le plus profond du monde ?', ['Le lac Victoria', 'Le lac Supérieur', 'Le lac Baïkal', 'Le lac Tanganyika'], 2, 'final'),
    qcm(202, 'Qui a découvert la pénicilline en 1928 ?', ['Alexander Fleming', 'Louis Pasteur', 'Robert Koch', 'Edward Jenner'], 0, 'final'),
    qcm(203, "Quelle est l'unité SI de la résistance électrique ?", ['Le volt', "L'ampère", 'Le watt', "L'ohm"], 3, 'final'),
    qcm(204, 'Quelle est la capitale de la Mongolie ?', ['Astana', 'Oulan-Bator', 'Bichkek', 'Tachkent'], 1, 'final'),
    qcm(205, 'Quel est le plus grand organe interne du corps humain ?', ['Le cerveau', 'Le poumon', 'Le foie', 'Le rein'], 2, 'final'),
    qcm(206, 'Quelle est la planète la plus chaude du Système solaire ?', ['Mercure', 'Vénus', 'Mars', 'Jupiter'], 1, 'final'),
    qcm(207, 'Quel est le plus grand satellite naturel du Système solaire ?', ['Titan', 'La Lune', 'Callisto', 'Ganymède'], 3, 'final'),
    qcm(208, 'Qui a peint Guernica ?', ['Pablo Picasso', 'Salvador Dalí', 'Joan Miró', 'Francisco de Goya'], 0, 'final'),
    qcm(209, 'Quel est le matériau naturel le plus dur sur l’échelle de Mohs ?', ['Le quartz', 'Le corindon', 'Le diamant', 'Le topaze'], 2, 'final'),
    qcm(210, 'Dans quel pays se trouve le Machu Picchu ?', ['La Bolivie', 'Le Pérou', "L'Équateur", 'Le Chili'], 1, 'final'),
  ],
};
