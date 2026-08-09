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
    qcm(1, 'Quel métal est liquide à température ambiante ?', ['Le plomb', "L'étain", 'Le mercure', 'Le zinc'], 2, 'buzzer'),
    qcm(2, "Quel organe produit l'insuline ?", ['Le foie', 'Le pancréas', 'La rate', 'Les reins'], 1, 'buzzer'),
    qcm(3, 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', ["L'oxygène", "L'azote", 'Le dioxyde de carbone', "L'hydrogène"], 2, 'buzzer'),
    qcm(4, "Quel est le plus long fleuve d'Afrique ?", ['Le Congo', 'Le Niger', 'Le Zambèze', 'Le Nil'], 3, 'buzzer'),
    qcm(5, 'Quelle est la monnaie officielle du Japon ?', ['Le won', 'Le yuan', 'Le yen', 'Le baht'], 2, 'buzzer'),
    qcm(6, 'Qui a écrit Le Petit Prince ?', ['Antoine de Saint-Exupéry', 'Jules Verne', 'Victor Hugo', 'Marcel Proust'], 0, 'buzzer'),
    qcm(7, 'Quel est l’animal terrestre le plus rapide sur une courte distance ?', ['Le lion', 'Le guépard', 'Le cheval', "L'autruche"], 1, 'buzzer'),
    qcm(8, 'Dans quel pays se trouve la Grande Barrière de corail ?', ["L'Indonésie", 'Les Philippines', 'Le Mexique', "L'Australie"], 3, 'buzzer'),
    qcm(9, 'Dans Minecraft, quel niveau de pioche est le plus faible permettant de miner l’obsidienne ?', ['La pierre', 'Le fer', "L'or", 'Le diamant'], 3, 'buzzer'),
    qcm(10, 'Combien de joueurs d’une même équipe de basket sont sur le terrain ?', ['Quatre', 'Cinq', 'Six', 'Sept'], 1, 'buzzer'),
  ],
  simultaneous: [
    numeric(101, 'Combien de touches possède un piano standard moderne ?', 88),
    numeric(102, "En mètres, quelle est la distance officielle d'un marathon ?", 42_195),
    numeric(103, "Combien d'os compte généralement le squelette d'un adulte ?", 206),
    numeric(104, 'Combien de Pokémon différents compte la première génération, de Bulbizarre à Mew ?', 151),
    numeric(105, "Combien d'épisodes compte la série Friends au total ?", 236),
    numeric(106, 'Quelle est, en mètres, la hauteur actuelle de la tour Eiffel avec ses antennes ?', 330),
    numeric(107, 'En kilomètres, quelle est la distance moyenne entre la Terre et la Lune ?', 384_400),
    numeric(108, 'Combien de secondes y a-t-il exactement dans une semaine de 7 jours ?', 604_800),
    numeric(109, "Combien d'Oscars Le Seigneur des anneaux : Le Retour du roi a-t-il remportés ?", 11),
    numeric(110, 'En mètres par seconde, quelle est la valeur exacte de la vitesse de la lumière dans le vide ?', 299_792_458),
    numeric(111, 'En comptant les carrés de toutes les tailles, combien de carrés contient un échiquier de 8 cases sur 8 ?', 204),
  ],
  final: [
    qcm(201, "Quelle est l'unité SI de la quantité de matière ?", ['Le kelvin', 'La mole', 'La candela', 'Le newton'], 1, 'final'),
    qcm(202, 'Qui a formulé les trois lois du mouvement de la mécanique classique ?', ['Galilée', 'Johannes Kepler', 'Isaac Newton', 'René Descartes'], 2, 'final'),
    qcm(203, 'Quel est le plus petit État du monde par sa superficie ?', ['Monaco', 'Nauru', 'Saint-Marin', 'Le Vatican'], 3, 'final'),
    qcm(204, 'Quel est l’os le plus long du corps humain ?', ['Le tibia', "L'humérus", 'Le fémur', 'Le péroné'], 2, 'final'),
    qcm(205, 'En quelle année le mur de Berlin est-il tombé ?', ['1987', '1989', '1991', '1993'], 1, 'final'),
    qcm(206, 'Quel élément chimique est le plus abondant dans l’univers ?', ["L'hélium", "L'oxygène", "L'hydrogène", 'Le carbone'], 2, 'final'),
    qcm(207, 'Qui a peint La Nuit étoilée ?', ['Claude Monet', 'Vincent van Gogh', 'Paul Cézanne', 'Edgar Degas'], 1, 'final'),
    qcm(208, 'Quel fleuve traverse Bagdad ?', ["L'Euphrate", 'Le Tigre', 'Le Jourdain', "L'Indus"], 1, 'final'),
    qcm(209, 'Quelle planète du Système solaire tourne quasiment couchée sur son axe ?', ['Neptune', 'Uranus', 'Saturne', 'Vénus'], 1, 'final'),
    qcm(210, 'Qui a écrit la pièce En attendant Godot ?', ['Eugène Ionesco', 'Jean-Paul Sartre', 'Samuel Beckett', 'Albert Camus'], 2, 'final'),
  ],
};
