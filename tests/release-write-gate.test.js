import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createManageStudentHandler } from "../supabase/functions/manage-student/handler.js";
import {
  nativeAppEnvironment,
  student,
  admin,
} from "./helpers/native-app-environment.js";

test(
  "PostgreSQL17/PostgREST release gate blocks cached and direct API writers and reopens safely",
  {
    skip: !(
      process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 120000,
  },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    assert.match(
      await app.json("select to_jsonb(current_setting('server_version'))"),
      /^17\./,
    );
    const login = async (who) =>
      (
        await (
          await fetch(app.apiUrl + "/auth/v1/token", {
            method: "POST",
            body: JSON.stringify({
              email: who + "@fixture.invalid",
              password: "disposable-test-only",
            }),
          })
        ).json()
      ).access_token;
    // Log in before installing/activating the gate: tokens represent cached tabs.
    const bearer = await login("student"),
      teacher = await login("admin");
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const tab = await browser.newPage();
    await tab.goto(app.appUrl + "/login");
    await tab
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await tab
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await tab.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      tab.getByRole("heading", {
        name: "Your SAT journey starts here.",
        exact: true,
      }),
    ).toBeVisible();
    await tab
      .getByRole("link", { name: "Homework", exact: true })
      .first()
      .click();
    await tab
      .locator("article")
      .filter({ hasText: "SATakror frozen homework" })
      .getByRole("button", { name: "Resume homework", exact: true })
      .click();
    await expect(tab.getByText(/^Question \d+ of 8$/)).toBeVisible();
    const request = async (
      path,
      body,
      version = null,
      jwt = bearer,
      method = "POST",
    ) => {
      const response = await fetch(app.apiUrl + "/rest/v1/" + path, {
        method,
        headers: {
          authorization: "Bearer " + jwt,
          "Content-Type": "application/json",
          ...(version ? { "x-satchi-client-version": version } : {}),
        },
        ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
      });
      const raw = await response.text();
      return { status: response.status, body: raw ? JSON.parse(raw) : null };
    };
    const payload = { p_session: app.session, p_changes: [] };
    await app.sql(
      await readFile("scripts/release/install-write-gate.sql", "utf8"),
    );
    const mode = (value, users = []) =>
      app.sql(
        `select satchi_release.set_mode('${value}',ARRAY[${users.map((uid) => `'${uid}'::uuid`).join(",")}]::uuid[])`,
      );
    await t.test(
      "the gate stays active while all four pending migrations run",
      async () => {
        await mode("maintenance", [student]);
        await app.upgrade();
        assert.equal(
          await app.json(
            "select to_jsonb(mode) from satchi_release.control where id",
          ),
          "maintenance",
        );
        assert.equal(
          (
            await request(
              "rpc/save_practice_changes",
              payload,
              "20261008",
              teacher,
            )
          ).status,
          503,
        );
        await mode("off");
      },
    );
    await t.test("installed off mode preserves existing requests", async () => {
      assert.equal(
        (await request("rpc/save_practice_changes", payload)).status,
        200,
      );
    });
    await mode("maintenance");
    await t.test(
      "already authenticated tabs and direct mutating API paths fail before writes",
      async () => {
        await tab.getByRole("radio").nth(1).check();
        await expect(
          tab.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        await expect(tab.getByRole("radio").nth(1)).toBeChecked();
        const id = await app.json(
          `select to_jsonb(id) from book_practice_items where session_id='${app.session}' limit 1`,
        );
        const endpoints = {
          save_book_practice: { p_session_id: app.session, p_answers: [] },
          save_practice_changes: payload,
          check_book_practice_answer: {
            p_session: app.session,
            p_item: id,
            p_choice: 1,
            p_event: "f3000000-0000-0000-0000-000000000001",
          },
          check_bank_response: {
            p_session: app.session,
            p_item: id,
            p_response: "8.6",
            p_event: "f3000000-0000-0000-0000-000000000002",
          },
          finish_book_practice: { p_session_id: app.session },
          practice_heartbeat: {
            p_session: app.session,
            p_position: 0,
            p_seconds: 1,
          },
          create_homework: { p_data: {} },
          update_homework: { p_homework: app.homework, p_data: {} },
          save_daily_homework: { p_data: {}, p_template: app.daily },
          start_homework: { p_assignment: app.assignment },
          review_open_response: {
            p_session: app.session,
            p_item: id,
            p_correct: true,
            p_expected_revision: 0,
          },
        };
        for (const [rpc, args] of Object.entries(endpoints)) {
          const result = await request("rpc/" + rpc, args, "20261008");
          assert.equal(result.status, 503);
          assert.equal(result.body.code, "PT503");
        }
        // Switching to GET must not turn a write RPC into a maintenance bypass.
        const query = new URLSearchParams({
          p_session_id: app.session,
          p_answers: "[]",
        });
        const getWrite = await fetch(
          app.apiUrl + "/rest/v1/rpc/save_book_practice?" + query,
          { headers: { Authorization: "Bearer " + bearer } },
        );
        assert.equal(getWrite.status, 405);
        const direct = await request(
          "book_practice_items?id=eq." +
            (await app.json(
              `select to_jsonb(id) from book_practice_items where session_id='${app.session}' limit 1`,
            )),
          { selected_answer: 2 },
          "20261008",
          bearer,
          "PATCH",
        );
        assert.equal(direct.status, 503);
        assert.equal(
          (
            await request(
              "profiles?id=eq." + student,
              { display_name: "Service fixture" },
              null,
              app.serviceToken,
              "PATCH",
            )
          ).status,
          503,
        );
        assert.equal(
          (await request("groups", null, null, bearer, "GET")).status,
          200,
        );
      },
    );
    await mode("maintenance", [student]);
    await t.test(
      "verification exception needs current client and grants no control privileges",
      async () => {
        assert.equal(
          (await request("rpc/save_practice_changes", payload)).status,
          426,
        );
        assert.equal(
          (await request("rpc/save_practice_changes", payload, "20261008"))
            .status,
          200,
        );
        assert.equal(
          (
            await request(
              "rpc/save_practice_changes",
              payload,
              "20261008",
              teacher,
            )
          ).status,
          503,
        );
        await assert.rejects(
          app.sql(app.as(student, "select satchi_release.set_mode('off')")),
          /permission denied/,
        );
      },
    );
    await mode("compatible");
    await t.test(
      "the actual Edge handler rejects account mutations before Auth side effects",
      async () => {
        await mode("maintenance", [admin, student]);
        const env = {
          SUPABASE_URL: app.apiUrl,
          SUPABASE_ANON_KEY: "disposable-fixture-public",
          SUPABASE_SERVICE_ROLE_KEY: app.serviceToken,
          SATCHI_RELEASE_GATE_REQUIRED: "true",
        };
        const handle = createManageStudentHandler({
          createClient,
          getEnv: (key) => env[key],
          logError() {},
        });
        const response = await handle(
          new Request(app.apiUrl + "/functions/v1/manage-student", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + teacher,
              "Content-Type": "application/json",
              "x-satchi-client-version": "20261008",
            },
            body: JSON.stringify({
              action: "create",
              email: "not-created@fixture.invalid",
              password: "disposable-test-only",
              display_name: "Not created",
            }),
          }),
        );
        assert.equal(response.status, 503);
        assert.match(
          (await response.json()).error,
          /Account management is paused for maintenance/,
        );
        assert.equal(
          await app.json(
            "select count(*)::int from auth.users where email='not-created@fixture.invalid'",
          ),
          0,
        );
        await mode("compatible");
      },
    );
    await t.test(
      "reopening rejects old clients and accepts version-aware answers and idempotent retry",
      async () => {
        await tab
          .getByRole("button", { name: "Retry saving", exact: true })
          .click();
        await expect(
          tab.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        assert.equal(
          (await request("rpc/save_practice_changes", payload)).status,
          426,
        );
        const id = await app.json(
          `select to_jsonb(id) from book_practice_items where session_id='${app.session}' order by position limit 1`,
        );
        const change = {
          p_session: app.session,
          p_changes: [{ id, selected_answer: 1, expected_revision: 0 }],
        };
        const result = await request(
          "rpc/save_practice_changes",
          change,
          "20261008",
        );
        assert.equal(result.status, 200);
        assert.deepEqual(
          await request("rpc/save_practice_changes", change, "20261008"),
          result,
        );
        const legacy = await request(
          "rpc/save_book_practice",
          {
            p_session_id: app.session,
            p_answers: [{ id, selected_answer: 2 }],
          },
          "20261008",
        );
        assert.equal(legacy.status, 400);
        assert.match(legacy.body.message, /Answer version required/);
        assert.equal(
          await app.json(
            `select to_jsonb(selected_answer) from book_practice_items where id='${id}'`,
          ),
          1,
        );
        assert.equal(
          (
            await request(
              "rpc/save_practice_changes",
              payload,
              "20261008",
              teacher,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "profiles?id=eq." + student,
              { display_name: "Service fixture" },
              null,
              app.serviceToken,
              "PATCH",
            )
          ).status,
          204,
        );
      },
    );
    await t.test(
      "maintenance can be reactivated and pre-release off mode restored explicitly",
      async () => {
        await mode("maintenance");
        assert.equal(
          (await request("rpc/save_practice_changes", payload, "20261008"))
            .status,
          503,
        );
        await mode("off");
        assert.equal(
          (await request("rpc/save_practice_changes", payload)).status,
          200,
        );
        await mode("compatible");
        assert.equal(
          (await request("rpc/save_practice_changes", payload)).status,
          426,
        );
      },
    );
    await t.test(
      "activation waits for transactions already admitted by the hook",
      async () => {
        const active = app.sql(
          app.as(
            student,
            `begin;set local request.method='POST';set local request.headers='{"x-satchi-client-version":"20261008"}';select satchi_release.check_request();select pg_sleep(0.5);commit`,
          ),
        );
        for (let n = 0; n < 100; n++) {
          if (
            await app.json(
              "select to_jsonb(exists(select 1 from pg_locks where locktype='advisory' and objid=88101008 and granted and mode='ShareLock'))",
            )
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const start = Date.now();
        await mode("maintenance");
        await active;
        assert.ok(
          Date.now() - start >= 250,
          "Activation must drain the admitted request",
        );
        assert.equal(
          (await request("rpc/save_practice_changes", payload, "20261008"))
            .status,
          503,
        );
      },
    );
  },
);
