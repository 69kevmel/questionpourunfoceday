import { normalizeFreeText, type QuestionBanks, type Question } from '../lib/game';

// Independent arithmetic questions: no answer from the main banks is reused.
const calculations = [
  [17, 8],
  [23, 6],
  [19, 7],
  [26, 4],
  [32, 9],
  [14, 13],
  [27, 8],
  [35, 6],
  [18, 12],
  [43, 7],
];
export const reserveQuestions: Question[] = calculations.map(([a, b], index) => {
  const options = [a * b - 10, a * b + 10, a * b + a];
  options.splice(index % 4, 0, a * b);
  return {
    id: -1000 - index,
    round: 'final',
    type: 'qcm',
    reserve: true,
    question: `Combien font ${a} × ${b} ?`,
    options: options.map(String),
    correct: index % 4,
  };
});

export function prepareGameBanks(banks: QuestionBanks): QuestionBanks {
  const used = new Set(
    Object.values(banks)
      .flat()
      .filter((question) => !question.reserve)
      .map((question) => normalizeFreeText(question.question)),
  );
  const reserves = (
    banks.final.some((question) => question.reserve)
      ? banks.final.filter((question) => question.reserve)
      : reserveQuestions
  ).filter((question) => {
    const key = normalizeFreeText(question.question);
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
  return structuredClone({
    ...banks,
    final: [...banks.final.filter((question) => !question.reserve), ...reserves],
  });
}
