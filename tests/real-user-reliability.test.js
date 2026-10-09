import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  cp,
  mkdir,
  realpath,
  stat,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  admin,
  student,
  studentB,
  studentC,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);

test(
  "real-user reliability: durable browser journeys and broad recurring pools on PostgreSQL/PostgREST",
  { skip: !enabled, timeout: 600000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    assert.match(
      await app.json("select to_jsonb(current_setting('server_version'))"),
      /^17\./,
    );
    await app.sql(`insert into auth.users(id,email)values('${studentB}','studentB@fixture.invalid'),('${studentC}','studentC@fixture.invalid');
    update public.profiles set onboarding_completed=true,display_name='Reliability student',target_sat_score=1400,grade='11',main_goal='Improve Both' where id in('${studentB}','${studentC}');`);
    const rpc = async (uid, name, args = {}, expected = 200) => {
      const r = await fetch(app.apiUrl + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: {
          authorization: "Bearer " + app.tokenFor(uid),
          "Content-Type": "application/json",
          "x-satchi-client-version": "20261008",
        },
        body: JSON.stringify(args),
      });
      const raw = await r.text();
      const body = raw ? JSON.parse(raw) : null;
      assert.equal(r.status, expected, JSON.stringify(body));
      return body;
    };
    const rows = (sid) =>
      app.json(
        `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${sid}'`,
      );
    const newHomework = async (
      title,
      ids,
      recipients = [student],
      groups = [],
    ) => {
      const hid = await rpc(admin, "create_homework", {
        p_data: {
          title,
          dueAt: "2027-12-01T12:00:00Z",
          students: recipients,
          groups,
          sections: [
            {
              title: "Reliability questions",
              count: ids.length,
              questionIds: ids,
            },
          ],
        },
      });
      return {
        hid,
        assignment: async (uid) =>
          app.json(
            `select to_jsonb(id) from public.homework_assignments where homework_id='${hid}' and student_id='${uid}'`,
          ),
      };
    };
    const start = async (homework, uid) =>
      rpc(uid, "start_homework", {
        p_assignment: await homework.assignment(uid),
      });
    const profileDir = await mkdtemp(
      join(tmpdir(), "satchi-reliability-browser-"),
    );
    const marker = randomUUID();
    let launchSequence = 0;
    let recoveryFailed = false;
    const evidenceRoot = process.env.SATCHI_AUTH_EVIDENCE_DIR;
    const diskState = async () => {
      const directory = join(profileDir, "Default", "Local Storage", "leveldb");
      const files = await readdir(directory).catch(() => []);
      const buffers = await Promise.all(
        files
          .filter((file) => /\.(log|ldb)$/.test(file))
          .map((file) => readFile(join(directory, file))),
      );
      const identity = await stat(profileDir);
      return {
        profile: await realpath(profileDir),
        device: identity.dev,
        inode: identity.ino,
        localStorageFiles: files.length,
        authKeyOnDisk: buffers.some((value) =>
          value.includes(Buffer.from("sb-127-auth-token")),
        ),
        markerKeyOnDisk: buffers.some((value) =>
          value.includes(Buffer.from("satchi-restart-diagnostic")),
        ),
      };
    };
    const preserve = async (label) => {
      if (!evidenceRoot) return;
      await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
      await cp(profileDir, join(evidenceRoot, label), { recursive: true });
      await writeFile(
        join(evidenceRoot, label + ".json"),
        JSON.stringify(await diskState()),
        { mode: 0o600 },
      );
    };
    const launch = async () => {
      const browserContext = await chromium.launchPersistentContext(
        profileDir,
        {
          headless: true,
          channel: "chromium",
        },
      );
      console.log("Persistent context identity", {
        launchSequence: ++launchSequence,
        ...(await diskState()),
      });
      await browserContext.addInitScript(
        ({ marker, origin }) => {
          if (location.origin === origin)
            window.authRestartInitial = {
              origin: location.origin,
              markerRetained:
                localStorage.getItem("satchi-restart-diagnostic") === marker,
              authRetained: Boolean(localStorage.getItem("sb-127-auth-token")),
            };
          window.authStorageTrace = [];
          const get = Storage.prototype.getItem;
          const remove = Storage.prototype.removeItem;
          Storage.prototype.getItem = function (key) {
            const raw = get.call(this, key);
            if (key === "sb-127-auth-token") {
              let value;
              try {
                value = JSON.parse(raw);
              } catch {
                /* Record invalid JSON. */
              }
              window.authStorageTrace.push({
                operation: "read",
                stored: Boolean(raw),
                valid: Boolean(
                  value?.access_token &&
                    value?.refresh_token &&
                    value?.expires_at,
                ),
                hasUser: Boolean(value?.user?.id),
                unexpired: value?.expires_at > Date.now() / 1000,
              });
              if (window.authStorageTrace.length > 100)
                window.authStorageTrace.shift();
            }
            return raw;
          };
          Storage.prototype.removeItem = function (key) {
            if (key === "sb-127-auth-token")
              window.authStorageTrace.push({ operation: "remove" });
            return remove.call(this, key);
          };
          const clear = Storage.prototype.clear;
          Storage.prototype.clear = function () {
            window.authStorageTrace.push({
              operation: "clear",
              local: this === localStorage,
            });
            return clear.call(this);
          };
        },
        { marker, origin: app.appUrl },
      );
      return browserContext;
    };
    let context = await launch();
    t.after(async () => {
      await context.close();
      if (recoveryFailed) await preserve("failed-after-close");
      await rm(profileDir, { recursive: true, force: true });
    });
    let page = await context.newPage();
    const exceptions = [],
      failures = [],
      outside = [];
    const step = (name, run) =>
      t.test(name, async () => {
        try {
          await run();
        } catch (error) {
          console.error(
            name,
            error.message,
            (
              await page
                .locator("body")
                .innerText()
                .catch(() => "Browser unavailable")
            ).slice(0, 3000),
            JSON.stringify(failures),
          );
          throw error;
        }
      });
    const watch = (tab) => {
      tab.setDefaultTimeout(15000);
      tab.on("request", (r) => {
        if (
          !r.url().startsWith(app.appUrl) &&
          !r.url().startsWith(app.apiUrl) &&
          !r.url().startsWith("data:")
        )
          outside.push(new URL(r.url()).origin);
      });
      tab.on("pageerror", (e) => exceptions.push(e.message));
      tab.on("response", (r) => {
        if (r.status() >= 400)
          failures.push({
            status: r.status(),
            path: new URL(r.url()).pathname,
          });
      });
      tab.on("dialog", (d) => d.accept());
    };
    watch(page);
    const login = async (tab, who = "student") => {
      await tab.goto(app.appUrl + "/login");
      await tab
        .getByLabel("Email", { exact: true })
        .fill(who + "@fixture.invalid");
      await tab
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await tab.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        tab.getByRole("heading", {
          name:
            who === "admin"
              ? "Admin Dashboard"
              : "Your SAT journey starts here.",
          exact: true,
        }),
      ).toBeVisible();
    };
    const open = async (tab, sid) => {
      await tab.goto(app.appUrl + "/practice/" + sid, {
        waitUntil: "domcontentloaded",
      });
      try {
        await expect(
          tab.getByRole("button", { name: /Question \d+ of/ }),
        ).toBeVisible();
      } catch (error) {
        recoveryFailed = true;
        await preserve("failed-before-cleanup");
        // Fixture-only metadata, never token values. Distinguish signed-out
        // recovery from answer loss and retain the first failure's evidence.
        console.error(
          "Practice recovery diagnostics",
          await tab.evaluate(() => {
            const raw = localStorage.getItem("sb-127-auth-token");
            const auth = raw ? JSON.parse(raw) : null;
            return {
              trace: window.authStorageTrace,
              firstReadBeforeSdk: window.authRestartInitial,
              origin: location.origin,
              path: location.pathname,
              storedAuth: Boolean(auth),
              hasUser: Boolean(auth?.user),
              unexpired: auth?.expires_at > Date.now() / 1000,
            };
          }),
          exceptions,
        );
        throw error;
      }
    };
    const go = async (tab, position) => {
      await tab.getByRole("button", { name: /Question \d+ of/ }).click();
      await tab
        .getByRole("dialog")
        .getByRole("button", {
          name: new RegExp("^Question " + (position + 1) + ","),
        })
        .click();
    };
    const saved = async (tab) =>
      expect(tab.getByText("All changes saved", { exact: true })).toBeVisible();
    const answer = async (tab, row, value) => {
      await go(tab, row.position);
      if (row.question.question_type === "open")
        await tab.getByLabel("Your answer", { exact: true }).fill(value);
      else await tab.getByRole("radio").nth(value).check();
    };
    const hw = await newHomework("Persistent mixed Homework", [
      app.ids[2],
      app.ids[14],
      app.ids[15],
      app.ids[3],
    ]);
    const sid = await start(hw, student);
    let mixed = await rows(sid);
    await login(page);
    await open(page, sid);
    await step(
      "page-hide heartbeat passes the actual compatible write gate",
      async () => {
        await app.sql(
          await readFile("scripts/release/install-write-gate.sql", "utf8"),
        );
        await app.sql("select satchi_release.set_mode('compatible')");
        await expect
          .poll(async () => {
            const r = await fetch(
              app.apiUrl + "/rest/v1/rpc/save_practice_changes",
              {
                method: "POST",
                headers: {
                  authorization: "Bearer " + app.tokenFor(student),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ p_session: sid, p_changes: [] }),
              },
            );
            return r.status;
          })
          .toBe(426);
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/rpc/practice_heartbeat"),
        );
        await page.evaluate(() =>
          window.dispatchEvent(new PageTransitionEvent("pagehide")),
        );
        const reply = await response;
        assert.equal(
          reply.request().headers()["x-satchi-client-version"],
          "20261008",
        );
        assert.equal(reply.status(), 200);
      },
    );
    await step(
      "MCQ, image and open answers survive full browser restart and subsequent login, with authoritative acknowledgements",
      async () => {
        for (const row of mixed) {
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/rpc/save_practice_changes") &&
              r.request().method() === "POST",
          );
          await answer(
            page,
            row,
            row.question.question_type === "open" ? "8.6" : 1,
          );
          const result = await response;
          assert.equal(result.status(), 200);
          const ack = await result.json();
          assert.ok(ack.some((a) => a.id === row.id && a.answer_revision > 0));
          await saved(page);
          const current = (await rows(sid)).find((i) => i.id === row.id);
          assert.equal(
            current.question.question_type === "open"
              ? current.selected_response
              : current.selected_answer,
            current.question.question_type === "open" ? "8.6" : 1,
          );
        }
        await expect
          .poll(() =>
            page
              .locator(".stimulus-panel img,.answer-choice img")
              .evaluateAll((imgs) =>
                imgs.every((i) => i.complete && i.naturalWidth > 0),
              ),
          )
          .toBe(true);
        console.log(
          "Before persistent browser restart",
          await page.evaluate((marker) => {
            localStorage.setItem("satchi-restart-diagnostic", marker);
            return {
              storedAuth: Boolean(localStorage.getItem("sb-127-auth-token")),
              origin: location.origin,
              markerWritten: true,
            };
          }, marker),
        );
        await context.close();
        console.log("Closed profile disk identity", await diskState());
        await preserve("before-restart");
        context = await launch();
        page = await context.newPage();
        watch(page);
        await open(page, sid);
        assert.equal(
          await page.evaluate(
            (marker) =>
              localStorage.getItem("satchi-restart-diagnostic") === marker,
            marker,
          ),
          true,
          "Unrelated origin storage must survive the same-profile restart",
        );
        for (const row of mixed) {
          await go(page, row.position);
          if (row.question.question_type === "open")
            await expect(
              page.getByLabel("Your answer", { exact: true }),
            ).toHaveValue("8.6");
          else await expect(page.getByRole("radio").nth(1)).toBeChecked();
        }
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await page.waitForURL(/\/login$/);
        await login(page);
        await open(page, sid);
        await saved(page);
        mixed = await rows(sid);
        assert.equal(mixed.filter((i) => i.selected_answer !== null).length, 4);
      },
    );
    await step(
      "failed requests, rapid edits, navigation and logout retain unacknowledged drafts until server persistence",
      async () => {
        const row = mixed.find((i) => i.question.question_type === "mcq");
        await go(page, row.position);
        await page.route("**/rpc/save_practice_changes", (route) =>
          route.abort("failed"),
        );
        await page.getByRole("radio").nth(2).check();
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).selected_answer,
          1,
        );
        await page.reload();
        await go(page, row.position);
        await expect(page.getByRole("radio").nth(2)).toBeChecked();
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await page.waitForURL(/\/login$/);
        await login(page);
        await open(page, sid);
        await go(page, row.position);
        await expect(page.getByRole("radio").nth(2)).toBeChecked();
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        await page.unroute("**/rpc/save_practice_changes");
        await page
          .getByRole("button", { name: "Retry saving", exact: true })
          .click();
        await saved(page);
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).selected_answer,
          2,
        );
        let release;
        const waiting = new Promise((r) => (release = r));
        let started;
        const entered = new Promise((r) => (started = r));
        await page.route("**/rpc/save_practice_changes", async (route) => {
          started();
          await waiting;
          await route.continue();
        });
        await page.getByRole("radio").nth(0).check();
        await entered;
        await page.getByRole("radio").nth(3).check();
        await page.getByRole("radio").nth(1).check();
        await go(page, 3);
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).selected_answer,
          2,
        );
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toHaveCount(0);
        release();
        await saved(page);
        await page.unroute("**/rpc/save_practice_changes");
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).selected_answer,
          1,
        );
        await page.reload();
        await go(page, row.position);
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
      },
    );
    await step(
      "server commit with lost HTTP acknowledgement recovers without a duplicate or overwritten answer",
      async () => {
        const row = mixed.find((i) => i.question.question_type === "mcq");
        await go(page, row.position);
        await page.route("**/rpc/save_practice_changes", async (route) => {
          const r = await route.fetch();
          assert.equal(r.status(), 200);
          await route.abort("failed");
        });
        await page.getByRole("radio").nth(3).check();
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        const current = (await rows(sid)).find((i) => i.id === row.id);
        assert.equal(current.selected_answer, 3);
        await page.unroute("**/rpc/save_practice_changes");
        await page.reload();
        await go(page, row.position);
        await saved(page);
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).answer_revision,
          current.answer_revision,
        );
        await expect(page.getByRole("radio").nth(3)).toBeChecked();
      },
    );
    await step(
      "two stale tabs reject conflicting saves, preserve drafts, and require review before overriding",
      async () => {
        const row = (await rows(sid)).find(
          (i) => i.question.question_type === "mcq",
        );
        const second = await context.newPage();
        watch(second);
        await open(second, sid);
        await go(second, row.position);
        await page.getByRole("radio").nth(1).check();
        await saved(page);
        const response = second.waitForResponse((r) =>
          r.url().endsWith("/rpc/save_practice_changes"),
        );
        await second.getByRole("radio").nth(2).check();
        const conflict = await response;
        assert.equal(conflict.status(), 409);
        assert.equal((await conflict.json()).code, "PT409");
        assert.equal(
          (await rows(sid)).find((i) => i.id === row.id).selected_answer,
          1,
        );
        await expect(
          second.getByRole("region", { name: "Answer recovery" }),
        ).toBeVisible();
        await expect(
          second.getByRole("button", {
            name: "Use recovered answers",
            exact: true,
          }),
        ).toBeDisabled();
        await second
          .getByRole("button", { name: "Reload saved answers", exact: true })
          .click();
        await expect(
          second.getByRole("button", {
            name: "Use recovered answers",
            exact: true,
          }),
        ).toBeEnabled();
        await second
          .getByRole("button", { name: "Keep saved answers", exact: true })
          .click();
        await saved(second);
        await second.close();
      },
    );
    await step(
      "interrupted submission stays incomplete; retry completes once and admin monitoring agrees with stored answers",
      async () => {
        await page.reload();
        await page.route("**/rpc/finish_book_practice", (route) =>
          route.abort("failed"),
        );
        await page
          .getByRole("button", { name: "Submit homework", exact: true })
          .click();
        await expect(page.getByRole("alert")).toBeVisible();
        assert.equal(
          await app.json(
            `select coalesce(to_jsonb(submitted_at),'null') from public.book_practice_sessions where id='${sid}'`,
          ),
          null,
        );
        await page.unroute("**/rpc/finish_book_practice");
        await page
          .getByRole("button", { name: "Submit homework", exact: true })
          .click();
        await expect(
          page.getByRole("region", { name: "Practice results" }),
        ).toBeVisible();
        assert.ok(
          await app.json(
            `select to_jsonb(submitted_at) from public.book_practice_sessions where id='${sid}'`,
          ),
        );
        assert.equal((await rows(sid)).filter((i) => i.correct).length, 4);
        await page.reload();
        await expect(
          page.getByRole("region", { name: "Practice results" }),
        ).toContainText("4 / 4");
        const report = await rpc(admin, "homework_directory");
        const entry = report.find(
          (r) => r.id === hw.hid && r.student_id === student,
        );
        assert.ok(entry?.submitted_at);
        assert.equal(entry.answered, 4);
        assert.equal(entry.question_count, 4);
        const pupil = await rpc(student, "homework_directory");
        assert.deepEqual(
          pupil.find((r) => r.id === hw.hid),
          entry,
        );
      },
    );
    await step(
      "three independent browser accounts save concurrently and cannot read or change another student session",
      async () => {
        const group = await app.json(
          "with g as(insert into public.groups(name)values('Reliability group')returning id)select to_jsonb(id)from g",
        );
        await app.sql(
          `insert into public.group_members(group_id,student_id)select '${group}',id from public.profiles where id in('${student}','${studentB}','${studentC}')`,
        );
        const assignment = await newHomework(
          "Concurrent group Homework",
          [app.ids[2], app.ids[15]],
          [],
          [group],
        );
        const browser = await chromium.launch({
          headless: true,
          channel: "chromium",
        });
        try {
          const outcomes = await Promise.all(
            [
              ["student", student],
              ["studentB", studentB],
              ["studentC", studentC],
            ].map(async ([label, uid], index) => {
              const c = await browser.newContext();
              const tab = await c.newPage();
              watch(tab);
              await login(tab, label);
              const session = await start(assignment, uid);
              await open(tab, session);
              for (const row of await rows(session)) {
                await answer(
                  tab,
                  row,
                  row.question.question_type === "open"
                    ? String(8.6 + index)
                    : index,
                );
                await saved(tab);
              }
              await tab.reload();
              const values = await rows(session);
              assert.equal(
                values.find((i) => i.question.question_type === "mcq")
                  .selected_answer,
                index,
              );
              assert.equal(
                values.find((i) => i.question.question_type === "open")
                  .selected_response,
                String(8.6 + index),
              );
              await c.close();
              return { session, uid };
            }),
          );
          assert.equal(new Set(outcomes.map((o) => o.session)).size, 3);
          const foreign = outcomes[1];
          const r = await fetch(
            app.apiUrl +
              "/rest/v1/book_practice_items?session_id=eq." +
              foreign.session,
            { headers: { authorization: "Bearer " + app.tokenFor(student) } },
          );
          assert.equal(r.status, 200);
          assert.deepEqual(await r.json(), []);
          const target = (await rows(foreign.session))[0];
          await rpc(
            student,
            "save_practice_changes",
            {
              p_session: foreign.session,
              p_changes: [
                {
                  id: target.id,
                  selected_answer: 3,
                  expected_revision: target.answer_revision,
                },
              ],
            },
            403,
          );
        } finally {
          await browser.close();
        }
      },
    );
    await step(
      "submitted open review persists all decisions and matches student results and admin metrics",
      async () => {
        const c = await context.browser().newContext(),
          teacher = await c.newPage();
        watch(teacher);
        await login(teacher, "admin");
        try {
          await teacher.goto(app.appUrl + "/admin/sessions/" + sid);
          const review = teacher.getByRole("region", {
            name: "Open response review",
          });
          await expect(review).toContainText("Official answer: 8.6");
          await expect(
            teacher.getByText("Student answer: 8.6", { exact: true }),
          ).toBeVisible();
          for (const [label, status, score] of [
            ["Mark incorrect", "Reviewed: Incorrect", 3],
            ["Mark correct", "Reviewed: Correct", 4],
            ["Restore automatic grading", "Automatic grading", 4],
          ]) {
            const response = teacher.waitForResponse((r) =>
              r.url().endsWith("/rpc/review_open_response"),
            );
            await review
              .getByRole("button", { name: label, exact: true })
              .click();
            assert.equal((await response).status(), 200);
            await expect(review).toContainText("Review status: " + status);
            await teacher.reload();
            await expect(review).toContainText("Review status: " + status);
            assert.equal(
              (await rows(sid)).filter((i) => i.correct).length,
              score,
            );
            await open(page, sid);
            await expect(
              page.getByRole("region", { name: "Practice results" }),
            ).toContainText(score + " / 4");
            const studentMetrics = await rpc(student, "learning_metrics");
            assert.deepEqual(
              await rpc(admin, "learning_metrics", { p_student: student }),
              studentMetrics,
            );
          }
        } finally {
          await c.close();
        }
      },
    );
    await step(
      "pending answer survives browser close and expired JWT recovery through SDK token refresh",
      async () => {
        const hw2 = await newHomework("Interrupted browser homework", [
          app.ids[2],
          app.ids[3],
        ]);
        const session = await start(hw2, student);
        await open(page, session);
        const row = (await rows(session))[0];
        await page.route("**/rpc/save_practice_changes", (r) =>
          r.abort("failed"),
        );
        await answer(page, row, 2);
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        assert.equal((await rows(session))[0].selected_answer, null);
        const expired = app.tokenFor(student, {
          exp: Math.floor(Date.now() / 1000) - 60,
        });
        const denied = await fetch(
          app.apiUrl + "/rest/v1/book_practice_items?session_id=eq." + session,
          { headers: { authorization: "Bearer " + expired } },
        );
        assert.equal(denied.status, 401);
        await page.evaluate((token) => {
          const key = Object.keys(localStorage).find((k) =>
            /^sb-.*-auth-token$/.test(k),
          );
          if (!key) throw Error("SDK auth session absent");
          const data = JSON.parse(localStorage.getItem(key));
          data.access_token = token;
          data.expires_at = Math.floor(Date.now() / 1000) - 60;
          localStorage.setItem(key, JSON.stringify(data));
        }, expired);
        await context.close();
        context = await launch();
        page = await context.newPage();
        watch(page);
        const refresh = page.waitForResponse((r) =>
          r.url().includes("/auth/v1/token?grant_type=refresh_token"),
        );
        await open(page, session);
        assert.equal((await refresh).status(), 200);
        await saved(page);
        await expect(page.getByRole("radio").nth(2)).toBeChecked();
        assert.equal((await rows(session))[0].selected_answer, 2);
        await page.getByRole("radio").nth(1).check();
        await saved(page);
        await page.reload();
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        assert.equal((await rows(session))[0].selected_answer, 1);
      },
    );
    await step(
      "Book Practice and Question Bank journeys check attempts, explanations and restoration across two books",
      async () => {
        const imported = await rpc(admin, "import_book_content", {
          p_payload: {
            schemaVersion: 1,
            kind: "book",
            book: {
              title: "Reading reliability fixture",
              category: "Reading & Writing",
              published: true,
            },
            topics: [
              {
                title: "Reading reliability topic",
                questions: Array.from({ length: 12 }, (_, i) => ({
                  type: "mcq",
                  question: "Reading reliability " + i,
                  passage:
                    "A researcher observes that learning improves when students revisit earlier problems. This passage is a disposable reading fixture.",
                  options: ["First", "Second", "Third", "Fourth"],
                  correctAnswer: 1,
                  explanation: "The second choice follows the passage.",
                  domain: "Information and Ideas",
                  difficulty: "easy",
                })),
              },
            ],
          },
        });
        const secondBook = imported.book_id;
        const secondTopic = await app.json(
          `select to_jsonb(id) from public.book_topics where book_id='${secondBook}' limit 1`,
        );
        for (const [book, topic] of [
          [app.book, app.topic],
          [secondBook, secondTopic],
        ]) {
          await page.goto(app.appUrl + `/books/${book}/topics/${topic}`);
          await page
            .getByRole("button", { name: "Start topic practice", exact: true })
            .click();
          await page.waitForURL(/\/practice\//);
          const session = page.url().split("/").at(-1);
          const row = (await rows(session)).find(
            (i) =>
              i.question.question_type === "mcq" &&
              i.question.options.every((v) => v),
          );
          await answer(page, row, 0);
          await saved(page);
          await page
            .getByRole("button", { name: "Check", exact: true })
            .dblclick();
          await expect(page.locator(".attempt-feedback")).toContainText(
            "incorrect",
          );
          assert.equal(
            await app.json(
              `select count(*)::int from public.question_check_attempts where item_id='${row.id}'`,
            ),
            1,
          );
          await page
            .getByRole("button", { name: "Explanation", exact: true })
            .click();
          await expect(
            page.getByText(
              book === secondBook
                ? "The second choice follows the passage."
                : "Divide by two.",
              { exact: true },
            ),
          ).toBeVisible();
          await page.getByRole("radio").nth(1).check();
          await saved(page);
          await page
            .getByRole("button", { name: "Check", exact: true })
            .click();
          await expect(page.locator(".attempt-feedback")).toContainText(
            "Correct",
          );
          await page.reload();
          await go(page, row.position);
          await expect(page.locator(".attempt-feedback")).toContainText(
            "Correct",
          );
          assert.ok(
            (await rows(session)).find((i) => i.id === row.id).solved_at,
          );
          await page
            .getByRole("button", { name: "Back to practice", exact: true })
            .click();
          await page.waitForURL(/\/books$/);
        }
        await page.goto(app.appUrl + "/question-bank");
        await page.getByRole("button", { name: "Math", exact: true }).click();
        await page
          .getByLabel("Book / source", { exact: true })
          .selectOption(app.book);
        await page.getByRole("button", { name: "Easy", exact: true }).click();
        await page
          .getByRole("button", { name: "10 questions", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Start Practice Session", exact: true })
          .click();
        await page.waitForURL(/\/practice\//);
        const bankSession = page.url().split("/").at(-1);
        assert.equal((await rows(bankSession)).length, 10);
        const row = (await rows(bankSession)).find(
          (i) => i.question.question_type === "mcq",
        );
        await answer(page, row, 1);
        await saved(page);
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.reload();
        await go(page, row.position);
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.goto(app.appUrl + "/progress");
        await expect(
          page.getByRole("heading", { name: "Progress", exact: true }),
        ).toBeVisible();
        assert.deepEqual(
          await rpc(student, "learning_metrics"),
          await rpc(admin, "learning_metrics", { p_student: student }),
        );
      },
    );

    await step(
      "5000+ broad pool reproduces legacy limit then supports 7→8 editing without rewriting completed occurrences",
      async () => {
        await app.sql(`insert into public.questions(topic_id,position,question_text,options,domain,difficulty) select '${app.topic}',100+n,'Large pool '||n,'["1","2","3","4"]','Algebra','easy' from generate_series(1,5010)n;
    insert into public.question_answers(question_id,correct_answer,explanation)select id,1,'Large pool key' from public.questions where question_text like 'Large pool %';
    update public.content_review_items set status='approved' where item_type='question' and entity_id in(select id from public.questions where question_text like 'Large pool %');analyze public.questions;analyze public.question_bank_eligibility;`);
        const config = {
          title: "Broad daily reliability",
          timezone: "Asia/Tashkent",
          startDate: await app.json(
            "select to_jsonb((now() at time zone 'Asia/Tashkent')::date::text)",
          ),
          selection: "new",
          count: 7,
          filters: {},
          students: [student],
          allowLate: true,
          allowRepeat: false,
        };
        assert.ok(
          (await app.json(
            "select count(*)::int from public.question_bank_eligibility where student_ready",
          )) > 5000,
        );
        const old = await readFile(
          "supabase/migrations/20261007000500_homework_save_pool.sql",
          "utf8",
        );
        await app.sql(old);
        const error = await rpc(
          admin,
          "save_daily_homework",
          { p_data: config },
          400,
        );
        assert.match(error.message, /at most 5000/);
        const before = await app.json(
          `select jsonb_build_object('data',data,'pool',pool) from public.daily_homework_versions where template_id='${app.daily}' order by revision desc limit 1`,
        );
        await app.sql(
          await readFile(
            "supabase/migrations/20261009000300_daily_homework_indexed_pool.sql",
            "utf8",
          ).then((s) =>
            s.slice(
              s.indexOf(
                "create or replace function public.save_daily_homework",
              ),
              s.indexOf(
                "\ncreate or replace function public.start_daily_homework",
              ),
            ),
          ),
        );
        const tid = await rpc(admin, "save_daily_homework", { p_data: config });
        const first = await rpc(student, "start_daily_homework", {
          p_template: tid,
          p_day: config.startDate,
        });
        assert.equal((await rows(first)).length, 7);
        await rpc(student, "save_practice_changes", {
          p_session: first,
          p_changes: (await rows(first)).map((i) => ({
            id: i.id,
            expected_revision: i.answer_revision,
            ...(i.question.question_type === "open"
              ? { selected_response: "8.6" }
              : { selected_answer: 1 }),
          })),
        });
        await rpc(
          student,
          "finish_book_practice",
          { p_session_id: first },
          204,
        );
        const original = await rows(first);
        const c = await context.browser().newContext();
        const teacher = await c.newPage();
        watch(teacher);
        await login(teacher, "admin");
        await teacher.goto(app.appUrl + "/admin/homework");
        await teacher
          .getByRole("row")
          .filter({ hasText: config.title })
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        const dialog = teacher.getByRole("dialog", {
          name: "Edit recurring homework assignment",
        });
        await dialog.getByLabel("Questions per day").fill("8");
        await dialog.getByLabel("Question selection").selectOption("random");
        const response = teacher.waitForResponse((r) =>
          r.url().endsWith("/rpc/save_daily_homework"),
        );
        await dialog
          .getByRole("button", { name: "Save recurring homework", exact: true })
          .click();
        assert.equal((await response).status(), 200);
        await expect(dialog).toHaveCount(0);
        const version = await app.json(
          `select to_jsonb(v) from public.daily_homework_versions v where template_id='${tid}' order by revision desc limit 1`,
        );
        assert.equal(version.data.count, 8);
        assert.ok(version.pool_count > 5000);
        assert.deepEqual(version.pool, []);
        assert.deepEqual(await rows(first), original);
        assert.deepEqual(
          await app.json(
            `select jsonb_build_object('data',data,'pool',pool) from public.daily_homework_versions where template_id='${app.daily}' order by revision asc limit 1`,
          ),
          before,
        );
        // Simulate an elapsed local day using isolated scheduling data, never the system clock.
        await app.sql(
          `update public.daily_homework_versions set valid_from='${config.startDate}' where id='${version.id}'`,
        );
        const future = await app.json(
          "select to_jsonb(((now() at time zone 'Asia/Tashkent')::date+1)::text)",
        );
        // daily_scheduled never allows opening tomorrow early: move its date to today in the fixture.
        await app.sql(
          `update public.daily_homework_instances set study_date=study_date-1 where session_id='${first}'`,
        );
        const second = await rpc(student, "start_daily_homework", {
          p_template: tid,
          p_day: config.startDate,
        });
        assert.equal((await rows(second)).length, 8);
        assert.equal(
          await rpc(student, "start_daily_homework", {
            p_template: tid,
            p_day: config.startDate,
          }),
          second,
        );
        assert.equal(
          new Set(
            [...original, ...(await rows(second))].map((i) => i.question.id),
          ).size,
          15,
        );
        assert.ok(future);
        await c.close();
        assert.equal(
          await app.json(
            app.as(
              student,
              "select count(*)::int from public.daily_homework_pool_questions",
            ),
          ),
          0,
        );
        assert.equal(
          await app.json(
            app.as(
              admin,
              `select count(*)::int from public.daily_homework_pool_questions where version_id='${version.id}'`,
            ),
          ),
          version.pool_count,
        );
      },
    );
    await step(
      "500-item practice loads and persists without oversized attempt-history requests",
      async () => {
        const session = await rpc(student, "start_bank_practice", {
          p_filters: { book: app.book },
          p_count: 500,
          p_timed: false,
        });
        const items = await rows(session);
        assert.equal(items.length, 500);
        const legacy = await fetch(
          app.apiUrl +
            "/rest/v1/question_check_attempts?select=*&item_id=in.(" +
            items.map((i) => i.id).join(",") +
            ")",
          { headers: { authorization: "Bearer " + app.tokenFor(student) } },
        );
        assert.equal(
          legacy.status,
          431,
          "Legacy 500-ID request exceeds the real gateway header limit",
        );
        const attempts = page.waitForResponse((r) =>
          new URL(r.url()).pathname.endsWith("/question_check_attempts"),
        );
        await open(page, session);
        const reply = await attempts;
        assert.equal(reply.status(), 200);
        assert.ok(reply.url().length < 1000);
        const row = items.find((i) => i.question.question_type === "mcq");
        await answer(page, row, 1);
        await saved(page);
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.reload();
        await go(page, row.position);
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        assert.ok((await rows(session)).find((i) => i.id === row.id).solved_at);
      },
    );
    assert.deepEqual(exceptions, []);
    assert.deepEqual(outside, [], "Browser requests must remain isolated");
    t.diagnostic(
      "Real PostgreSQL17/PostgREST14 and Chromium/Vite, database assertions after acknowledgements; fixture Auth/Storage transports, no production writes.",
    );
  },
);
