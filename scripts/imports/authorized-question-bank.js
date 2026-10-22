import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { COLLEGE_BOARD_TAXONOMY } from "../../src/features/learning/college-board-taxonomy.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const text = (value) => typeof value === "string" && value.trim().length > 0;
const sha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identity = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);

// IDs depend on authority + assessment + opaque external ID, never a PDF page,
// export hash, book title, content revision, or question's order in an export.
export function canonicalQuestionId(externalId) {
  if (!identity(externalId)) throw new Error("Invalid external question ID");
  return `college-board:SAT:${externalId}`;
}

export function questionUuid(canonicalId) {
  const bytes = Buffer.from(hash(canonicalId).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // UUIDv8, deterministic SHA-256 namespace.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function questionFingerprint(question) {
  // Arrays retain their original order. Labels, answers, formulae and asset
  // checksums participate; identical prompts with different keys aren't merged.
  const {
    prompt,
    passage,
    stimulus,
    options,
    correctAnswerId,
    acceptedAnswers,
    explanation,
    assets,
  } = question;
  return hash(
    JSON.stringify(
      stable({
        prompt,
        passage,
        stimulus,
        options,
        correctAnswerId,
        acceptedAnswers,
        explanation: explanation?.content,
        assets,
      }),
    ),
  );
}

export function authorizationErrors(
  manifest,
  {
    now = new Date(),
    uses = ["local-processing", "local-practice", "publication"],
  } = {},
) {
  const errors = [];
  const a = manifest?.authorization;
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.source !== "college-board" ||
    manifest?.assessment !== "SAT"
  )
    errors.push("unsupported-dataset");
  if (!sha256(manifest?.datasetSha256)) errors.push("missing-dataset-hash");
  if (
    !a ||
    a.status !== "verified" ||
    !text(a.reference) ||
    !text(a.verifiedBy) ||
    !text(a.verifiedAt) ||
    !Number.isFinite(Date.parse(a.verifiedAt)) ||
    Date.parse(a.verifiedAt) > +now
  )
    errors.push("unverified-authorization");
  if (
    a?.datasetSha256 !== manifest?.datasetSha256 ||
    a?.source !== "college-board" ||
    a?.assessment !== "SAT"
  )
    errors.push("authorization-scope-mismatch");
  if (a?.thirdPartyContentCovered !== true)
    errors.push("third-party-rights-unverified");
  if (
    a?.expiresAt &&
    (!Number.isFinite(Date.parse(a.expiresAt)) ||
      Date.parse(a.expiresAt) <= +now)
  )
    errors.push("authorization-expired");
  if (
    !Array.isArray(uses) ||
    !uses.includes("local-processing") ||
    uses.some(
      (use) => !Array.isArray(a?.permissions) || !a.permissions.includes(use),
    )
  )
    errors.push("processing-method-not-authorized");
  return errors;
}

function assetValid(asset) {
  return (
    identity(asset?.id) &&
    sha256(asset.sha256) &&
    text(asset.alt) &&
    ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(
      asset.mime,
    ) &&
    typeof asset.path === "string" &&
    /^assets\/[A-Za-z0-9_./-]+$/.test(asset.path) &&
    !asset.path
      .split("/")
      .some((part) => part === ".." || part === "." || !part)
  );
}

function blockValid(block, assetIds) {
  return (
    !!block &&
    typeof block === "object" &&
    (text(block.text) ||
      text(block.latex) ||
      (Array.isArray(block.assetIds) && block.assetIds.length > 0)) &&
    (block.text === undefined || typeof block.text === "string") &&
    (block.latex === undefined || typeof block.latex === "string") &&
    (block.assetIds === undefined ||
      (Array.isArray(block.assetIds) &&
        block.assetIds.every((id) => assetIds.has(id))))
  );
}

