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
  "500-item practice restores checked answers through bounded relational attempt-history requests",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const topic = await app.json(
      `with t as(insert into public.book_topics(book_id,title)values('${app.book}','Large transport fixture')returning id)select to_jsonb(id)from t`,
    );
    await app.sql(`insert into public.questions(topic_id,question_text,options,position)select '${topic}','Large transport '||n,'["1","2","3","4"]',n from generate_series(1,500)n;
    insert into public.question_answers(question_id,correct_answer)select id,1 from public.questions where topic_id='${topic}';
    update public.content_review_items set status='approved' where item_type='question' and entity_id in(select id from public.questions where topic_id='${topic}');`);
    const r = await fetch(app.apiUrl + "/rest/v1/rpc/start_bank_practice", {
      method: "POST",
      headers: {
        authorization: "Bearer " + app.tokenFor(student),
        "Content-Type": "application/json",
        "x-satchi-client-version": "20261008",
      },
      body: JSON.stringify({
        p_filters: { topic },
        p_count: 500,
        p_timed: false,
      }),
    });
    assert.equal(r.status, 200);
    const sid = await r.json();
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${sid}'`,
    );
    assert.equal(items.length, 500);
    const legacy = await fetch(
      app.apiUrl +
        "/rest/v1/question_check_attempts?select=*&item_id=in.(" +
        items.map((i) => i.id).join(",") +
        ")",
      { headers: { authorization: "Bearer " + app.tokenFor(student) } },
    );
    assert.equal(legacy.status, 431);
    await app.sql(`update public.book_practice_items set selected_answer=0,has_answered=true where session_id='${sid}';
      insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,correct,active_seconds,between_seconds,eliminated,marked)
      select gen_random_uuid(),i.id,n,0,false,0,0,'{}',false from public.book_practice_items i cross join generate_series(1,2)n where session_id='${sid}';
      insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,correct,active_seconds,between_seconds,eliminated,marked)
      values(gen_random_uuid(),'${items[0].id}',3,0,false,0,0,'{}',false);`);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(app.appUrl + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Your SAT journey starts here.",
        exact: true,
      }),
    ).toBeVisible();
    const responses = [];
    page.on("response", (r) => {
      if (new URL(r.url()).pathname.endsWith("/question_check_attempts"))
        responses.push({ status: r.status(), length: r.url().length });
    });
    await page.goto(app.appUrl + "/practice/" + sid);
    try {
      await expect(
        page.getByRole("button", { name: "Question 1 of 500", exact: true }),
      ).toBeVisible();
    } catch (error) {
      throw new Error(
        error.message +
          "\n" +
          (await page.locator("body").innerText()) +
          "\n" +
          JSON.stringify(responses),
      );
    }
    await expect(page.locator(".attempt-feedback li")).toHaveCount(3);
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".attempt-feedback")).toContainText("Correct");
    await page.reload();
    await expect(page.locator(".attempt-feedback li")).toHaveCount(4);
    await expect(page.locator(".attempt-feedback")).toContainText("Correct");
    assert.equal(
      await app.json(
        `select to_jsonb(selected_answer) from public.book_practice_items where id='${items[0].id}'`,
      ),
      1,
    );
    assert.ok(responses.length >= 2);
    assert.ok(
      responses.every((r) => r.status === 200 && r.length < 1000),
      JSON.stringify(responses),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Question 1 of 500", exact: true })
      .click();
    const overview = page.getByRole("dialog", { name: "Question Overview" });
    await expect(overview.locator(".question-number")).toHaveCount(500);
    await overview.getByRole("button", { name: /^Question 500,/ }).click();
    await expect(
      page.getByRole("button", { name: "Question 500 of 500", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await expect
      .poll(() =>
        app.json(
          `select current_position from public.book_practice_sessions where id='${sid}'`,
        ),
      )
      .toBe(499);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Question 500 of 500", exact: true }),
    ).toBeVisible();
  },
);
