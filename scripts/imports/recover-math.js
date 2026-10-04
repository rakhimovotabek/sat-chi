import { readFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { privateStorageClient } from "./private-storage.js";
import { sourcePath, fingerprintFile, atomicJson } from "./source-files.js";
import { mathDomain } from "./math-domain.js";
import { validateLocalImport } from "./local-validation.js";
const run = promisify(execFile),
  project = "ileffhbbaomfimwulvpw",
  version = "2026-10-04.math-regions1";
if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== project)
  throw new Error("Unexpected project");
const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9),
  apply = process.argv.includes("--apply");
if (
  !/^(Mathbook 3\.0|MathBook 2\.0 Ready|HardBook 2\.0|800 Challenge - Hard Math 150 \(Part 1\) - SAT Math Club|PrepPros Complete Guide Math|PrepProsAdvanced MATH\(2ndEdition\))\.pdf$/.test(
    source || "",
  )
)
  throw new Error("Choose a supported chapter-key Math source");
const manifest = JSON.parse(
    await readFile("local-imports/manifest.json", "utf8"),
  ),
  report = manifest.find((r) => r.source_file === source);
if (!report) throw new Error("Missing source checkpoint");
if (report.book_id || report.imported_count > 0) throw new Error("Source already has imported regions. Use repair-math-options.js to repair existing IDs; do not create duplicate imports.");
const pdf = await sourcePath(
  join(homedir(), "Desktop", "Books"),
  report.source_path,
);
if ((await fingerprintFile(pdf)) !== report.fingerprint)
  throw new Error("Source changed");
