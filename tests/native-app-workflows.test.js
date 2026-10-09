import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "real Vite/PostgREST: reproduce missing schema, upgrade isolated DB, recover answers and edit recurring pools",
  { skip: !enabled, timeout: 240000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const studentContext = await browser.newContext(),
      adminContext = await browser.newContext();
    const page = await studentContext.newPage(),
      teacher = await adminContext.newPage();
    page.setDefaultTimeout(15000);
    teacher.setDefaultTimeout(15000);
    const failures = [],
      exceptions = [],
      outside = [],
      consoleErrors = [],
      requestsFailed = [];

    let upgraded = false;
    for (const tab of [page, teacher]) {
      tab.on("pageerror", (e) => exceptions.push(e.message));
      tab.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      tab.on("requestfailed", (r) =>
        requestsFailed.push({
          path: new URL(r.url()).pathname,
          error: r.failure()?.errorText,
        }),
      );
      tab.on("request", (req) => {
        if (
          !req.url().startsWith("http://127.0.0.1:") &&
          !req.url().startsWith("data:")
        )
          outside.push(req.url());
      });
      tab.on("response", (res) => {
        if (res.status() >= 400)
          failures.push({
            path: new URL(res.url()).pathname,
            status: res.status(),
            upgraded,
          });
      });
      tab.on("dialog", (dialog) => dialog.accept());
    }
    const login = async (tab, email) => {
      await tab.goto(app.appUrl + "/login");
      await tab
        .getByLabel("Email", { exact: true })
        .fill(email + "@fixture.invalid");
      await tab
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await tab.getByRole("button", { name: "Sign In", exact: true }).click();
      try {
        await tab.waitForURL(/\/(?:dashboard|admin|home|books)/, {
          timeout: 10000,
        });
        await expect(
          tab.getByRole("heading", {
            name:
              email === "admin"
                ? "Admin Dashboard"
                : "Your SAT journey starts here.",
            exact: true,
          }),
        ).toBeVisible();
      } catch (e) {
        throw new Error(
          e.message +
            "\n" +
            (await tab.locator("body").innerText()) +
            "\n" +
            JSON.stringify({
              failures,
              exceptions,
              consoleErrors,
              requestsFailed,
            }),
        );
      }
    };
    await login(page, "student");
    await login(teacher, "admin");
    const dialog = teacher.getByRole("dialog", {
      name: "Edit recurring homework assignment",
    });
    const editDaily = async () => {
      await teacher.goto(app.appUrl + "/admin/homework", {
        waitUntil: "domcontentloaded",
      });
      try {
        await teacher
          .getByRole("row")
          .filter({ hasText: "Daily fixture" })
          .getByRole("button", { name: "Edit", exact: true })
          .click();
      } catch (e) {
        throw new Error(
          e.message +
            "\n" +
            (await teacher.locator("body").innerText()) +
            "\n" +
            JSON.stringify({
              failures,
              exceptions,
              consoleErrors,
              requestsFailed,
            }),
        );
      }
      await expect(dialog).toBeVisible();
    };

    await t.test(
      "hosted-equivalent schema reproduces missing save RPC, denied snapshot image and incompatible assignment filter",
      async () => {
        await page.goto(app.appUrl + "/practice/" + app.session);
        try {
          await expect(
            page.getByText(/Reference image could not load/),
          ).toBeVisible();
        } catch (e) {
          throw new Error(
            e.message +
              "\n" +
              (await page.locator("body").innerText()) +
              "\n" +
              JSON.stringify({
                failures,
                exceptions,
                consoleErrors,
                requestsFailed,
              }),
          );
        }
        await expect(
          page.getByRole("button", { name: "Submit homework", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Check", exact: true }),
        ).toHaveCount(0);
        await page.getByRole("radio").nth(1).check();
        await expect(
          page.getByText(/Saving is unavailable on this server/),
        ).toBeVisible();
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        await expect(
          page.getByText(/Saving is unavailable on this server/),
        ).toBeVisible();
        await editDaily();
        await expect(
          dialog.getByText(
            /Homework question selection requires a server update/,
          ),
        ).toBeVisible();
        await dialog.getByLabel("Questions per day").fill("10");
        await expect(
          dialog.getByText(
            /Select at least 10 questions for the daily pool \(7 selected\)/,
          ),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", {
            name: "Save recurring homework",
            exact: true,
          }),
        ).toBeDisabled();
        assert.ok(
          failures.some(
            (f) => f.path.endsWith("save_practice_changes") && f.status === 404,
          ),
        );
        assert.ok(
          failures.some(
            (f) => f.path.includes("object/sign") && f.status === 403,
          ),
        );
        assert.ok(
          failures.some(
            (f) => f.path.endsWith("question_bank") && f.status === 400,
          ),
        );
      },
    );

    await app.upgrade();
    upgraded = true;
    await t.test(
      "acknowledged MCQ save survives refresh and logout/login; frozen homework image loads without approving source",
      async () => {
        await page
          .getByRole("button", { name: "Retry saving", exact: true })
          .click();
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Retry image", exact: true })
          .click();
        await expect(page.locator(".stimulus-panel img")).toBeVisible();
        const saved = await app.json(
          `select jsonb_agg(jsonb_build_object('question',question->>'id','answer',selected_answer) order by position) from public.book_practice_items where session_id='${app.session}';`,
        );
        assert.equal(saved.find((i) => i.question === app.ids[0]).answer, 1);
        assert.equal(
          await app.json(
            `select to_jsonb(public.book_package_question_ready('${app.ids[0]}'));`,
          ),
          false,
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await page.waitForURL(/\/login$/, { waitUntil: "domcontentloaded" });
        await login(page, "student");
        await page
          .getByRole("link", { name: "Homework", exact: true })
          .first()
          .click();
        await page
          .locator("article")
          .filter({ hasText: "SATakror frozen homework" })
          .getByRole("button", { name: "Resume homework", exact: true })
          .click();
        try {
          await expect(page.getByRole("radio").nth(1)).toBeChecked({
            timeout: 10000,
          });
        } catch (e) {
          throw new Error(
            e.message +
              "\n" +
              (await page.locator("body").innerText()) +
              "\n" +
              JSON.stringify({
                failures,
                exceptions,
                consoleErrors,
                requestsFailed,
              }),
          );
        }
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        const denied = await app.json(
          app.as(
            student,
            `select coalesce(jsonb_agg(o.name),'[]') from storage.objects o where name='${app.path}';`,
          ),
        );
        assert.deepEqual(denied, [app.path]);
      },
    );

    await t.test(
      "compatible assignment picker saves a larger pool and saves again after lowering daily count",
      async () => {
        await editDaily();
        await expect(
          dialog.locator(".question-picker input[type=checkbox]").first(),
        ).toBeVisible();
        await dialog.getByLabel("Questions per day").fill("10");
        await expect(dialog.getByText(/7 selected ·/)).toBeVisible();
        await expect(
          dialog.getByText(/Select at least 10 questions/),
        ).toBeVisible();
        await dialog
          .getByLabel("Book / source", { exact: true })
          .selectOption(app.book);
        await dialog.getByLabel("Topic").selectOption(app.topic);
        await expect(
          dialog.locator(".question-picker input[type=checkbox]").first(),
        ).toBeVisible();
        for (let n = 0; n < 3; n++)
          await dialog
            .locator(".question-picker input[type=checkbox]:not(:checked)")
            .first()
            .check();
        await expect(dialog.getByText(/10 selected ·/)).toBeVisible();
        await dialog
          .getByRole("button", { name: "Save recurring homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        let data = await app.json(
          `select data from public.daily_homework_versions where template_id='${app.daily}' order by revision desc limit 1;`,
        );
        assert.equal(data.count, 10);
        assert.equal(data.questionIds.length, 10);
        await editDaily();
        await dialog.getByLabel("Questions per day").fill("11");
        await expect(
          dialog.getByText(
            /Select at least 11 questions for the daily pool \(10 selected\)/,
          ),
        ).toBeVisible();
        await dialog.getByLabel("Questions per day").fill("7");
        await dialog
          .getByRole("button", { name: "Save recurring homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        data = await app.json(
          `select data from public.daily_homework_versions where template_id='${app.daily}' order by revision desc limit 1;`,
        );
        assert.equal(data.count, 7);
        assert.equal(data.questionIds.length, 10);
        await editDaily();
        await expect(dialog.getByLabel("Questions per day")).toHaveValue("7");
      },
    );

    await t.test(
      "real Book Practice offers Check, persists wrong/correct attempts and retrieves explanation",
      async () => {
        await page.goto(app.appUrl + `/books/${app.book}/topics/${app.topic}`, {
          waitUntil: "domcontentloaded",
        });
        try {
          await page
            .getByRole("button", { name: "Start topic practice", exact: true })
            .click();
        } catch (e) {
          throw new Error(
            e.message +
              "\n" +
              (await page.locator("body").innerText()) +
              "\n" +
              JSON.stringify({
                failures,
                exceptions,
                consoleErrors,
                requestsFailed,
              }),
          );
        }
        await page.waitForURL(/\/practice\//);
        await expect(
          page.getByRole("button", { name: "Check", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Submit practice", exact: true }),
        ).toHaveCount(0);
        await page.getByRole("radio").nth(0).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(
          page.getByText("That answer is incorrect. Try another choice.", {
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Explanation", exact: true })
          .click();
        await expect(
          page.getByText("Divide by two.", { exact: true }),
        ).toBeVisible();
        await page.getByRole("radio").nth(1).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: /Question \d+ of/ }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: /^Question 1,/ })
          .click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        assert.equal(
          await app.json(
            `select count(*)::int from public.question_check_attempts a join public.book_practice_items i on i.id=a.item_id join public.book_practice_sessions s on s.id=i.session_id where s.student_id='${student}';`,
          ),
          2,
        );
      },
    );
    await t.test(
      "open-response and image-choice answers persist, including offline retry and session recovery",
      async () => {
        const sid = page.url().split("/").at(-1);
        const gotoQuestion = async (id) => {
          const position = await app.json(
            `select position from public.book_practice_items where session_id='${sid}' and question->>'id'='${id}';`,
          );
          await page.getByRole("button", { name: /Question \d+ of/ }).click();
          await page
            .getByRole("dialog")
            .getByRole("button", {
              name: new RegExp(`^Question ${position + 1},`),
            })
            .click();
        };
        await gotoQuestion(app.ids[15]);
        await page.getByLabel("Your answer", { exact: true }).fill("8.6");
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        assert.equal(
          await app.json(
            `select to_jsonb(selected_response) from public.book_practice_items where session_id='${sid}' and question->>'id'='${app.ids[15]}';`,
          ),
          "8.6",
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await gotoQuestion(app.ids[15]);
        await expect(
          page.getByLabel("Your answer", { exact: true }),
        ).toHaveValue("8.6");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await gotoQuestion(app.ids[14]);
        await expect(page.locator(".answer-choice img")).toHaveCount(4);
        await expect
          .poll(() =>
            page
              .locator(".answer-choice img")
              .evaluateAll((images) =>
                images.every(
                  (image) => image.complete && image.naturalWidth > 0,
                ),
              ),
          )
          .toBe(true);
        await studentContext.setOffline(true);
        await page.getByRole("radio").nth(1).check();
        await expect(
          page.getByText("Save failed", { exact: true }),
        ).toBeVisible();
        assert.equal(
          await app.json(
            `select coalesce(to_jsonb(selected_answer),'null') from public.book_practice_items where session_id='${sid}' and question->>'id'='${app.ids[14]}';`,
          ),
          null,
        );
        await studentContext.setOffline(false);
        await page
          .getByRole("button", { name: "Retry saving", exact: true })
          .click();
        await expect(
          page.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
        assert.equal(
          await app.json(
            `select to_jsonb(selected_answer) from public.book_practice_items where session_id='${sid}' and question->>'id'='${app.ids[14]}';`,
          ),
          1,
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await gotoQuestion(app.ids[14]);
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
      },
    );

    await t.test(
      "Storage RLS denies strangers and withdrawn attempts; completed homework image history stays readable",
      async () => {
        const other = "f1000000-0000-0000-0000-000000000003";
        await app.sql(
          `insert into auth.users(id,email)values('${other}','other@fixture.invalid');`,
        );
        const visible = (uid) =>
          app.json(
            app.as(
              uid,
              `select coalesce(jsonb_agg(name),'[]') from storage.objects where name='${app.path}';`,
            ),
          );
        assert.deepEqual(await visible(other), []);
        assert.deepEqual(await visible(student), [app.path]);
        const explanationPath = "f".repeat(64) + "/" + "d".repeat(64) + ".png";
        await app.sql(
          `insert into public.book_package_assets(path,book_id,question_id,kind,source_path,sha256)values('${explanationPath}','${app.book}','${app.ids[2]}','explanation','fixture.png','${"d".repeat(64)}');insert into storage.objects(bucket_id,name)values('book-package-assets','${explanationPath}');`,
        );
        assert.deepEqual(
          await app.json(
            app.as(
              student,
              `select coalesce(jsonb_agg(name),'[]') from storage.objects where name='${explanationPath}';`,
            ),
          ),
          [],
        );
        await app.sql(
          `update public.homework_assignments set active=false where id='${app.assignment}';`,
        );
        assert.deepEqual(await visible(student), []);
        await assert.rejects(
          app.sql(
            app.as(
              student,
              `select public.save_practice_changes('${app.session}','[]');`,
            ),
          ),
          /unavailable|own|permission|access/i,
        );
        await app.sql(
          `update public.homework_assignments set active=true where id='${app.assignment}';`,
        );
        await app.sql(
          app.as(
            student,
            `select public.finish_book_practice('${app.session}');`,
          ),
        );
        await app.sql(
          `update public.homework_assignments set active=false where id='${app.assignment}';`,
        );
        assert.deepEqual(await visible(student), [app.path]);
        assert.equal(
          await app.json(
            `select to_jsonb(selected_answer) from book_practice_items where session_id='${app.session}' and question->>'id'='${app.ids[0]}';`,
          ),
          1,
        );
      },
    );
    assert.deepEqual(exceptions, [], "No frontend exceptions");
    assert.deepEqual(
      outside,
      [],
      "All browser requests stay in the isolated environment",
    );
    assert.deepEqual(
      requestsFailed.filter(
        (r) =>
          r.error !== "net::ERR_ABORTED" &&
          !(
            r.path.endsWith("save_practice_changes") &&
            r.error === "net::ERR_INTERNET_DISCONNECTED"
          ),
      ),
      [],
      "Only intentional offline save requests may fail",
    );
    assert.equal(
      consoleErrors.some((e) => e.includes("ERR_INSUFFICIENT_RESOURCES")),
      false,
      "No browser resource exhaustion",
    );
    assert.deepEqual(
      failures.filter((f) => f.upgraded),
      [],
      "No unexpected HTTP errors after isolated migration",
    );
    t.diagnostic(
      "Actual PostgreSQL, PostgREST and Vite; Auth/Storage transport uses disposable local fixture services. All disposable data removed at teardown.",
    );
  },
);
