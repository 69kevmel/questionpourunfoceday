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
    qcm(301, "Quel film est le premier long-métrage d'animation produit par Disney ?", ['Fantasia', 'Pinocchio', 'Blanche-Neige et les Sept Nains', 'Dumbo'], 2, 'buzzer'),
    qcm(302, "Dans le contexte du cannabis, que signifie le sigle THC ?", ['Tétrahydrocannabine', 'Tétrahydrocannabinol', 'Trihydrocannabidiol', 'Tétrahydrocannabidol'], 1, 'buzzer'),
    qcm(303, 'Quelle est la capitale du Canada ?', ['Toronto', 'Ottawa', 'Montréal', 'Vancouver'], 1, 'buzzer'),
    qcm(304, 'Quelle est la plus grande planète du Système solaire ?', ['Saturne', 'Neptune', 'La Terre', 'Jupiter'], 3, 'buzzer'),
    qcm(305, 'Quel artiste a peint Guernica ?', ['Pablo Picasso', 'Salvador Dalí', 'Joan Miró', 'Francisco de Goya'], 0, 'buzzer'),
    qcm(306, 'Quelle est la langue officielle du Brésil ?', ["L'espagnol", "L'anglais", 'Le portugais', 'Le français'], 2, 'buzzer'),
    qcm(307, "Quel est le symbole chimique de l'or ?", ['Ag', 'Au', 'Or', 'Go'], 1, 'buzzer'),
    qcm(308, 'Combien de côtés possède un dodécagone ?', ['8', '10', '11', '12'], 3, 'buzzer'),
    qcm(309, 'Qui a été la première personne à marcher sur la Lune ?', ['Buzz Aldrin', 'Youri Gagarine', 'Neil Armstrong', 'Michael Collins'], 2, 'buzzer'),
    qcm(310, "Quel océan s'étend de l'Afrique de l'Est jusqu'à l'Australie ?", ["L'océan Indien", "L'océan Atlantique", "L'océan Arctique", "L'océan Pacifique"], 0, 'buzzer'),
  ],
  simultaneous: [
    numeric(401, 'Combien de cartes contient un jeu standard, sans compter les jokers ?', 52),
    numeric(402, 'Combien le symbole olympique compte-t-il d’anneaux ?', 5),
    numeric(403, "Combien d'os composent une main humaine, en comptant les 8 os du poignet ?", 27),
    numeric(404, "Combien de joueurs une équipe de rugby à XV peut-elle avoir au maximum sur l'aire de jeu ?", 15),
    numeric(405, "Combien de lettres compte l'alphabet grec moderne ?", 24),
    numeric(406, 'Combien de planètes compte officiellement le Système solaire ?', 8),
    numeric(407, 'Combien Mars possède-t-elle de satellites naturels ?', 2),
    numeric(408, "Combien de degrés mesure chacun des angles d'un triangle équilatéral ?", 60),
    numeric(409, "Combien de joueurs d'une équipe de volley-ball en salle sont simultanément sur le terrain ?", 6),
    numeric(410, 'Combien de nains Blanche-Neige rencontre-t-elle dans le classique Disney ?', 7),
    numeric(411, "Combien d'atomes de carbone contient une molécule de THC ?", 21),
  ],
  final: [
    qcm(501, "Quelle langue figure sur la pierre de Rosette aux côtés des écritures hiéroglyphique et démotique ?", ["L'akkadien", 'Le latin', "L'araméen", 'Le grec ancien'], 3, 'final'),
    qcm(502, 'Quelle est la fosse océanique la plus profonde connue ?', ['La fosse des Mariannes', 'La fosse de Porto Rico', 'La fosse du Pérou-Chili', 'La fosse de Java'], 0, 'final'),
    qcm(503, 'Qui a écrit le roman 1984 ?', ['Aldous Huxley', 'George Orwell', 'Ray Bradbury', 'H. G. Wells'], 1, 'final'),
    qcm(504, 'Quel est le numéro atomique du fer ?', ['18', '24', '26', '32'], 2, 'final'),
    qcm(505, 'Quelle est la capitale de la Nouvelle-Zélande ?', ['Auckland', 'Christchurch', 'Wellington', 'Queenstown'], 2, 'final'),
    qcm(506, 'Qui a inventé le World Wide Web au CERN en 1989 ?', ['Bill Gates', 'Steve Wozniak', 'Vint Cerf', 'Tim Berners-Lee'], 3, 'final'),
    qcm(507, 'Dans quel pays se trouve le Machu Picchu ?', ['La Bolivie', 'Le Pérou', "L'Équateur", 'Le Chili'], 1, 'final'),
    qcm(508, "Quel film a remporté l'Oscar du meilleur film d'animation lors de la cérémonie de 2003 ?", ['Le Voyage de Chihiro', "L'Âge de glace", 'Lilo & Stitch', 'La Planète au trésor'], 0, 'final'),
    qcm(509, 'Quel est le plus grand animal connu ayant vécu sur Terre ?', ["L'éléphant d'Afrique", 'Le mégalodon', 'La baleine bleue', 'Le diplodocus'], 2, 'final'),
    qcm(510, 'Quelle est la planète la plus chaude du Système solaire ?', ['Mercure', 'Mars', 'Jupiter', 'Vénus'], 3, 'final'),
  ],
};
