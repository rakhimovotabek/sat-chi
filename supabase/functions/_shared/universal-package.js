// Shared by browser preview and the authenticated Edge transport. No filesystem extraction.
export const LIMITS = {
  zip: 32 * 1024 * 1024,
  expanded: 96 * 1024 * 1024,
  entry: 8 * 1024 * 1024,
  entries: 4000,
  questions: 3000,
};
const fail = (message) => {
  throw new Error(message);
};
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function safePath(path) {
  return (
    typeof path === "string" &&
    /^[a-zA-Z0-9_./-]+$/.test(path) &&
    !path.startsWith("/") &&
    !path.split("/").some((p) => !p || p === "." || p === "..")
  );
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
export async function readZip(input) {
  const bytes = new Uint8Array(input),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > LIMITS.zip || bytes.length < 22)
    fail("ZIP must be between 22 bytes and 32 MB.");
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    view.getUint32(end, true) !== 0x06054b50
  )
    end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50)
    fail("Missing ZIP directory.");
  const count = view.getUint16(end + 10, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    !count ||
    count > LIMITS.entries ||
    view.getUint16(end + 8, true) !== count ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length
  )
    fail("Split, ZIP64 or oversized archives are unsupported.");
  let cursor = view.getUint32(end + 16, true),
    expanded = 0;
  const directoryEnd = cursor + view.getUint32(end + 12, true),
    files = new Map();
  if (directoryEnd !== end) fail("Invalid ZIP directory length.");
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      fail("Invalid ZIP entry.");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      crc = view.getUint32(cursor + 16, true),
      compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true),
      nameSize = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      offset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameSize),
    );
    cursor += 46 + nameSize + extra + comment;
    if (
      !safePath(name) ||
      files.has(name) ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      ((view.getUint32(cursor - comment - extra - nameSize - 8, true) >>> 16) &
        0xf000) ===
        0xa000
    )
      fail(`Unsafe or duplicate ZIP entry: ${name}`);
    if (
      ![
        "manifest.json",
        "questions.jsonl",
        "review-report.csv",
        "README.md",
      ].includes(name) &&
      !/^assets\/[a-zA-Z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(name)
    )
      fail(`Unsupported file: ${name}`);
    expanded += size;
    if (
      size > LIMITS.entry ||
      expanded > LIMITS.expanded ||
      (compressed && size / compressed > 200)
    )
      fail("Archive expansion limit exceeded.");
    if (
      offset + 30 > directoryEnd ||
      view.getUint32(offset, true) !== 0x04034b50
    )
      fail("Invalid local ZIP header.");
    const localNameLength = view.getUint16(offset + 26, true),
      start = offset + 30 + localNameLength + view.getUint16(offset + 28, true);
    if (
      new TextDecoder().decode(
        bytes.subarray(offset + 30, offset + 30 + localNameLength),
      ) !== name ||
      start + compressed > view.getUint32(end + 16, true)
    )
      fail("ZIP headers disagree.");
    const packed = bytes.subarray(start, start + compressed);
    let data;
    if (method === 0) data = packed.slice();
    else {
      const reader = new Blob([packed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      const chunks = [];
      let length = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > size) {
          await reader.cancel();
          fail("Archive expansion exceeds declared size.");
        }
        chunks.push(next.value);
      }
      data = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        data.set(chunk, at);
        at += chunk.length;
      }
    }
    if (data.length !== size || crc32(data) !== crc)
      fail(`Corrupt ZIP entry: ${name}`);
    files.set(name, data);
  }
  if (cursor !== directoryEnd) fail("ZIP directory entry count mismatch.");
  for (const required of [
    "manifest.json",
    "questions.jsonl",
    "review-report.csv",
    "README.md",
  ])
    if (!files.has(required)) fail(`Missing ${required}.`);
  return files;
}
export function validatePackage(manifest, questions) {
  if (manifest?.format !== "satchi-book-v1") fail("Expected satchi-book-v1.");
  const b = manifest.book;
  if (
    !b ||
    typeof b.title !== "string" ||
    !b.title.trim() ||
    b.title.length > 160 ||
    !["Math", "Reading & Writing"].includes(b.section) ||
    !/^[a-z0-9-]{1,100}$/.test(b.id)
  )
    fail("Invalid book identity, title or section.");
  if (
    !manifest.rights?.authorized ||
    !manifest.rights.license ||
    !manifest.rights.owner
  )
    fail("Publication authorization, owner and license are required.");
  if (
    !Array.isArray(manifest.topics) ||
    !manifest.topics.length ||
    manifest.topics.length > 200
  )
    fail("Provide 1–200 topics.");
  const topics = new Map();
  for (const t of manifest.topics) {
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(t.id) ||
      topics.has(t.id) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      t.title.length > 160 ||
      (t.parent && !topics.has(t.parent))
    )
      fail("Topics must have unique IDs and parents listed before children.");
    topics.set(t.id, t);
    let depth = 0,
      node = t;
    while (node.parent) {
      node = topics.get(node.parent);
      if (++depth > 8) fail("Topic nesting exceeds eight levels.");
    }
  }
  if (
    !Array.isArray(questions) ||
    !questions.length ||
    questions.length > LIMITS.questions ||
    manifest.questionCount !== questions.length
  )
    fail("Question count mismatch or limit exceeded (3000).");
  const ids = new Set(),
    assets = new Set();
  const asset = (p) => {
    if (p != null) {
      if (!safePath(p) || !/^assets\/.+\.(png|jpg|jpeg|webp)$/.test(p))
        fail(`Invalid image reference: ${p}`);
      assets.add(p);
    }
  };
  asset(b.cover);
  for (const q of questions) {
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(q.id) ||
      ids.has(q.id) ||
      !topics.has(q.topic)
    )
      fail(`Invalid question identity/topic: ${q.id}`);
    ids.add(q.id);
    if (
      !["mcq", "open"].includes(q.type) ||
      typeof q.text !== "string" ||
      q.text.length > 20000 ||
      (!q.text.trim() && !q.image)
    )
      fail(`Invalid stem: ${q.id}`);
    if (
      !["easy", "medium", "hard", "unclassified"].includes(q.difficulty) ||
      !["approved", "pending", "rejected"].includes(q.reviewStatus)
    )
      fail(`Invalid classification: ${q.id}`);
    for (const key of ["passage", "explanation"])
      if (
        q[key] != null &&
        (typeof q[key] !== "string" || q[key].length > 60000)
      )
        fail(`Invalid ${key}: ${q.id}`);
    for (const key of ["domain", "skill"])
      if (typeof q[key] !== "string" || !q[key].trim() || q[key].length > 200)
        fail(`Missing ${key}: ${q.id}`);
    if (
      !q.source ||
      typeof q.source.reference !== "string" ||
      q.source.reference.length > 500
    )
      fail(`Missing source reference: ${q.id}`);
    asset(q.image);
    asset(q.explanationImage);
    if (q.type === "mcq") {
      if (
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer > 3
      )
        fail(`Invalid choices/key: ${q.id}`);
      q.options.forEach((o, i) => {
        if (
          o.label !== "ABCD"[i] ||
          typeof o.text !== "string" ||
          o.text.length > 4000 ||
          (!o.text.trim() && !o.image)
        )
          fail(`Invalid choice ${i}: ${q.id}`);
        asset(o.image);
      });
    } else if (
      b.section !== "Math" ||
      !Array.isArray(q.acceptedAnswers) ||
      !q.acceptedAnswers.length ||
      q.acceptedAnswers.some(
        (a) =>
          typeof a !== "string" ||
          !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:\/\d+)?$/.test(a) ||
          /\/0+$/.test(a),
      )
    )
      fail(`Invalid numerical answer: ${q.id}`);
  }
  return {
    assets: [...assets],
    topics: topics.size,
    questions: questions.length,
  };
}
export async function inspectPackage(input) {
  const files = await readZip(input),
    decode = (name) =>
      new TextDecoder("utf-8", { fatal: true }).decode(files.get(name));
  const manifest = JSON.parse(decode("manifest.json"));
  const lines = decode("questions.jsonl").trim().split(/\r?\n/);
  const questions = lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      fail(`Invalid JSON on question line ${i + 1}.`);
    }
  });
  const summary = validatePackage(manifest, questions);
  for (const path of summary.assets)
    if (!files.has(path)) fail(`Missing image: ${path}`);
  for (const [path, data] of files)
    if (path.startsWith("assets/")) {
      const png =
        path.endsWith(".png") &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => data[i] === b);
      const jpeg =
        /\.jpe?g$/.test(path) &&
        data[0] === 255 &&
        data[1] === 216 &&
        data[2] === 255;
      const webp =
        path.endsWith(".webp") &&
        new TextDecoder().decode(data.subarray(0, 4)) === "RIFF" &&
        new TextDecoder().decode(data.subarray(8, 12)) === "WEBP";
      if (!png && !jpeg && !webp) fail(`Invalid image signature: ${path}`);
    }
  return {
    manifest,
    questions,
    summary,
    files,
    fingerprint: await sha256(input),
  };
}
