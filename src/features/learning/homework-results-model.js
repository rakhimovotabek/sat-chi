export function resultStatus(row) {
  if (row.completed_at) return "Completed";
  if (row.active === false) return "Withdrawn";
  return row.session_id ? "In progress" : "Not started";
}
export function resultTotals(rows) {
  const eligible = rows.filter((r) => r.active !== false);
  const graded = rows.reduce(
    (n, r) => n + Number(r.correct) + Number(r.incorrect),
    0,
  );
  const correct = rows.reduce((n, r) => n + Number(r.correct), 0);
  return {
    eligible: eligible.length,
    started: eligible.filter((r) => r.session_id).length,
    completed: eligible.filter((r) => r.completed_at).length,
    pending: eligible.filter((r) => !r.completed_at).length,
    accuracy: graded ? Math.round((correct / graded) * 100) : null,
  };
}
export function answerStatus(item) {
  if (item.selected_answer == null && !item.selected_response?.trim())
    return "Unanswered";
  if (item.correct == null)
    return item.question.question_type === "open"
      ? "Pending grading / manual review"
      : "Not graded";
  return item.correct ? "Correct" : "Incorrect";
}
