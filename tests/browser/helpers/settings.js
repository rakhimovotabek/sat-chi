import { learningFixture } from "./learning.js";
export async function settingsFixture(page, role = "student") {
  const store = await learningFixture(page, role),
    id = "d0000000-0000-0000-0000-000000000010";
  store.accountName = "Fixture Learner";
  store.dailyMinutes = 30;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  await page.route(
    /\/rest\/v1\/(profiles|study_preferences|rpc\/(save_account_settings|save_sat_date))(\?|$)/,
    async (route) => {
      const req = route.request(),
        name = new URL(req.url()).pathname.split("/").pop(),
        body = req.postDataJSON();
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      let data;
      if (name === "profiles")
        data = [
          {
            id,
            role,
            active: true,
            display_name: store.accountName,
            target_test_date: store.satDate || null,
            onboarding_completed: true,
            target_sat_score: 1450,
            grade: "11",
            main_goal: "Improve Math",
          },
        ];
      if (name === "study_preferences")
        data = { minutes_per_day: store.dailyMinutes };
      if (name === "save_sat_date") {
        store.satDate = body.p_date;
        data = null;
      }
      if (name === "save_account_settings") {
        store.accountName = body.p_display_name;
        store.dailyMinutes = body.p_daily_minutes;
        store.plan = {
          preferences: {
            minutes_per_day: body.p_daily_minutes,
            preferred_days: [1, 2, 3, 4, 5],
          },
          today: new Date().toISOString().slice(0, 10),
          tasks: [],
        };
        data = null;
      }
      return route.fulfill({
        headers,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  return store;
}
