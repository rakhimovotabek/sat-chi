import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyBattleBrowser({
  app,
  browser,
  login,
  clients,
  rpc,
}) {
  const action = (client, action, data = {}) =>
    rpc(client, "battle_action", { p_action: action, p_data: data });
  const host = clients[1],
    opponent = clients[2];
  let room = await action(host, "create", {
    category: "Math",
    capacity: 4,
    teamSize: 2,
    questionCount: 1,
    seconds: 90,
    public: false,
    filters: { book: app.book },
  });
  const hostPage = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  const guestPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await login(hostPage, "student");
    await hostPage.goto(`${app.appUrl}/battles`);
    await hostPage.getByLabel("Invitation code").fill(room.code);
    await hostPage
      .getByRole("button", { name: "Join lobby", exact: true })
      .click();
    await login(guestPage, "studentB");
    await guestPage.goto(`${app.appUrl}/battles`);
    await guestPage.getByLabel("Invitation code").fill(room.code);
    await guestPage
      .getByRole("button", { name: "Join lobby", exact: true })
      .click();
    await action(clients[3], "join", { code: room.code });
    await action(clients[4], "join", { code: room.code });
    await expect(
      guestPage.getByText("Host controls", { exact: true }),
    ).toHaveCount(0);
    await hostPage.bringToFront();
    await hostPage.getByText("Host controls", { exact: true }).click();
    const controls = hostPage.locator(".battle-host-controls");
    await controls
      .getByLabel("Time per question", { exact: true })
      .selectOption("60");
    await controls
      .getByRole("checkbox", { name: "Show in public lobbies" })
      .check();
    await controls.getByRole("button", { name: "Save lobby settings" }).click();
    await expect
      .poll(
        async () => (await action(opponent, "state", { id: room.id })).seconds,
      )
      .toBe(60);
    await controls
      .getByLabel("First player", { exact: true })
      .selectOption(room.me);
    const other = (await action(opponent, "state", { id: room.id })).me;
    await controls.getByLabel("Player on the other team").selectOption(other);
    await controls
      .getByRole("button", { name: "Swap selected players" })
      .click();
    await expect
      .poll(
        async () =>
          (await action(host, "state", { id: room.id })).members.find(
            (member) => member.user_id === room.me,
          ).team,
      )
      .toBe(2);
    await controls
      .getByRole("button", { name: "Remove Player 4", exact: true })
      .click();
    await controls
      .getByRole("button", { name: "Confirm remove Player 4", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await action(host, "state", { id: room.id })).members.length,
      )
      .toBe(3);
    await assert.rejects(
      () => action(clients[4], "join", { code: room.code }),
      /host removed/,
    );
    await action(clients[5], "join", { code: room.code });
    await expect(hostPage.locator(".battle-player")).toHaveCount(4);
    await guestPage.bringToFront();
    await expect(
      guestPage.locator(".battle-player").first().locator("small"),
    ).toContainText("Team 2");
    await hostPage.bringToFront();
    await hostPage.screenshot({
      path: "test-results/native-battle-host-laptop.png",
      fullPage: true,
    });
    await guestPage.screenshot({
      path: "test-results/native-battle-lobby-mobile.png",
      fullPage: true,
    });
    for (const client of [clients[3], clients[5]])
      await action(client, "ready", { id: room.id });
    await guestPage
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await hostPage
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await hostPage
      .getByRole("button", { name: "Start Battle", exact: true })
      .click();
    await expect(
      hostPage.getByRole("button", { name: "Submit answer", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    room = await action(host, "state", { id: room.id });
    const answer = room.question.question_type === "open" ? "8.6" : "1";
    const fillAnswer = async (page) => {
      if (room.question.question_type === "open")
        await page.getByLabel("Your numerical answer").fill(answer);
      else await page.getByRole("radio").nth(1).check();
      await page
        .getByRole("button", { name: "Submit answer", exact: true })
        .click();
    };
    await guestPage.bringToFront();
    await fillAnswer(guestPage);
    await expect(
      guestPage.getByText("Answer submitted. Waiting for the other players…", {
        exact: true,
      }),
    ).toBeVisible();
    // A real browser transport disconnect, then a reload using its independently
    // issued Auth session, must keep the same seat and durable answer.
    await guestPage.context().setOffline(true);
    await expect(
      guestPage.getByText("Connection interrupted.", { exact: false }),
    ).toBeVisible();
    await guestPage.context().setOffline(false);
    await guestPage.reload();
    await expect(
      guestPage.getByText("Answer submitted. Waiting for the other players…", {
        exact: true,
      }),
    ).toBeVisible();
    const restored = await action(opponent, "state", { id: room.id });
    assert.equal(restored.submitted, true);
    assert.equal(
      restored.members.find((member) => member.user_id === other).seat,
      2,
    );
    assert.equal(restored.members.length, 4);
    await hostPage.bringToFront();
    await fillAnswer(hostPage);
    for (const client of [clients[3], clients[5]])
      await action(client, "answer", {
        id: room.id,
        round: 1,
        response: answer,
      });
    await expect(
      hostPage.getByRole("heading", { name: "Top of the arena", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const finished = await action(opponent, "state", { id: room.id });
    assert.equal(finished.state, "FINISHED");
    assert.ok(finished.members.every((member) => member.score === 100));
    assert.equal(finished.history[0].points, 100);
    assert.ok(
      await guestPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  } catch (error) {
    await hostPage.screenshot({
      path: "test-results/native-battle-host-failure.png",
      fullPage: true,
    });
    await guestPage.screenshot({
      path: "test-results/native-battle-guest-failure.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await hostPage.close();
    await guestPage.close();
  }
}
