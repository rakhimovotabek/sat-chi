import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "Read in Context reaches all supplied passages beyond the first API page",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const book = await app.json(
      "with b as(insert into public.vocabulary_books(title,published)values('Context pagination fixture',false)returning id)select to_jsonb(id)from b",
    );
    const set = await app.json(
      `with s as(insert into public.vocabulary_sets(book_id,title)values('${book}','Context set')returning id)select to_jsonb(id)from s`,
    );
    await app.sql(`insert into public.vocabulary_words(set_id,word,definition)values('${set}','candid','Honest');
    insert into public.vocabulary_passages(set_id,title,passage)select '${set}','Source passage '||n,'Be candid in supplied context number '||n from generate_series(1,11)n;
    update public.content_review_items set status='approved' where item_type in('word','passage') and entity_id in(select id from public.vocabulary_words where set_id='${set}' union all select id from public.vocabulary_passages where set_id='${set}');
    update public.vocabulary_books set published=true where id='${book}';`);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
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
    const requests = [];
    page.on("response", (r) => {
      if (new URL(r.url()).pathname.endsWith("/vocabulary_passages"))
        requests.push({
          status: r.status(),
          offset: new URL(r.url()).searchParams.get("offset"),
        });
    });
    await page.goto(app.appUrl + `/vocabulary/study?sets=${set}&mode=context`);
    await expect(page.locator(".context-passage")).toHaveCount(11);
    await expect(
      page.getByRole("heading", { name: "Source passage 11", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator(".context-passage")).toHaveCount(11);
    assert.ok(
      requests.some((r) => r.offset === "10" && r.status === 200),
      JSON.stringify(requests),
    );
    assert.ok(requests.every((r) => r.status === 200));
  },
);
