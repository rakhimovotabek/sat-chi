import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  validateProfile,
  needsOnboarding,
  profileValues,
} from "../src/auth/profile-fields.js";
const good = {
  display_name: "Student",
  current_sat_score: "",
  target_sat_score: 1450,
  grade: "11",
  main_goal: "Improve Both",
  target_test_date: "",
};
test("profile validation allows an unknown current score and rejects invalid SAT targets", () => {
  assert.equal(validateProfile(good), null);
  for (const target_sat_score of [0, 399, 1405, 1601, "oops"])
    assert.ok(validateProfile({ ...good, target_sat_score }));
  assert.ok(validateProfile({ ...good, grade: "" }));
  assert.equal(
    needsOnboarding({ ...good, role: "student", onboarding_completed: true }),
    false,
  );
  assert.equal(
    needsOnboarding({ ...good, role: "student", onboarding_completed: false }),
    true,
  );
  assert.equal(needsOnboarding({ role: "admin" }), false);
});
test("actual PostgreSQL migrations preserve RLS and restrict onboarding writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated,service_role;`,
    );
    for (const file of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec(await readFile("supabase/tests/security.sql", "utf8"));
    const id = "b0000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users(id,raw_user_meta_data) values('${id}','{"role":"admin","full_name":"Google Student"}'); set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
    );
    const run = (body) =>
      db.query("select (public.complete_onboarding($1::jsonb)).*", [
        JSON.stringify(body),
      ]);
    const payload = { ...good, current_sat_score: null };
    const result = await run(payload);
    assert.equal(result.rows[0].role, "student");
    assert.equal(result.rows[0].onboarding_completed, true);
    assert.equal(result.rows[0].target_sat_score, 1450);
    for (const forbidden of ["role", "active", "id", "onboarding_completed"])
      await assert.rejects(run({ ...payload, [forbidden]: "admin" }));
    await assert.rejects(
      db.exec("update public.profiles set target_sat_score=1600"),
    );
    await assert.rejects(db.exec("update public.profiles set active=false"));
    await assert.rejects(run({ ...payload, target_sat_score: 1405 }));
    await db.exec(
      "reset role; update public.profiles set active=false; set role authenticated;",
    );
    await assert.rejects(run(payload));
  } finally {
    await db.close();
  }
});

test("signup draft survives null database fields and malformed metadata cannot break the form", () => {
  const draft = {
    display_name: "Student",
    target_sat_score: 1450,
    grade: "11",
  };
  assert.equal(
    profileValues({ target_sat_score: null }, { onboarding: draft })
      .target_sat_score,
    1450,
  );
  const malformed = profileValues(
    {},
    {
      full_name: { unexpected: true },
      onboarding: { grade: [], target_sat_score: {} },
    },
  );
  assert.equal(malformed.display_name, "");
  assert.equal(malformed.grade, "");
  assert.equal(malformed.target_sat_score, "");
});
