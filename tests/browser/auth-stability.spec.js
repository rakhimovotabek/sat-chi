import { test, expect } from "@playwright/test";
import {
  contentFixture,
  bookId,
  topicId,
  sessionId,
} from "./helpers/content.js";

// Drive the browser visibility event through the actual Supabase SDK. Its
// listener confirms the saved session with SIGNED_IN when the tab returns.
async function returnToTab(page) {
  await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const descriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    let subscription, timeout;
    const confirmed = new Promise((resolve, reject) => {
      subscription = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") resolve();
      }).data.subscription;
      timeout = setTimeout(
        () => reject(new Error("No SDK tab-return auth event")),
        5000,
      );
    });
    try {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      window.dispatchEvent(new Event("blur"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      window.dispatchEvent(new Event("focus"));
      await confirmed;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    } finally {
      clearTimeout(timeout);
      subscription.unsubscribe();
      if (descriptor)
        Object.defineProperty(document, "visibilityState", descriptor);
      else delete document.visibilityState;
    }
  });
}
async function rememberDocument(page, selector) {
  return page.evaluate((selector) => {
    window.__stableDocument = {
      element: document.querySelector(selector),
      origin: performance.timeOrigin,
    };
    return performance.timeOrigin;
  }, selector);
}
async function expectSameDocument(page, origin) {
  expect(
    await page.evaluate(() => ({
      origin: performance.timeOrigin,
      connected: window.__stableDocument?.element?.isConnected,
    })),
  ).toEqual({ origin, connected: true });
}
const reads = (store, suffix) =>
  store.requests.filter((r) => r.method === "GET" && r.path.endsWith(suffix))
    .length;

for (const role of ["student", "admin"]) {
  test(`${role} route stays mounted through visibility/focus changes without profile refetches`, async ({
    page,
  }) => {
    const store = await contentFixture(page, role);
    const path = role === "admin" ? "/admin/books" : "/books";
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Books", exact: true }),
    ).toBeVisible();
    const origin = await rememberDocument(page, "main h1");
    const before = reads(store, "/profiles");
    for (let i = 0; i < 3; i++) await returnToTab(page);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expectSameDocument(page, origin);
    expect(reads(store, "/profiles")).toBe(before);
    // StrictMode's temporary subscription has been cleaned up; tab returns
    // must not accumulate additional provider auth subscriptions. The SDK
    // also owns one subscription for its Realtime token synchronization.
    expect(
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.js");
        return supabase.auth.stateChangeEmitters.size;
      }),
    ).toBe(2);
  });
}

test("active practice retains question, answer, elimination, mark and overview through tab return and silent token refresh", async ({
  page,
}) => {
  const store = await contentFixture(page);
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page.getByRole("button", { name: "Eliminate choice A" }).click();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page
    .getByText("Question overview · 3 questions", { exact: true })
    .click();
  const origin = await rememberDocument(page, ".question-player");
  const beforeProfiles = reads(store, "/profiles"),
    beforePractice = reads(store, "/book_practice_items");
  await returnToTab(page);
  const refreshError = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const { error } = await supabase.auth.refreshSession();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return error?.message || null;
  });
  expect(refreshError).toBeNull();
  await returnToTab(page);
  await expect(page).toHaveURL(new RegExp(`/practice/${sessionId}$`));
  await expectSameDocument(page, origin);
  await expect(
    page.getByText("Question 2 of 3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "A 2", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Marked for review" }),
  ).toBeVisible();
  await expect(page.locator(".question-overview")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", { name: /Question 2, .*current/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(reads(store, "/profiles")).toBe(beforeProfiles);
  expect(reads(store, "/book_practice_items")).toBe(beforePractice);
  expect(
    store.requests.some(
      (r) => r.path.endsWith("/auth/v1/token") && r.body?.refresh_token,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Log out", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/practice/${sessionId}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("expired session with rejected refresh token leaves protected routes safely", async ({
  page,
}) => {
  await contentFixture(page);
  await page.goto("/books");
  await expect(
    page.getByRole("heading", { name: "Books", exact: true }),
  ).toBeVisible();
  await page.route("**/auth/v1/token?grant_type=refresh_token", (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        code: "refresh_token_not_found",
        error_code: "refresh_token_not_found",
        msg: "Invalid Refresh Token: Refresh Token Not Found",
      }),
    });
  });
  const errorCode = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.js");
    const key = supabase.auth.storageKey;
    const expired = JSON.parse(localStorage.getItem(key));
    expired.expires_at = Math.floor(Date.now() / 1000) - 60;
    const payload = JSON.parse(
      atob(
        expired.access_token
          .split(".")[1]
          .replaceAll("-", "+")
          .replaceAll("_", "/"),
      ),
    );
    payload.exp = expired.expires_at;
    const encode = (value) =>
      btoa(JSON.stringify(value))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
    expired.access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.test`;
    localStorage.setItem(key, JSON.stringify(expired));
    const { error } = await supabase.auth.refreshSession();
    return error?.code;
  });
  expect(errorCode).toBe("refresh_token_not_found");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeVisible();
});