const folder = join("local-imports", "math", report.fingerprint);
await mkdir(folder, { recursive: true });
await run("pdftotext", ["-bbox-layout", pdf, join(folder, "bbox.xml")], {
  timeout: 120000,
  maxBuffer: 1024 * 1024,
});
await run("pdftotext", ["-layout", pdf, join(folder, "text.txt")], {
  timeout: 120000,
  maxBuffer: 1024 * 1024,
});
const regions = JSON.parse(
  (
    await run(
      "python3",
      [
        source.startsWith("PrepProsAdvanced")
          ? "scripts/imports/math-scanned-regions.py"
          : source.startsWith("800 Challenge")
            ? "scripts/imports/math-800-regions.py"
            : source.startsWith("PrepPros Complete")
              ? "scripts/imports/math-preppros-regions.py"
              : "scripts/imports/math-regions.py",
        join(folder, "bbox.xml"),
        join(folder, "text.txt"),
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    )
  ).stdout,
);
for (const r of regions.accepted) {
  const side = r.bounds[0] > r.page_width / 2;
  r.render_bounds = r.full_page
    ? r.bounds
    : [
        side ? r.page_width / 2 - 8 : 0,
        r.bounds[1],
        r.page_width / 2 + 8,
        r.bounds[3],
      ];
}
await atomicJson(join(folder, "choice-regions.json"), regions);
const choiceRecovery = JSON.parse(
  (
    await run(
      "python3",
      [
        "scripts/imports/math-options.py",
        join(folder, "bbox.xml"),
        join(folder, "choice-regions.json"),
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    )
  ).stdout,
);
regions.accepted = choiceRecovery.filter((r) => r.options_verified);
regions.unresolved.push(...choiceRecovery.filter((r) => !r.options_verified));
if (!regions.accepted.length) throw new Error("No validated MCQ regions");
const pageGroups = Map.groupBy(regions.accepted, (r) => r.page),
  assets = [];
for (const [page, records] of pageGroups) {
  const prefix = join(folder, `page-${page}`);
  await run(
    "pdftoppm",
    [
      "-f",
      String(page),
      "-l",
      String(page),
      "-r",
      "144",
      "-png",
      "-singlefile",
      pdf,
      prefix,
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  if (source.startsWith("PrepProsAdvanced")) {
    const { stdout } = await run(
      "tesseract",
      [prefix + ".png", "stdout", "--psm", "6"],
      { timeout: 60000, maxBuffer: 1024 * 1024 },
    );
    const header = stdout.match(/Question\s+(\d+)/i);
    const options = [...stdout.matchAll(/^\s*([A-D])[).]/gm)].map((m) => m[1]);
    if (!header || Number(header[1]) !== page || options.join("") !== "ABCD") {
      for (const r of records)
        regions.unresolved.push({
          ...r,
          reason:
            "Selected scan header or complete choices require image verification",
        });
      continue;
    }
  }
  const args = [prefix + ".png"];
  for (const region of records) {
    const hash = createHash("sha256")
      .update(JSON.stringify([report.fingerprint, version, region]))
      .digest("hex");
    region.asset = report.fingerprint + "/" + hash + ".webp";
    region.file = join(folder, hash + ".webp");
    region.render_bounds = region.stem_bounds;
    const [x, y, w, h] = region.render_bounds.map((v) => Math.round(v * 2));
    args.push(
      "(",
      "+clone",
      "-crop",
      `${w}x${h}+${x}+${y}`,
      "+repage",
      "-strip",
      "-quality",
      "85",
      "-write",
      region.file,
      "+delete",
      ")",
    );
    assets.push(region);
  }
  args.push("null:");
  await run("magick", args, { timeout: 60000, maxBuffer: 1024 * 1024 });
}
const topics = [];
const evidence = [];
for (const region of assets) {
  let topic = topics.find((t) => t.title === region.section);
  if (!topic) topics.push((topic = { title: region.section, questions: [] }));
  topic.questions.push({
    type: "mcq",
    question: `${region.section} · Question ${region.number}. Solve the problem shown in the preserved source image.`,
    options: region.options,
    correctAnswer: region.answer.charCodeAt(0) - 65,
    source,
    source_page: region.page,
    imageUrl: `https://${project}.supabase.co/storage/v1/object/authenticated/question-assets/${region.asset}`,
    difficulty: "unclassified",
    domain: mathDomain(region.section),
    skill: region.section,
    import_metadata: {
      source_file: source,
      parser_version: version,
      extraction_method: "embedded_bbox_rendered_region",
      source_number: region.number,
      source_section: region.section,
      answer_key_page: region.key_page,
      visual_asset: region.asset,
      region_bounds: region.render_bounds,
      review_required: true,
      options_verified: true,
      option_extraction_method: "embedded_single_baseline_v1",
    },
  });
}
// Evidence follows final topic/question order, never a global number offset.
let index = 0;
for (const topic of topics)
  for (const q of topic.questions)
    evidence.push({
      question_index: index++,
      number: q.import_metadata.source_number,
      set: topic.title,
      page: q.source_page,
      key_page: q.import_metadata.answer_key_page,
      answer: q.correctAnswer,
      method: "embedded_bbox_rendered_region",
      asset: q.import_metadata.visual_asset,
    });
const payload = {
  schemaVersion: 1,
  kind: "book",
  book: {
    title: report.title,
    category: "Math",
    description:
      "Source-derived questions with preserved notation and chapter-scoped printed answers. Administrator approval and publication required.",
    published: false,
  },
  topics,
};
const validation = validateLocalImport(payload);
if (validation.errors.length) throw new Error(validation.errors.join("; "));
await atomicJson(join(folder, "recovery.json"), {
  ...regions,
  accepted: assets.map(({ file, ...r }) => r),
});
if (apply) {
  const client = await privateStorageClient(project);
  for (let i = 0; i < assets.length; i += 6)
    await Promise.all(
      assets.slice(i, i + 6).map(async (region) => {
        const bytes = await readFile(region.file);
        if (bytes.length > 1048576)
          throw new Error("Question asset exceeds size limit");
        const { error } = await client.storage
          .from("question-assets")
          .upload(region.asset, bytes, {
            contentType: "image/webp",
            upsert: true,
          });
        if (error)
          throw new Error(
            "Private question asset upload failed; catalog unchanged",
          );
      }),
    );
  Object.assign(report, {
    parser_version: version,
    status: "validated",
    source_type: "book",
    category: "Math",
    resolution_status: "partial",
    detected_topics: topics.length,
    detected_questions: assets.length + regions.unresolved.length,
    verified_key_count: assets.length,
    needs_review_count: regions.unresolved.length,
    skipped_count: regions.unresolved.length,
    warnings: [
      `${regions.unresolved.length} numeric, missing-key or incomplete regions excluded; see exact page inventory.`,
    ],
    errors: [],
    evidence,
    review_items: regions.unresolved.map((r) => ({
      number: r.number,
      page: r.page,
      set: r.section,
      reasons: [r.reason],
      key_page: r.key_page,
    })),
    asset_pages: [...pageGroups.keys()],
    asset_references: assets.map((r) => ({
      page: r.page,
      number: r.number,
      section: r.section,
      path: r.asset,
    })),
    intermediate_file: report.fingerprint + ".json",
  });
  await atomicJson("local-imports/" + report.intermediate_file, payload);
  report.intermediate_hash = await fingerprintFile(
    "local-imports/" + report.intermediate_file,
  );
  await atomicJson(
    "local-imports/" + report.fingerprint + ".report.json",
    report,
  );
  const latest = JSON.parse(
    await readFile("local-imports/manifest.json", "utf8"),
  );
  await atomicJson(
    "local-imports/manifest.json",
    latest.map((r) => (r.fingerprint === report.fingerprint ? report : r)),
  );
  console.log(
    `${source}: ${assets.length} validated questions/assets prepared; run source-scoped import apply.`,
  );
} else
  console.log(
    `${source}: ${assets.length} recovered; ${regions.unresolved.length} excluded; no database/storage writes.`,
  );
