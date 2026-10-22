import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  canonicalQuestionId,
  questionUuid,
  questionFingerprint,
  validateAuthorizedDataset,
  validateAuthorizedFile,
} from "../scripts/imports/authorized-question-bank.js";

// Entirely synthetic content and authorization, never a real College Board item.
const question = (externalId = "synthetic-001") => ({
  externalId,
  assessment: "SAT",
  section: "Math",
  domain: "Algebra",
  skill: "Linear equations in one variable",
  difficulty: "easy",
  type: "mcq",
  prompt: { text: "Synthetic fixture: select the number two.", latex: "x=2" },
  options: ["1", "2", "3", "4"].map((text, i) => ({
    id: "ABCD"[i],
    content: { text },
  })),
  correctAnswerId: "B",
  explanation: {
    questionExternalId: externalId,
    content: { text: "Synthetic test key: two." },
  },
});
const manifest = (datasetSha256 = "a".repeat(64)) => ({
  schemaVersion: 1,
  source: "college-board",
  assessment: "SAT",
  datasetSha256,
  authorization: {
    status: "verified",
    reference: "SYNTHETIC TEST ONLY",
    verifiedBy: "Unit test",
    verifiedAt: "2026-01-01T00:00:00Z",
    datasetSha256,
    source: "college-board",
    assessment: "SAT",
    thirdPartyContentCovered: true,
    permissions: ["local-processing", "local-practice", "publication"],
  },
});
const run = (q, options) =>
  validateAuthorizedDataset(manifest(), () => [q], options);

test("unverified rights prevent even invoking the content loader or reading a file", async () => {
  const m = manifest();
  delete m.authorization;
  const report = await validateAuthorizedDataset(m, () => {
    throw new Error("Must not read content");
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.evaluated, 0);
  assert.equal(
    (await validateAuthorizedFile(m, "/does-not-exist")).status,
    "blocked",
  );
});

test("scope, third-party rights, expiry and processing methods fail closed", async () => {
  for (const patch of [
    { datasetSha256: "b".repeat(64) },
    { assessment: "PSAT" },
    { thirdPartyContentCovered: false },
    { expiresAt: "2020-01-01" },
    { verifiedAt: "2099-01-01" },
    { permissions: ["local-processing"] },
  ]) {
    const m = manifest();
    Object.assign(m.authorization, patch);
    assert.equal(
      (
        await validateAuthorizedDataset(m, () => {
          throw new Error("Blocked");
        })
      ).status,
      "blocked",
    );
  }
  assert.equal(
    (
      await validateAuthorizedDataset(manifest(), () => [], {
        uses: ["local-processing", "generative-ai"],
      })
    ).status,
    "blocked",
  );
});

test("canonical identities stay stable across exports and preserve opaque IDs", async () => {
  const q = question();
  const before = structuredClone(q);
  const a = await run(q),
    b = await run({ ...q, sourcePage: 800 });
  assert.equal(a.status, "validated-draft");
  assert.equal(a.records[0].questionId, b.records[0].questionId);
  assert.equal(a.records[0].canonicalId, "college-board:SAT:synthetic-001");
  assert.deepEqual(q, before);
  assert.throws(() => canonicalQuestionId("bad/id"));
  assert.notEqual(
    questionUuid(canonicalQuestionId("A")),
    questionUuid(canonicalQuestionId("a")),
  );
});

test("invalid assessment, section, domain, skill and difficulty are rejected", async () => {
  for (const patch of [
    { assessment: "PSAT" },
    { section: "English" },
    { domain: "Craft and Structure" },
    { domain: "__proto__" },
    { section: "constructor" },
    { skill: "Made up skill" },
    { difficulty: "unknown" },
  ]) {
    assert.equal((await run({ ...question(), ...patch })).status, "rejected");
  }
  const q = question();
  Object.assign(q, {
    section: "Reading & Writing",
    domain: "Information and Ideas",
    skill: "Inferences",
  });
  assert.equal((await run(q)).status, "validated-draft");
});

test("answer order, correct key and explanation association are validated", async () => {
  const variants = [];
  let q = question();
  q.options.reverse();
  variants.push(q);
  q = question();
  q.correctAnswerId = "E";
  variants.push(q);
  q = question();
  q.explanation.questionExternalId = "another-item";
  variants.push(q);
  q = question();
  delete q.explanation;
  variants.push(q);
  for (const q of variants) assert.equal((await run(q)).status, "rejected");
});

test("Math open responses use explicit accepted strings and no MCQ marker", async () => {
  const q = question();
  Object.assign(q, {
    type: "open",
    options: [],
    acceptedAnswers: ["2", "2.0"],
  });
  delete q.correctAnswerId;
  assert.equal((await run(q)).status, "validated-draft");
  q.acceptedAnswers = [];
  assert.equal((await run(q)).status, "rejected");
});

test("images and formulae retain checksums, associations and accessible text", async () => {
  const q = question();
  q.assets = [
    {
      id: "diagram",
      path: "assets/diagram.png",
      mime: "image/png",
      sha256: "b".repeat(64),
      alt: "Synthetic diagram",
    },
  ];
  q.prompt = { assetIds: ["diagram"], latex: "x^2" };
  assert.equal((await run(q)).status, "validated-draft");
  q.assets[0].path = "assets/../secret.png";
  assert.equal((await run(q)).status, "rejected");
  q.assets[0].path = "assets/diagram.png";
  q.prompt.assetIds = ["missing"];
  assert.equal((await run(q)).status, "rejected");
});

test("duplicates and changed existing identities require review without merging progress", async () => {
  const q = question(),
    fingerprint = questionFingerprint(q),
    canonicalId = canonicalQuestionId(q.externalId);
  let r = await validateAuthorizedDataset(manifest(), () => [q, q]);
  assert.ok(r.errors.some((e) => e.code === "duplicate-external-id"));
  r = await validateAuthorizedDataset(manifest(), () => [
    q,
    question("synthetic-002"),
  ]);
  assert.ok(
    r.errors.some((e) => e.code === "duplicate-content-requires-review"),
  );
  const existing = [{ canonicalId, fingerprint, questionId: "existing-uuid" }];
  const snapshot = structuredClone(existing);
  r = await run(q, { existing });
  assert.equal(r.records[0].questionId, "existing-uuid");
  assert.deepEqual(existing, snapshot);
  q.correctAnswerId = "A";
  r = await run(q, { existing });
  assert.ok(r.errors.some((e) => e.code === "existing-identity-conflict"));
  assert.ok(
    !JSON.stringify(r).includes("Synthetic fixture"),
    "Reports never echo question content",
  );
});

test("file preflight checks actual bytes before parsing an authorized structured dataset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "satchi-authorized-"));
  try {
    const path = join(directory, "synthetic.json"),
      bytes = JSON.stringify([question()]);
    await writeFile(path, bytes);
    assert.equal(
      (await validateAuthorizedFile(manifest(), path)).errors[0].code,
      "dataset-hash-mismatch",
    );
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(
      (await validateAuthorizedFile(manifest(digest), path)).status,
      "validated-draft",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
