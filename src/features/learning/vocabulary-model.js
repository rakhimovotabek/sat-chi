export const normalizeRecall = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const recallMatches = (answer, word) =>
  normalizeRecall(answer) === normalizeRecall(word);
export function combineWords(words) {
  const unique = new Map();
  for (const word of words) {
    const key =
      normalizeRecall(word.word) + "\0" + normalizeRecall(word.definition);
    const prior = unique.get(key);
    if (prior) {
      prior.source_sets = [...new Set([...prior.source_sets, word.set_id])];
    } else
      unique.set(key, {
        ...word,
        source_sets: word.source_sets || [word.set_id],
      });
  }
  return [...unique.values()];
}
export const masteryPercent = (stats) =>
  stats?.total ? Math.round((stats.mastered / stats.total) * 100) : 0;
export const vocabularyAccuracy = (stats) =>
  (stats?.successful || 0) + (stats?.failed || 0)
    ? Math.round((stats.successful / (stats.successful + stats.failed)) * 100)
    : null;
export function contextParts(passage, words) {
  const lookup = new Map(words.map((w) => [normalizeRecall(w.word), w]));
  if (!lookup.size) return [{ text: passage }];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    "(?<![\\p{L}\\p{N}])(" +
      [...lookup.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escape)
        .join("|") +
      ")(?![\\p{L}\\p{N}])",
    "giu",
  );
  const parts = [];
  let start = 0;
  for (const match of passage.matchAll(pattern)) {
    if (match.index > start)
      parts.push({ text: passage.slice(start, match.index) });
    parts.push({ text: match[0], word: lookup.get(normalizeRecall(match[0])) });
    start = match.index + match[0].length;
  }
  if (start < passage.length) parts.push({ text: passage.slice(start) });
  return parts;
}
