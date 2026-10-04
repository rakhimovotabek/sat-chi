// Recover only complete per-source atomic reports after interrupted/concurrent
// manifest writers. Source content/payloads are never manually rewritten.
import { readFile } from "node:fs/promises";
import { atomicJson, fingerprintFile } from "./source-files.js";
const manifest = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
);
for (let i = 0; i < manifest.length; i++) {
  const r = JSON.parse(
    await readFile(
      `local-imports/${manifest[i].fingerprint}.report.json`,
      "utf8",
    ),
  );
  if (
    r.fingerprint !== manifest[i].fingerprint ||
    r.source_file !== manifest[i].source_file
  )
    throw new Error("Checkpoint identity mismatch");
  if (
    r.intermediate_file &&
    (await fingerprintFile("local-imports/" + r.intermediate_file)) !==
      r.intermediate_hash
  )
    throw new Error("Intermediate checkpoint changed");
  manifest[i] = r;
}
await atomicJson("local-imports/manifest.json", manifest);
console.log(
  `Reconciled ${manifest.length} complete atomic reports; no database writes.`,
);
