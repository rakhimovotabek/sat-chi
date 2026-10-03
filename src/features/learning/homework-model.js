export function homeworkStatus(row, now = new Date()) {
  if (row.submitted_at) return "Completed";
  if (new Date(row.due_at) < now) return "Overdue";
  if (row.session_id) return "In Progress";
  return new Date(row.due_at).toDateString() === now.toDateString()
    ? "Today"
    : "Upcoming";
}
export function sectionResults(items) {
  const result = new Map();
  for (const item of items) {
    const name =
      item.question.homework_section || item.question.section || "Practice";
    let row = result.get(name);
    if (!row)
      result.set(
        name,
        (row = { name, total: 0, correct: 0, incorrect: 0, unanswered: 0 }),
      );
    row.total++;
    if (item.selected_answer == null) row.unanswered++;
    else if (item.correct) row.correct++;
    else row.incorrect++;
  }
  return [...result.values()];
}
export function formatTime(seconds = 0) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
