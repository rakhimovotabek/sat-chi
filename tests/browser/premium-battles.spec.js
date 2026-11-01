import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";
import { learningFixture } from "./helpers/learning.js";
const widths = [390, 768, 1366, 1920];
for (const theme of ["light", "dark"])
  for (const width of widths) {
    test(`premium landing and Battle arena ${theme} ${width}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 768 });
      await page.addInitScript((theme) => {
        localStorage.setItem("satchi.color-theme", theme);
      }, theme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Master the SAT",
      );
      await page.getByRole("button", { name: "Progress", exact: true }).click();
      await expect(
        page.getByText("See the learning behind the numbers."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Franz Hermann" }),
      ).toHaveAttribute("href", "/dashboard");
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.impeccable/review/premium-landing-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await contentFixture(page);
      const uid = "d0000000-0000-0000-0000-000000000010",
        opp = "d0000000-0000-0000-0000-000000000011";
      const members = [
        {
          user_id: uid,
          display_name: "Franz Hermann",
          seat: 1,
          team: 1,
          score: 0,
          ready: true,
          last_seen: new Date().toISOString(),
        },
        {
          user_id: opp,
          display_name: "Alexandria With A Long Display Name",
          seat: 2,
          team: 2,
          score: 0,
          ready: true,
          last_seen: new Date().toISOString(),
        },
      ];
      let state = "LOBBY";
      await page.route("**/rest/v1/rpc/battle_action", async (route) => {
        const { p_action } = route.request().postDataJSON();
        if (p_action === "list")
          return route.fulfill({ json: { lobbies: [], history: [] } });
        if (p_action === "start") state = "PLAYING";
        if (p_action === "answer") {
          state = "ROUND_RESULTS";
          members[0].score = 138;
          members[1].score = 112;
        }
        return route.fulfill({
          json: {
            id: "b0000000-0000-0000-0000-000000000001",
            code: "FOCUS123",
            category: "Math",
            host_id: uid,
            me: uid,
            state,
            scoring_version: 2,
            history:
              state === "FINISHED"
                ? [
                    {
                      round: 1,
                      correct: true,
                      points: 138,
                      response: "1",
                      answer: 1,
                      explanation: "Divide by two.",
                      question: {
                        question_text: "Solve 2x = 8.",
                        question_type: "mcq",
                        options: ["2", "4", "6", "8"],
                      },
                    },
                  ]
                : [],
            members,
            seconds: 60,
            capacity: 2,
            team_size: 0,
            round: 1,
            question_count: 1,
            serverNow: new Date().toISOString(),
            question:
              state === "LOBBY"
                ? null
                : {
                    question_text: "Solve 2x = 8.",
                    question_type: "mcq",
                    options: ["2", "4", "6", "8"],
                  },
            review:
              state === "ROUND_RESULTS"
                ? { answer: 1, points: 138, explanation: "Divide by two." }
                : null,
          },
        });
      });
      await page.route("**/rest/v1/rpc/battle_leaderboard", (route) =>
        route.fulfill({
          json: {
            me: uid,
            rows: [
              {
                user_id: uid,
                display_name: "Franz Hermann",
                rank: 1,
                matches: 2,
                wins: 1,
                losses: 0,
                draws: 1,
                points: 250,
                win_rate: 50,
                accuracy: 80,
              },
            ],
          },
        }),
      );
      await page.goto("/battles");
      await expect(
        page.getByRole("heading", { name: "Battle leaderboard" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "This week", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "This week", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({
        path: `.impeccable/review/premium-battles-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Create Battle", exact: true })
        .click();
      await expect(page.getByText("Franz Hermann · You · Host")).toBeVisible();
      await expect(
        page
          .locator(".battle-player-name")
          .filter({ hasText: "Alexandria With A Long Display Name" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Start Battle", exact: true })
        .click();
      await page.getByRole("radio").nth(1).check();
      await page.getByRole("button", { name: "Submit answer" }).click();
      await expect(
        page.getByText("+138 Battle pts · 38 speed bonus"),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `.impeccable/review/premium-arena-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      members[0].correct = 1;
      members[0].speed_bonus = 38;
      members[1].correct = 1;
      members[1].speed_bonus = 12;
      state = "FINISHED";
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Top of the arena" }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Final Battle standings" }),
      ).toBeVisible();
      if (width === 1366)
        await page.screenshot({
          path: `.impeccable/review/premium-results-${theme}.png`,
          fullPage: true,
          animations: "disabled",
        });
      expect(errors).toEqual([]);
    });
  }
test("Dashboard signature, footer navigation and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await learningFixture(page);
  await expect(page.getByText("Simply Lovely!", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Franz Hermann" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const theme of ["light", "dark"])
    for (const width of [390, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.getByLabel("Color theme", { exact: true }).selectOption(theme);
      await expect(page.locator(".metric-card").first()).toBeVisible();
      await expect(page.locator(".form-error")).toHaveCount(0);
      await page.screenshot({
        path: `.impeccable/review/premium-dashboard-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
});
