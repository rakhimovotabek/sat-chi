export function planDays(tasks, today) {
  const days = new Map();
  for (const task of tasks) {
    const day = days.get(task.study_date) || {
      date: task.study_date,
      minutes: 0,
      completed: 0,
      tasks: [],
    };
    day.tasks.push(task);
    day.minutes += Number(task.minutes);
    day.completed += task.completed_at ? 1 : 0;
    day.missed = day.date < today;
    days.set(day.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function performanceAreas(rows = []) {
  return {
    strong: rows.filter(
      (r) => r.attempted >= 10 && r.correct / r.attempted >= 0.85,
    ),
    attention: rows.filter(
      (r) => r.attempted >= 10 && r.correct / r.attempted < 0.65,
    ),
  };
}
