export function practiceSummary(items) {
  const correct = items.filter((i) => i.correct === true).length;
  const unanswered = items.filter((i) => i.selected_answer == null).length;
  const answered = items.length - unanswered;
  return {
    total: items.length,
    correct,
    incorrect: answered - correct,
    unanswered,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
  };
}
export function questionState(item, current, submitted, practice = false) {
  const states = [
    current ? "current" : "",
    item.selected_answer == null ? "unanswered" : "answered",
    item.marked ? "marked" : "",
  ];
  if (
    (submitted || (practice && item.attempts?.length)) &&
    item.selected_answer != null
  )
    states.push(item.correct ? "correct" : "incorrect");
  return states.filter(Boolean);
}
