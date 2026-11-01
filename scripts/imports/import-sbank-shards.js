// Resumable authenticated transport. Packages stay draft until separate acceptance.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validatePackage } from "../../supabase/functions/_shared/universal-package.js";
const roots = process.argv.slice(2);
if (!roots.length || !process.env.SATCHI_SBANK_EXECUTE)
  throw new Error("Explicit execution and prepared folders required");
const url = process.env.VITE_SUPABASE_URL;
if (url !== "https://ileffhbbaomfimwulvpw.supabase.co")
  throw new Error("Unexpected production target");
const sdk = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "x-satchi-client-version": "20261008" } },
});
const login = await sdk.auth.signInWithPassword({
  email: process.env.SATCHI_IMPORT_EMAIL,
  password: process.env.SATCHI_IMPORT_PASSWORD,
});
if (login.error) throw login.error;
const statePath = process.env.SATCHI_SBANK_STATE;
if (!statePath) throw new Error("Private checkpoint path required");
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath))
  : {};
const persist = () => {
  const temp = statePath + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temp, statePath);
};
const jobs = roots.flatMap((root) =>
  JSON.parse(fs.readFileSync(path.join(root, "shards/index.json"))).map(
    (v) => ({ ...v, root }),
  ),
);
jobs.sort((a, b) => a.file.localeCompare(b.file));
// Full raster/CRC audit was completed offline. The Edge handler repeats ZIP,
// raster and digest validation before creating each remote draft.
for (const root of roots) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json")),
  );
  const questions = JSON.parse(
    fs.readFileSync(path.join(root, "questions.json")),
  );
  validatePackage(manifest, questions);
  if (manifest.bankSource !== "sbank") throw new Error("Wrong source");
}
for (const job of jobs) {
  const file = path.join(job.root, "shards", job.file);
  const bytes = fs.readFileSync(file);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== job.sha256)
    throw new Error("Shard changed");
  if (bytes.length > 32 * 1024 * 1024) throw new Error("Oversized shard");
  if (global.gc) global.gc();
}
console.log(
  JSON.stringify({
    validatedShards: jobs.length,
    questions: jobs.reduce((n, j) => n + j.questions, 0),
  }),
);
async function invoke(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await sdk.functions.invoke("import-book", {
      body,
      headers: body instanceof Blob ? { "Content-Type": body.type } : undefined,
    });
    if (!r.error && !r.data?.error) return r.data;
    let detail = r.data?.error;
    try {
      detail = (await r.error?.context?.json())?.error || detail;
    } catch {
      /* keep original transport diagnostic */
    }
    if (attempt === 3)
      throw new Error(detail || r.error?.message || "Import failed");
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error("Import retry exhausted");
}
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
let position = 0,
  completed = 0;
async function permitted(id) {
  while (!stopping) {
    let limit = 2;
    try {
      if (process.env.SATCHI_IMPORT_CONTROL)
        limit = Number(
          fs.readFileSync(process.env.SATCHI_IMPORT_CONTROL, "utf8"),
        );
    } catch {
      /* fail to conservative concurrency */
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 4) limit = 2;
    if (id < limit || position >= jobs.length) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}
async function worker(id) {
  while (position < jobs.length && !stopping) {
    if (!(await permitted(id))) return;
    if (position >= jobs.length) return;
    const job = jobs[position++];
    if (
      state[job.sha256]?.status === "draft" ||
      state[job.sha256]?.status === "published"
    ) {
      completed++;
      continue;
    }
    const bytes = fs.readFileSync(path.join(job.root, "shards", job.file));
    let current =
      state[job.sha256] ||
      (await invoke(new Blob([bytes], { type: "application/zip" })));
    state[job.sha256] = {
      ...current,
      package: path.basename(job.root),
      file: job.file,
    };
    persist();
    let last = -1,
      stalls = 0;
    while (current.status === "importing" && !stopping) {
      if (!(await permitted(id))) return;
      current = await invoke({ jobId: current.id });
      const cursor = current.asset_cursor + current.question_cursor;
      if (cursor === last && ++stalls > 3)
        throw new Error("Import made no progress");
      if (cursor !== last) stalls = 0;
      last = cursor;
      state[job.sha256] = {
        ...current,
        package: path.basename(job.root),
        file: job.file,
      };
      persist();
    }
    if (stopping) return;
    if (!["draft", "published"].includes(current.status))
      throw new Error("Unexpected import state");
    completed++;
    console.log(
      JSON.stringify({
        completed,
        total: jobs.length,
        package: path.basename(job.root),
        shard: job.file,
        questions: current.question_cursor,
      }),
    );
  }
}
try {
  await Promise.all(Array.from({ length: 4 }, (_, id) => worker(id)));
} finally {
  sdk.auth.stopAutoRefresh();
  sdk.realtime.disconnect();
  persist();
}
