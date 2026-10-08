import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nativeAppEnvironment,
  admin,
} from "./helpers/native-app-environment.js";

test(
  "PostgreSQL17 Storage policy probe is scoped, reversible, and cannot freeze privileged writers",
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
    const prefix =
      "_release-verification/00000000-0000-4000-8000-000000000001/";
    const probe = "satchi_probe_fixture";
    const fixture = `set local role authenticated;set local request.jwt.claims='{"role":"authenticated","sub":"${admin}"}';`;
    await app.sql(
      "grant usage on schema storage to service_role;grant select,insert,update,delete on storage.objects to service_role;",
    );
    await app.sql(
      `insert into storage.objects(bucket_id,name)values('question-assets','${prefix}existing.webp');`,
    );
    await app.sql(
      `begin;${fixture}insert into storage.objects(bucket_id,name)values('question-assets','${prefix}before.webp');commit;`,
    );
    const existing = await app.json(
      "select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='storage'",
    );
    await app.sql(
      (await readFile("scripts/release/storage-policy-probe.sql", "utf8"))
        .replaceAll("PROBE_POLICY", probe)
        .replaceAll("PROBE_PREFIX", prefix),
    );
    await t.test(
      "authenticated insert blocked while unrelated prefixes retain their permissions",
      async () => {
        await assert.rejects(
          app.sql(
            `begin;${fixture}insert into storage.objects(bucket_id,name)values('question-assets','${prefix}blocked.webp');commit;`,
          ),
        );
        await app.sql(
          `begin;${fixture}insert into storage.objects(bucket_id,name)values('question-assets','unrelated-safe-fixture.webp');commit;`,
        );
      },
    );
    await t.test(
      "update and delete leave frozen fixture unchanged",
      async () => {
        await app.sql(
          `begin;${fixture}update storage.objects set name='changed.webp' where name='${prefix}existing.webp';delete from storage.objects where name='${prefix}existing.webp';commit;`,
        );
        assert.equal(
          await app.json(
            `select to_jsonb(count(*)) from storage.objects where name='${prefix}existing.webp'`,
          ),
          1,
        );
      },
    );
    await t.test(
      "BYPASSRLS connection still writes during restriction",
      async () => {
        await app.sql(
          `begin;set local role service_role;insert into storage.objects(bucket_id,name)values('question-assets','${prefix}privileged.webp');commit;`,
        );
        assert.equal(
          await app.json(
            `select to_jsonb(count(*)) from storage.objects where name='${prefix}privileged.webp'`,
          ),
          1,
        );
      },
    );
    await t.test(
      "removing only the probe policies restores admission and exact original policy definitions",
      async () => {
        await app.sql(
          `begin;drop policy ${probe}_insert on storage.objects;drop policy ${probe}_update on storage.objects;drop policy ${probe}_delete on storage.objects;commit;`,
        );
        assert.deepEqual(
          await app.json(
            "select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='storage'",
          ),
          existing,
        );
        await app.sql(
          `begin;${fixture}insert into storage.objects(bucket_id,name)values('question-assets','${prefix}reopened.webp');commit;`,
        );
      },
    );
  },
);
