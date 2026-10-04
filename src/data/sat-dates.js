// College Board SAT Weekend schedule, verified October 4, 2026.
// https://satsuite.collegeboard.org/sat/dates-deadlines
// Update this file when College Board confirms another cycle; never scrape at runtime.
export const SAT_DATES = [
  ["2026-10-03", "2026-09-18", "2026-09-22"],
  ["2026-11-07", "2026-10-23", "2026-10-27"],
  ["2026-12-05", "2026-11-20", "2026-11-24"],
  ["2027-03-06", "2027-02-19", "2027-02-23"],
  ["2027-05-01", "2027-04-16", "2027-04-20"],
  ["2027-06-05", "2027-05-21", "2027-05-25"],
]
  .map(([date, registrationDeadline, lateRegistrationDeadline]) => ({
    date,
    status: "confirmed",
    registrationDeadline,
    lateRegistrationDeadline,
  }))
  .concat(
    [
      "2027-08-28",
      "2027-09-18",
      "2027-10-09",
      "2027-11-06",
      "2027-12-04",
      "2028-03-04",
      "2028-05-06",
      "2028-06-03",
    ].map((date) => ({
      date,
      status: "anticipated",
      registrationDeadline: null,
      lateRegistrationDeadline: null,
    })),
  );
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function upcomingSatDates(today = localDate(), dates = SAT_DATES) {
  return dates
    .filter((d) => d.date >= today)
    .sort(
      (a, b) =>
        (a.status === "confirmed" ? 0 : 1) -
          (b.status === "confirmed" ? 0 : 1) || a.date.localeCompare(b.date),
    );
}
export function formatSatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function satCountdown(date, today = localDate()) {
  return date
    ? Math.max(0, Math.round((Date.parse(date) - Date.parse(today)) / 86400000))
    : null;
}

export function satDateLabel(date) {
  return (
    formatSatDate(date) +
    (SAT_DATES.find((d) => d.date === date)?.status === "anticipated"
      ? " (anticipated)"
      : "")
  );
}
