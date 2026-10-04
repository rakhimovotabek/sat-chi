export const dailyDone = (row) => !!row.completed_at;
export function localDay(zone = "Asia/Tashkent", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export const dailyAudience = (template) =>
  template.all_students
    ? "All active students"
    : `${template.students.length} students · ${template.groups.length} groups`;
export const dailyAccuracy = (row) =>
  row.completed_at && row.question_count
    ? `${Math.round((row.correct / row.question_count) * 100)}%`
    : "—";
export function dateWindow(end, days = 30) {
  const date = new Date(`${end}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return { p_from: date.toISOString().slice(0, 10), p_until: end };
}
