import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  inspectPackage,
  validatePackage,
} from "../supabase/functions/_shared/universal-package.js";
import { learningDatabase, admin, student } from "./helpers/database.js";
const fixture = "assets/examples/satchi-book-v1/acceptance-math-30.zip";
test("original 30-question fixture verifies digests, real image-only options and positive/negative SPR", async () => {
  const pkg = await inspectPackage(await readFile(fixture));
  assert.equal(pkg.questions.length, 30);
  assert.equal(pkg.summary.assets.length, 6);
  assert.equal(
    pkg.questions[1].options.every((o) => o.image && o.text === ""),
    true,
  );
  assert.deepEqual(pkg.questions[4].acceptedAnswers, ["-1.5", "-3/2"]);
  assert.equal(Object.keys(pkg.manifest.assetDigests).length, 6);
  for (const bad of [null, 4, []])
    assert.throws(() => validatePackage(pkg.manifest, [bad]), /count mismatch/);
  const qs = structuredClone(pkg.questions);
  qs[0] = null;
  assert.throws(() => validatePackage(pkg.manifest, qs), /must be an object/);
  qs[0] = pkg.questions[0];
  qs[3].acceptedAnswers = ["1.2/3"];
  assert.throws(
    () => validatePackage(pkg.manifest, qs),
    /Invalid numerical answer/,
  );
});
test("CLI rejects changed digests and identifies the exact missing option", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "satchi-package-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const mode of ["digest", "missing"]) {
    const output = join(dir, `${mode}.zip`);
    execFileSync("python3", [
      "-c",
      `import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z: files={n:z.read(n) for n in z.namelist()}
m=json.loads(files['manifest.json'])
if sys.argv[3]=='digest': m['assetDigests']['assets/choice-a.png']='0'*64
else:
 del files['assets/choice-c.png']
 del m['assetDigests']['assets/choice-c.png']
files['manifest.json']=json.dumps(m).encode()
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in files.items(): z.writestr(n,b)
`,
      fixture,
      output,
      mode,
    ]);
    await assert.rejects(
      () => readFile(output).then(inspectPackage),
      mode === "digest"
        ? /SHA-256 mismatch/
        : /q0002.options.C.image is missing/,
    );
    try {
      execFileSync(
        process.execPath,
        ["scripts/imports/validate-universal.js", output],
        { stdio: "pipe" },
      );
      assert.fail("invalid archive passed CLI");
    } catch (error) {
      assert.equal(error.status, 1);
      assert.equal(JSON.parse(error.stderr.toString()).valid, false);
    }
  }
});
test("30-question package crosses the batch boundary and publishes canonical rows exactly once", async (t) => {
  const pkg = await inspectPackage(await readFile(fixture));
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  const job = await call(
    "universal_begin",
    [pkg.fingerprint, JSON.stringify(pkg.manifest), admin],
    ["text", "jsonb", "uuid"],
  );
  const append = (cursor, records) =>
    call(
      "universal_append",
      [job, cursor, JSON.stringify(records)],
      ["uuid", "integer", "jsonb"],
    );
  assert.equal(await append(0, pkg.questions.slice(0, 25)), 25);
  assert.equal(await append(0, pkg.questions.slice(0, 25)), 25);
  assert.equal(await append(25, pkg.questions.slice(25)), 30);
  // A late retry returns the authoritative cursor without creating extra rows.
  assert.equal(await append(0, pkg.questions.slice(0, 25)), 30);
  assert.equal(
    (
      await db.query(
        "select count(*) n from universal_book_ids where job_id=$1",
        [job],
      )
    ).rows[0].n,
    30,
  );
  await db.query("update universal_book_jobs set status='draft' where id=$1", [
    job,
  ]);
  await role(admin);
  await call("universal_publish", [job, true], ["uuid", "boolean"]);
  const bookId = (
    await db.query("select book_id from universal_book_jobs where id=$1", [job])
  ).rows[0].book_id;
  await role(student);
  const bank = await call(
    "question_bank",
    [JSON.stringify({}), 0],
    ["jsonb", "integer"],
  );
  assert.ok(JSON.stringify(bank).includes("Solve"));
  assert.equal(
    (
      await db.query(
        "select count(*) n from questions q join book_topics t on t.id=q.topic_id where t.book_id=$1",
        [bookId],
      )
    ).rows[0].n,
    30,
  );
});
