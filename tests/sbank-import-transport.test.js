import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectPackage } from "../supabase/functions/_shared/universal-package.js";
import { createImportHandler } from "../supabase/functions/import-book/handler.js";
for (const tamper of [false, true])
  test(`bounded import transport verifies stored bytes before checkpoint (tamper=${tamper})`, async () => {
    const bytes = await readFile(
        "assets/examples/satchi-book-v1/original-practice.zip",
      ),
      pkg = await inspectPackage(bytes);
    const job = {
        id: "job",
        book_id: "book",
        created_by: "admin",
        fingerprint: pkg.fingerprint,
        manifest: pkg.manifest,
        status: "importing",
        asset_cursor: 0,
        question_cursor: 0,
      },
      stored = new Map();
    let active = 0,
      max = 0,
      appended = false;
    const sdk = {
      auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
      from(table) {
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          lte() {
            return q;
          },
          single: async () => ({
            data: table === "profiles" ? { role: "admin", active: true } : job,
          }),
          update(values) {
            Object.assign(job, values);
            return q;
          },
          upsert() {
            return q;
          },
          then(resolve) {
            return Promise.resolve({ data: null }).then(resolve);
          },
        };
        return q;
      },
      rpc: async () => {
        appended = true;
        return { data: pkg.questions.length };
      },
      storage: {
        from(bucket) {
          return {
            async upload(path, data) {
              active++;
              max = Math.max(max, active);
              await new Promise((r) => setTimeout(r, 2));
              stored.set(path, data);
              active--;
              return { data: {} };
            },
            async download(path) {
              return {
                data: new Blob([
                  bucket === "universal-book-staging"
                    ? bytes
                    : tamper
                      ? new Uint8Array([0])
                      : stored.get(path),
                ]),
              };
            },
          };
        },
      },
    };
    const handler = createImportHandler({
      createClient: () => sdk,
      env: () => "fixture",
    });
    const result = await handler(
      new Request("http://127.0.0.1/functions/v1/import-book", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId: "job" }),
      }),
    );
    if (tamper) {
      assert.equal(result.status, 400);
      assert.equal(job.asset_cursor, 0);
      assert.equal(appended, false);
    } else {
      assert.equal(result.status, 200);
      assert.equal(job.status, "draft");
      assert.equal(job.question_cursor, pkg.questions.length);
      assert(max > 1 && max <= 4);
      assert(stored.size > 0);
    }
  });
