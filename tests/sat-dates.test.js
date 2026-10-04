import test from "node:test";
import assert from "node:assert/strict";
import {
  SAT_DATES,
  upcomingSatDates,
  satCountdown,
  formatSatDate,
  satDateLabel,
} from "../src/data/sat-dates.js";
test("official upcoming SAT dates exclude past dates, sort confirmed dates, and preserve anticipated status", () => {
  const dates = upcomingSatDates("2026-10-04");
  assert.equal(dates[0].date, "2026-11-07");
  assert.equal(dates[0].registrationDeadline, "2026-10-23");
  assert.equal(dates[1].lateRegistrationDeadline, "2026-11-24");
  assert.equal(dates[5].status, "anticipated");
  assert.equal(dates[5].registrationDeadline, null);
  assert.equal(
    SAT_DATES.find((d) => d.date === "2027-03-06").status,
    "confirmed",
  );
  assert.equal(satCountdown("2026-11-07", "2026-10-04"), 34);
  assert.equal(satCountdown(null), null);
  assert.match(satDateLabel("2027-08-28"), /anticipated/);
  assert.equal(formatSatDate("2026-11-07"), "November 7, 2026");
});
