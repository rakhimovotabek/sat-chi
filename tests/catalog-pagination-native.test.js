import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";
import {
  holdSearchDebounces,
  runSearchDebounces,
} from "./browser/helpers/search-debounce.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "native catalogs retain the second page after the initial search window, for students and admins",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    await app.sql(`insert into public.books(title,published)select 'Catalog '||n,true from generate_series(1,54)n;
 insert into public.vocabulary_books(title)select 'Catalog vocabulary '||n from generate_series(1,55)n;
 insert into public.vocabulary_sets(book_id,title)select id,'Fixture set' from public.vocabulary_books;
 insert into public.vocabulary_words(set_id,word,definition)select id,'candid','Honest' from public.vocabulary_sets;
 update public.content_review_items set status='approved' where item_type='word' and entity_id in(select id from public.vocabulary_words);
 update public.vocabulary_books set published=true;`);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    for (const role of ["student", "admin"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on("response", (r) => {
        if (r.url().includes("/rest/v1/books?"))
          requests.push({
            status: r.status(),
            offset: new URL(r.url()).searchParams.get("offset"),
          });
      });
      await holdSearchDebounces(page);
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(role + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Log out", exact: true }),
      ).toBeVisible();
      await page.goto(
        app.appUrl + (role === "admin" ? "/admin/books" : "/books"),
      );
      await expect(page.locator(".book-card")).toHaveCount(50);
      await page
        .getByRole("button", { name: "Next books", exact: true })
        .click();
      await expect(page.locator(".book-card")).toHaveCount(5);
      await runSearchDebounces(page);
      await expect(page.locator(".book-card")).toHaveCount(5);
      assert.ok(
        requests.some(
          (r) => [200, 206].includes(r.status) && r.offset === "50",
        ),
        JSON.stringify(requests),
      );
      await page.goto(
        app.appUrl + (role === "admin" ? "/admin/vocabulary" : "/vocabulary"),
      );
      await expect(page.locator(".card-grid > article")).toHaveCount(50);
      await page
        .getByRole("button", { name: "Next vocabulary books", exact: true })
        .click();
      await expect(page.locator(".card-grid > article")).toHaveCount(5);
      await runSearchDebounces(page);
      await expect(page.locator(".card-grid > article")).toHaveCount(5);
      await context.close();
    }
    assert.equal(
      await app.json("select to_jsonb(count(*)) from public.books"),
      55,
    );
    assert.equal(
      await app.json("select to_jsonb(count(*)) from public.vocabulary_books"),
      55,
    );
  },
);
