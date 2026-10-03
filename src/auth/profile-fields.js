export const TARGET_SCORES = [
  1000, 1100, 1200, 1300, 1400, 1450, 1500, 1550, 1600,
];
export const GOALS = [
  "Improve Math",
  "Improve Reading & Writing",
  "Improve Both",
  "Prepare for first SAT",
  "Reach target score",
];
export function profileValues(profile = {}, metadata = {}) {
  const source = {
    ...(metadata.onboarding || {}),
    ...Object.fromEntries(
      Object.entries(profile).filter(([, value]) => value != null),
    ),
  };
  const text = (value) => (typeof value === "string" ? value : "");
  const score = (value) =>
    typeof value === "number" || typeof value === "string" ? value : "";
  return {
    display_name: text(
      source.display_name || metadata.full_name || metadata.name,
    ),
    current_sat_score: score(source.current_sat_score),
    target_sat_score: score(source.target_sat_score),
    grade: text(source.grade),
    target_test_date: text(source.target_test_date),
    main_goal: text(source.main_goal),
  };
}
export function validateProfile(values, requireGoal = true) {
  if (!values.display_name.trim() || values.display_name.trim().length > 120)
    return "Enter your full name (up to 120 characters).";
  for (const key of ["current_sat_score", "target_sat_score"]) {
    if (key === "current_sat_score" && values[key] === "") continue;
    const score = Number(values[key]);
    if (!Number.isInteger(score) || score < 400 || score > 1600 || score % 10)
      return "SAT scores must be between 400 and 1600, in steps of 10.";
  }
  if (!values.grade.trim() || values.grade.length > 40)
    return "Enter your grade or year (up to 40 characters).";
  if (requireGoal && !GOALS.includes(values.main_goal))
    return "Choose your main learning goal.";
  if (
    values.target_test_date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(values.target_test_date) ||
      Number.isNaN(Date.parse(values.target_test_date)))
  )
    return "Choose a valid test date.";
  return null;
}
export function profilePayload(values) {
  return {
    ...values,
    display_name: values.display_name.trim(),
    grade: values.grade.trim(),
    current_sat_score:
      values.current_sat_score === "" ? null : Number(values.current_sat_score),
    target_sat_score: Number(values.target_sat_score),
    target_test_date: values.target_test_date || null,
  };
}
export function needsOnboarding(profile) {
  return (
    profile?.role === "student" &&
    (!profile.onboarding_completed ||
      !profile.display_name?.trim() ||
      !profile.target_sat_score ||
      !profile.grade?.trim() ||
      !profile.main_goal)
  );
}
