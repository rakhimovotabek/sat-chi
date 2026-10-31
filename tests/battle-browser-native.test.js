import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
import { verifyBattleBrowser } from "./helpers/battle-browser.js";

test(
  "two isolated authenticated browsers manage a lobby and recover a saved Battle answer",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    for (const name of [
      "admin",
      "student",
      "studentB",
      "studentC",
      "studentD",
      "studentE",
    ]) {
      const client = createClient(
        app.apiUrl,
        app.tokenFor(student, { role: "anon" }),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      assert.ifError(
        (
          await client.auth.signInWithPassword({
            email: name + "@fixture.invalid",
            password: "disposable-test-only",
          })
        ).error,
      );
      clients.push(client);
      t.after(async () => {
        await client.removeAllChannels();
        client.realtime.disconnect();
        client.auth.stopAutoRefresh();
      });
    }
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    await mkdir("test-results", { recursive: true });
    const login = async (page, name) => {
      await page.goto(`${app.appUrl}/login`);
      await page
        .getByLabel("Email", { exact: true })
        .fill(name + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(/\/(admin|dashboard)/);
    };
    const rpc = async (client, name, args) => {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    await verifyBattleBrowser({ app, browser, login, clients, rpc });
  },
);