// Pure preflight, not an importer. The lazy loader is NEVER called before the
// rights gate passes. No SQL, filesystem/network writes, publication or AI calls.
// A trusted reviewer must verify the real grant before setting these fields.
export async function validateAuthorizedDataset(
  manifest,
  loadQuestions,
  { existing = [], ...authorizationOptions } = {},
) {
  const errors = authorizationErrors(manifest, authorizationOptions).map(
    (code) => ({ code }),
  );
  const report = {
    schemaVersion: 1,
    source: "college-board",
    status: "blocked",
    evaluated: 0,
    accepted: 0,
    records: [],
    errors,
    warnings: [],
  };
  if (errors.length) return report;
  const questions = await loadQuestions();
  if (!Array.isArray(questions) || !questions.length) {
    errors.push({ code: "empty-or-invalid-dataset" });
    return report;
  }
  const known = new Map(existing.map((row) => [row.canonicalId, row]));
  const fingerprints = new Map(
    existing
      .filter((row) => row.fingerprint)
      .map((row) => [row.fingerprint, row.canonicalId]),
  );
  const seen = new Set();
  for (const [index, q] of questions.entries()) {
    report.evaluated++;
    const codes = [];
    if (!q || typeof q !== "object" || !identity(q.externalId)) {
      errors.push({ index, code: "invalid-external-id" });
      continue;
    }
    const canonicalId = canonicalQuestionId(q.externalId);
    if (seen.has(canonicalId)) codes.push("duplicate-external-id");
    seen.add(canonicalId);
    const skills = Object.hasOwn(COLLEGE_BOARD_TAXONOMY, q.section)
      ? COLLEGE_BOARD_TAXONOMY[q.section][q.domain]
      : undefined;
    if (
      q.assessment !== "SAT" ||
      !Array.isArray(skills) ||
      !skills.includes(q.skill)
    )
      codes.push("invalid-classification");
    if (!["easy", "medium", "hard"].includes(q.difficulty))
      codes.push("invalid-difficulty");
    const assets = q.assets ?? [];
    const assetIds = new Set(
      Array.isArray(assets) ? assets.map((asset) => asset?.id) : [],
    );
    if (
      !Array.isArray(assets) ||
      !assets.every(assetValid) ||
      assets.length !== assetIds.size
    )
      codes.push("invalid-assets");
    if (
      !blockValid(q.prompt, assetIds) ||
      (q.passage !== undefined && !blockValid(q.passage, assetIds)) ||
      (q.stimulus !== undefined && !blockValid(q.stimulus, assetIds))
    )
      codes.push("invalid-content-block");
    if (q.type === "mcq") {
      if (
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every(
          (option, i) =>
            option?.id === "ABCD"[i] && blockValid(option.content, assetIds),
        )
      )
        codes.push("invalid-choice-order-or-content");
      if (
        !"ABCD".split("").includes(q.correctAnswerId) ||
        q.acceptedAnswers !== undefined
      )
        codes.push("invalid-answer-key");
    } else if (q.type === "open") {
      if (
        q.section !== "Math" ||
        !Array.isArray(q.options) ||
        q.options.length !== 0 ||
        q.correctAnswerId !== undefined ||
        !Array.isArray(q.acceptedAnswers) ||
        !q.acceptedAnswers.length ||
        !q.acceptedAnswers.every(
          (answer) => text(answer) && answer.length <= 200,
        ) ||
        new Set(q.acceptedAnswers).size !== q.acceptedAnswers.length
      )
        codes.push("invalid-open-answer-key");
    } else codes.push("invalid-question-type");
    if (
      q.explanation?.questionExternalId !== q.externalId ||
      !blockValid(q.explanation?.content, assetIds)
    )
      codes.push("missing-or-mismatched-explanation");
    const fingerprint = questionFingerprint(q);
    const previous = known.get(canonicalId);
    if (previous && previous.fingerprint !== fingerprint)
      codes.push("existing-identity-conflict");
    if (
      fingerprints.has(fingerprint) &&
      fingerprints.get(fingerprint) !== canonicalId
    )
      codes.push("duplicate-content-requires-review");
    fingerprints.set(fingerprint, canonicalId);
    if (
      previous?.questionId &&
      previous.questionId !== questionUuid(canonicalId)
    )
      report.warnings.push({
        index,
        canonicalId,
        code: "preserve-existing-question-uuid",
        questionId: previous.questionId,
      });
    if (codes.length)
      errors.push(...codes.map((code) => ({ index, canonicalId, code })));
    else {
      report.accepted++;
      report.records.push({
        index,
        canonicalId,
        questionId: previous?.questionId || questionUuid(canonicalId),
        fingerprint,
        disposition: previous ? "unchanged" : "new-draft",
      });
    }
  }
  report.status = errors.length ? "rejected" : "validated-draft";
  return report;
}

// Preferred file entry point: validate the real bytes against the reviewed
// grant's checksum before parsing any question data. JSON only, no PDF adapter.
export async function validateAuthorizedFile(manifest, path, options = {}) {
  if (authorizationErrors(manifest, options).length)
    return validateAuthorizedDataset(
      manifest,
      () => {
        throw new Error("Authorization gate failed");
      },
      options,
    );
  const bytes = await readFile(path);
  if (hash(bytes) !== manifest.datasetSha256)
    return {
      schemaVersion: 1,
      source: "college-board",
      status: "blocked",
      evaluated: 0,
      accepted: 0,
      records: [],
      warnings: [],
      errors: [{ code: "dataset-hash-mismatch" }],
    };
  let questions;
  try {
    questions = JSON.parse(bytes.toString("utf8"));
  } catch {
    return {
      schemaVersion: 1,
      source: "college-board",
      status: "rejected",
      evaluated: 0,
      accepted: 0,
      records: [],
      warnings: [],
      errors: [{ code: "invalid-json-dataset" }],
    };
  }
  return validateAuthorizedDataset(manifest, () => questions, options);
}
