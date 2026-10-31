// Classification comes from the existing canonical learning facts snapshot.
// Keep section context for every grouping, including shared skill/source names.
export function performanceBreakdown(breakdowns, group) {
  const rows = new Map();
  for (const item of breakdowns) {
    const label = `${item.section || "Practice"} · ${item[group] || "Unclassified"}`;
    const row = rows.get(label) || {
      label,
      attempted: 0,
      correct: 0,
      known: 0,
      incorrect: 0,
    };
    row.attempted += Number(item.attempted || 0);
    row.correct += Number(item.correct || 0);
    row.known += Number(item.first_known || 0);
    row.incorrect += Number(item.incorrect || 0);
    rows.set(label, row);
  }
  return [...rows.values()]
    .filter((row) => row.attempted > 0)
    .map((row) => ({
      ...row,
      accuracy: row.known ? (100 * row.correct) / row.known : null,
    }))
    .sort(
      (a, b) =>
        (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity) ||
        b.known - a.known ||
        a.label.localeCompare(b.label),
    );
}
