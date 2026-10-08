// Authentication is simulated; all application REST reads and RPCs execute real
// migrated PostgreSQL/PGlite with authenticated roles and RLS, never canned data.
import { expect } from "@playwright/test";
export function databaseQueue(fixture) {
  let pending = Promise.resolve();
  return (id, operation) => {
    const result = pending.then(async () => {
      await fixture.role(id);
      return operation();
    });
    pending = result.catch(() => {});
    return result;
  };
}
export async function loginDatabase(
  page,
  uid,
  roleName,
  db,
  run,
  existingSession = false,
) {
  if (roleName === "student")
    await run(uid, async () => {
      const profile = (
        await db.query("select * from public.profiles where id=$1", [uid])
      ).rows[0];
      await db.query("select public.complete_onboarding($1::jsonb)", [
        JSON.stringify({
          display_name: profile.display_name,
          current_sat_score: 1000,
          target_sat_score: 1450,
          grade: "11",
          main_goal: "Improve Math",
          target_test_date: null,
        }),
      ]);
    });
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: `${roleName}@example.test`,
    user_metadata: {},
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
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
      "Access-Control-Expose-Headers": "content-range",
    };
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/token") return json(session);
    if (url.pathname === "/auth/v1/user") return json(user);
    try {
      const result = await run(uid, async () => {
        const name = url.pathname.split("/").pop();
        if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid route");
        if (url.pathname.includes("/rpc/")) {
          const body = req.postDataJSON() || {};
          const names = Object.keys(body);
          if (names.some((n) => !/^p_[a-z_]+$/.test(n)))
            throw new Error("Invalid argument");
          const setReturning = (
            await db.query(
              "select proretset from pg_proc where pronamespace='public'::regnamespace and proname=$1",
              [name],
            )
          ).rows[0]?.proretset;
          const sql = `${setReturning ? "select * from" : "select"} public.${name}(${names.map((n, i) => `${n} => $${i + 1}`).join(",")})${setReturning ? "" : " result"}`;
          const rows = (
            await db.query(
              sql,
              names.map((n) =>
                typeof body[n] === "object" && body[n] !== null
                  ? JSON.stringify(body[n])
                  : body[n],
              ),
            )
          ).rows;
          return setReturning ? rows : rows[0].result;
        }
        if (req.method() !== "GET")
          throw new Error("Only RPC mutations supported");
        const allowed = [
          "profiles",
          "groups",
          "books",
          "book_topics",
          "book_practice_sessions",
          "book_practice_items",
          "question_check_attempts",
          "study_preferences",
        ];
        if (!allowed.includes(name))
          throw new Error(`Unexpected table ${name}`);
        const args = [],
          where = [];
        for (const [key, value] of url.searchParams) {
          if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid column");
          if (value.startsWith("eq.")) {
            args.push(value.slice(3));
            where.push(`${key}=$${args.length}`);
          }
          if (value.startsWith("ilike.")) {
            args.push(value.slice(6));
            where.push(`${key} ilike $${args.length}`);
          }
        }
        const order = url.searchParams.get("order");
        if (
          order &&
          !/^[a-z_]+\.(asc|desc)(,[a-z_]+\.(asc|desc))*$/.test(order)
        )
          throw new Error("Unsupported order");
        const rows = (
          await db.query(
            `select * from public.${name}${where.length ? " where " + where.join(" and ") : ""}${order ? " order by " + order.replaceAll(".", " ") : ""}`,
            args,
          )
        ).rows;
        headers["content-range"] =
          `0-${Math.max(0, rows.length - 1)}/${rows.length}`;
        if (req.headers().accept?.includes("vnd.pgrst.object")) {
          if (rows.length !== 1) throw new Error("Requested row unavailable");
          return rows[0];
        }
        return rows;
      });
      return json(result);
    } catch (error) {
      return json(
        { message: error.message, code: error.code || "TEST_ADAPTER" },
        400,
      );
    }
  });
  if (existingSession) {
    await page.goto(roleName === "admin" ? "/admin/dashboard" : "/dashboard");
    await expect(
      page.getByRole("button", { name: "Log out", exact: true }),
    ).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("disposable-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(
    roleName === "admin" ? /admin\/dashboard$/ : /\/dashboard$/,
  );
}
