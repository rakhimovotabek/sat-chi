import { test, expect } from "@playwright/test";
const id = "a0000000-0000-0000-0000-000000000002";
async function fixture(
  page,
  { role = "student", complete = true, active = true, missing = false } = {},
) {
  let profile = {
    id,
    role,
    active,
    display_name: "Test Learner",
    grade: "11",
    target_sat_score: 1450,
    main_goal: "Improve Both",
    onboarding_completed: complete,
  };
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "learner@example.test",
    user_metadata: { display_name: "Test Learner" },
    app_metadata: { provider: "email" },
    created_at: "2026-10-03T00:00:00Z",
  };
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = {
    access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/settings")
      return json({ external: { google: true } });
    if (url.pathname === "/auth/v1/token") return json(session);
    if (url.pathname === "/auth/v1/signup") {
      expect(req.postDataJSON().data.role).toBeUndefined();
      expect(url.searchParams.get("redirect_to")).toBe(
        `${new URL(page.url()).origin}/login`,
      );
      return json({ user, session: null });
    }
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/user") return json(user);
    if (["/rest/v1/books", "/rest/v1/book_topics"].includes(url.pathname))
      return json([]);
    if (url.pathname === "/rest/v1/profiles")
      return json(missing ? [] : [profile]);
    if (url.pathname === "/rest/v1/rpc/complete_onboarding") {
      const body = req.postDataJSON().payload;
      expect(body.role).toBeUndefined();
      profile = { ...profile, ...body, onboarding_completed: true };
      return json(profile);
    }
    return json({ message: "Unsupported test request" }, 400);
  });
  return { session, user };
}
async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("learner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
}
test("public landing, working navigation, signup validation and confirmation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Prepare smarter/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Sign In", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/login$/);
  await page.getByRole("link", { name: "Sign Up", exact: true }).click();
  await expect(page).toHaveURL(/signup$/);
  await page.getByLabel("Full name", { exact: true }).fill("Test Learner");
  await page.getByLabel("Target SAT score").fill("1450");
  await page.getByLabel("Grade / year").fill("11");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await page.getByLabel(/^Password/).fill("test-password-123");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  await page.getByLabel("Confirm password").fill("test-password-123");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
});
test("email confirmation lands on login without creating a session", async ({
  page,
}) => {
  await fixture(page);
  let tokenExchanges = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/auth/v1/token") tokenExchanges++;
  });
  await page.goto("/login?code=confirmed-email-code");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("status")).toHaveText(
    "Email verified successfully. You can now sign in.",
  );
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeVisible();
  expect(tokenExchanges).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill("learner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("expired email confirmation shows a safe login error", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(
    "/login#error=access_denied&error_code=otp_expired&error_description=private-details",
  );
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await expect(page.getByRole("alert")).not.toContainText("private-details");
  await expect(
    page.getByRole("button", { name: "Sign In", exact: true }),
  ).toBeVisible();
});
test("student session refresh, all routes, admin guard, responsive menu, logout", async ({
  page,
}) => {
  await fixture(page);
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const route of [
    "homework",
    "books",
    "question-bank",
    "vocabulary",
    "progress",
    "standings",
    "profile",
  ]) {
    await page.locator(`.sidebar a[href="/${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(page.locator("h1")).toHaveText(
      {
        homework: "Homework",
        books: "Books",
        "question-bank": "Question Bank",
        vocabulary: "Vocabulary",
        progress: "Progress",
        standings: "Standings",
        profile: "Your learning profile",
      }[route],
    );
  }
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.locator(".account-summary")).toContainText("student");
  await page.goto("/student/books");
  await expect(page).toHaveURL(/\/books$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  await page.getByRole("link", { name: "Homework", exact: true }).click();
  await expect(page.locator("#workspace-sidebar")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test("first login onboarding persists required fields and does not repeat", async ({
  page,
}) => {
  await fixture(page, { complete: false });
  await login(page);
  await expect(page).toHaveURL(/onboarding$/);
  await page.getByLabel("Main goal").selectOption("Improve Math");
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("admin has distinct navigation and all admin routes render", async ({
  page,
}) => {
  await fixture(page, { role: "admin" });
  await login(page);
  await expect(page).toHaveURL(/admin\/dashboard$/);
  await page.goto("/");
  await expect(page).toHaveURL(/admin\/dashboard$/);
  await expect(page.locator(".brand-caption")).toHaveText(
    "Admin Control Panel",
  );
  await expect(
    page.locator('.sidebar-nav a[href="/admin/questions"]'),
  ).toHaveCount(0);
  await page.goto("/admin/questions");
  await expect(
    page.getByRole("heading", { name: "Questions", exact: true }),
  ).toBeVisible();
  for (const route of [
    "students",
    "groups",
    "books",
    "question-bank",
    "homework",
    "vocabulary",
    "results",
    "settings",
  ]) {
    await page.locator(`.sidebar-nav a[href="/admin/${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${route}$`));
    await expect(page.locator("h1")).toHaveText(
      {
        students: "Students",
        groups: "Groups",
        books: "Books",
        "question-bank": "Question Bank",
        homework: "Homework",
        vocabulary: "Vocabulary",
        results: "Results / Analytics",
        settings: "Settings",
      }[route],
    );
  }
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/admin\/dashboard$/);
});
for (const options of [{ active: false }, { missing: true }])
  test(`fails closed for ${options.active === false ? "inactive" : "missing"} profile`, async ({
    page,
  }) => {
    await fixture(page, options);
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Account unavailable" }),
    ).toBeVisible();
  });
test("invalid callback and network sign-in errors have recoverable states", async ({
  page,
}) => {
  await page.goto("/auth/callback?error=access_denied");
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await page.goto("/login");
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error_code: "invalid_credentials",
        msg: "secret internal message",
      }),
    }),
  );
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("bad-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check your email and password",
  );
  await expect(page.getByRole("alert")).not.toContainText("secret internal");
});
test("Google PKCE callback leads a first-time student to onboarding", async ({
  page,
}) => {
  await fixture(page, { complete: false });
  await page.route("http://127.0.0.1:54321/auth/v1/authorize**", (route) =>
    route.fulfill({
      status: 302,
      headers: {
        Location: "http://127.0.0.1:5199/auth/callback?code=test-oauth-code",
      },
    }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/onboarding$/);
  await expect(
    page.getByRole("heading", { name: /shape your SAT journey/ }),
  ).toBeVisible();
});

test("public mobile landing stays within viewport and signup button works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Prepare smarter/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/satchi-landing-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Sign Up", exact: true }).click();
  await expect(page).toHaveURL(/signup$/);
});
test("unconfigured Google provider stays in the app with email fallback", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/auth/v1/settings", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ external: { google: false } }),
    }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("alert")).toContainText("use email");
  await expect(page).toHaveURL(/login$/);
});
