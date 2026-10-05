import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { privateStorageClient } from "./private-storage.js";
const run = promisify(execFile);
const project = "ileffhbbaomfimwulvpw";
export const stableId = (value) => {
  const h = createHash("sha256").update(value).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const sqlJson = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;

function packageDifficulty(value) {
  if (value == null || value === "") return "unclassified";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "easy") return "easy";
  if (normalized === "2" || normalized === "medium") return "medium";
  if (["3", "4", "hard", "extra hard", "800-level"].includes(normalized)) return "hard";
  throw new Error(`Unsupported source difficulty: ${value}`);
}

export function preparePackage(book, manifest, review, assets, fingerprint) {
  const chapters = book.chapters;
  const questions = chapters.flatMap((c) =>
    c.topics.flatMap((t) => t.questions),
  );
  const counts = {
    chapters: chapters.length,
    topics: chapters.reduce((n, c) => n + c.topics.length, 0),
    questions: questions.length,
    questionsWithExplanations: questions.filter((q) => q.explanation != null)
      .length,
    questionsWithoutExplanations: questions.filter((q) => q.explanation == null)
      .length,
    questionsWithImages: questions.filter((q) => q.questionImage).length,
    imageOptionQuestions: questions.filter((q) =>
      q.options.some((o) => o.image),
    ).length,
    multipleChoiceQuestions: questions.filter((q) => q.type === "mcq").length,
    openResponseQuestions: questions.filter((q) => q.type === "open").length,
    needsReview: questions.filter((q) => q.needsReview).length,
    missingDifficulty: questions.filter((q) => q.difficulty == null || q.difficulty === "").length,
    assets: assets.length,
  };
  for (const [key, value] of Object.entries(counts))
    if (manifest[key] != null && manifest[key] !== value)
      throw new Error(
        `Manifest mismatch: ${key}, expected ${manifest[key]}, actual ${value}`,
      );
  if (
    book.book.totalQuestions != null &&
    book.book.totalQuestions !== questions.length
  )
    throw new Error("Book totalQuestions does not match content");
  if (new Set(questions.map((q) => q.id)).size !== questions.length)
    throw new Error("Duplicate question IDs");
  const reviewIds = new Set(review.map((r) => r.questionId));
  for (const id of reviewIds)
    if (!questions.some((q) => q.id === id))
      throw new Error(`Unknown review question ${id}`);
  const urls = new Map(
    assets.map((a) => [
      a.source,
      `https://${project}.supabase.co/storage/v1/object/authenticated/book-package-assets/${fingerprint}/${a.storageHash}.png`,
    ]),
  );
  const asset = (path) => {
    if (!path) return null;
    if (!urls.has(path)) throw new Error(`Missing package asset: ${path}`);
    return urls.get(path);
  };
  // Check every reference, including questions that must be skipped.
  for (const q of questions) {
    asset(q.questionImage);
    asset(q.answerImage);
    q.options.forEach((o) => asset(o.image));
    (q.explanationImages || []).forEach(asset);
    for (const match of (q.explanation || "").matchAll(
      /!\[[^\]]*\]\(([^)]+)\)/g,
    ))
      asset(match[1]);
  }
  const imported = [],
    skipped = [];
  const chapterNodes = chapters.map((c, ci) => ({
    id: stableId(`${book.book.slug}/${c.id}`),
    title: c.title,
    position: c.order ?? ci,
    metadata: { id: c.id, order: c.order },
    children: c.topics.map((t, ti) => ({
      id: stableId(`${book.book.slug}/${c.id}/${t.id}`),
      title: t.title,
      position: t.order ?? ti,
      metadata: { id: t.id, order: t.order },
      questions: t.questions.flatMap((q, qi) => {
        if (q.needsReview || reviewIds.has(q.id)) {
          skipped.push({
            id: q.id,
            reason:
              q.reviewReason ||
              review.find((r) => r.questionId === q.id)?.issue,
          });
          return [];
        }
        if (!["mcq", "open"].includes(q.type))
          throw new Error(`Unsupported type ${q.type}`);
        if (
          q.type === "mcq" &&
          (q.options.length !== 4 ||
            q.options.some(
              (o, i) => o.label !== "ABCD"[i] || (!o.text && !o.image),
            ) ||
            !"ABCD".includes(q.correctAnswer) ||
            q.correctAnswer.length !== 1)
        )
          throw new Error(`Invalid choices or key: ${q.id}`);
        if (
          q.type === "open" &&
          (q.options.length ||
            typeof q.correctAnswer !== "string" ||
            (!q.acceptedAnswers?.length && !q.acceptedRange) ||
            (q.acceptedAnswers || []).some((a) => typeof a !== "string") ||
            (q.acceptedAnswers?.length && !q.acceptedAnswers.includes(q.correctAnswer)) ||
            (q.acceptedRange && (!Number.isFinite(q.acceptedRange.min) || !Number.isFinite(q.acceptedRange.max) || q.acceptedRange.min > q.acceptedRange.max)))
        )
          throw new Error(`Missing supplied open answer: ${q.id}`);
        const {
          correctAnswer,
          acceptedAnswers,
          acceptedRange,
          answerFormat,
          answerType,
          answerImage,
          answerSource,
          explanation,
          explanationImages,
          ...metadata
        } = q;
        const row = {
          id: stableId(q.id),
          sourceId: q.id,
          type: q.type,
          text: q.questionText,
          image: asset(q.questionImage),
          options: q.options.map((o) => o.text ?? ""),
          optionImages:
            q.type === "mcq"
              ? q.options.map((o) => asset(o.image))
              : [null, null, null, null],
          table: q.table,
          correctAnswer:
            q.type === "mcq" ? "ABCD".indexOf(correctAnswer) : correctAnswer,
          acceptedAnswers,
          acceptedRange,
          answerFormat: answerFormat ?? (
            q.type === "open" && book.book.slug === "800-challenge-hard-math-150-part-1-sat-math-club"
              ? "numeric"
              : undefined
          ),
          explanation:
            explanation == null
              ? null
              : explanation.replace(
                  /(!\[[^\]]*\]\()([^)]+)(\))/g,
                  (_, start, path, end) => start + asset(path) + end,
                ),
          difficulty: packageDifficulty(q.difficulty),
          position: qi,
          page: q.page,
          metadata: {
            ...metadata,
            package_question_id: q.id,
            option_labels_in_images: true,
          },
        };
        imported.push(row);
        return [row];
      }),
    })),
  }));
  const topics = chapterNodes.map((chapter) => {
    if (
      chapter.children.length === 1 &&
      chapter.children[0].title === chapter.title
    )
      return {
        ...chapter.children[0],
        position: chapter.position,
        children: [],
        metadata: {
          ...chapter.children[0].metadata,
          chapter: chapter.metadata,
        },
      };
    return { ...chapter, questions: [] };
  });
  const report = {
    title: book.book.title,
    slug: book.book.slug,
    fingerprint,
    expected: counts,
    imported: {
      chapters: counts.chapters,
      topics: counts.topics,
      topicRows: topics.reduce((n, t) => n + 1 + t.children.length, 0),
      redundantLevelsCollapsed: chapterNodes.filter(
        (c) => c.children.length === 1 && c.children[0].title === c.title,
      ).length,
      questions: imported.length,
      missingDifficultyFallbacks: imported.filter((q) => q.difficulty === "unclassified").length,
      withExplanations: imported.filter((q) => q.explanation != null).length,
      withoutExplanations: imported.filter((q) => q.explanation == null).length,
      imageQuestions: imported.filter((q) => q.image).length,
      imageOptionQuestions: imported.filter((q) => q.optionImages.some(Boolean))
        .length,
      openResponseQuestions: imported.filter((q) => q.type === "open").length,
    },
    skipped,
  };
  return { topics, imported, report, urls };
}

export function packageData(
  book,
  manifest,
  review,
  provenance,
  assets,
  prepared,
) {
  const data = {
    book,
    manifest,
    review,
    provenance,
    topics: prepared.topics,
    assets: assets.map((a) => {
      const ref = prepared.imported.find(
        (q) =>
          q.metadata.questionImage === a.source ||
          q.metadata.options.some((o) => o.image === a.source),
      );
      const explanationRef = prepared.imported.find((q) =>
        q.explanation?.includes(prepared.urls.get(a.source)),
      );
      return {
        ...a,
        path: `${prepared.report.fingerprint}/${a.storageHash}.png`,
        questionId: ref?.id || explanationRef?.id || null,
        kind: ref
          ? ref.metadata.questionImage === a.source
            ? "question"
            : "option"
          : explanationRef
            ? "explanation"
            : "archive",
      };
    }),
    report: prepared.report,
  };
  return data;
}

export function packageSql(
  book,
  manifest,
  review,
  provenance,
  assets,
  prepared,
  staged = false,
) {
  const bid = stableId(`book/${book.book.slug}`),
    job = stableId(`package/${book.book.slug}`);
  const data = packageData(
    book,
    manifest,
    review,
    provenance,
    assets,
    prepared,
  );
  return `begin;
do $package$ declare d jsonb:=${staged ? `(select string_agg(data,'' order by part_no)::jsonb from public.book_package_import_chunks where fingerprint='${prepared.report.fingerprint}')` : sqlJson(data)}; c jsonb; t jsonb; q jsonb; a jsonb; existing public.book_import_packages;begin
if d is null or d->'report'->>'fingerprint'<>'${prepared.report.fingerprint}' then raise exception 'Incomplete package transport';end if;
perform pg_advisory_xact_lock(hashtextextended('book-package:'||(d->'book'->'book'->>'slug'),0));
select * into existing from public.book_import_packages where slug=d->'book'->'book'->>'slug';
if existing.book_id is not null then
 if existing.fingerprint<>d->'report'->>'fingerprint' then raise exception 'Package changed; reconcile corrections explicitly';end if;
 if (select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=existing.book_id)<>(d->'report'->'imported'->>'questions')::int then raise exception 'Existing import count mismatch';end if;
else
insert into public.books(id,title,category,published)values('${bid}',d->'book'->'book'->>'title','Math',false);
insert into public.book_import_packages values('${bid}',d->'book'->'book'->>'slug',d->'report'->>'fingerprint',d->'book',d->'manifest',d->'review',d->'provenance');
insert into public.import_jobs(id,fingerprint,source_file,title,status,detected_topics,detected_questions,imported_count,skipped_count,warnings,errors,book_id,source_type,category,parser_version,needs_review_count,source_metadata)
values('${job}',d->'report'->>'fingerprint',d->'book'->'book'->>'sourceFile',d->'book'->'book'->>'title','imported',(d->'manifest'->>'topics')::int,(d->'manifest'->>'questions')::int,(d->'report'->'imported'->>'questions')::int,jsonb_array_length(d->'report'->'skipped'),'[]','[]','${bid}','book','Math','structured-zip-v1',jsonb_array_length(d->'report'->'skipped'),d->'report');
for c in select value from jsonb_array_elements(d->'topics')loop
 insert into public.book_topics(id,book_id,title,position)values((c->>'id')::uuid,'${bid}',c->>'title',(c->>'position')::int);
 for t in select value from jsonb_array_elements(jsonb_build_array(c)||(c->'children'))loop
 if t->>'id'<>c->>'id' then
 insert into public.book_topics(id,book_id,parent_id,title,position)values((t->>'id')::uuid,'${bid}',(c->>'id')::uuid,t->>'title',(t->>'position')::int);
 end if;
 for q in select value from jsonb_array_elements(t->'questions')loop
 insert into public.questions(id,topic_id,question_text,options,option_image_urls,image_url,stimulus_table,difficulty,position,domain,skill,source,source_page,import_metadata,question_type)
 values((q->>'id')::uuid,(t->>'id')::uuid,q->>'text',q->'options',q->'optionImages',q->>'image',nullif(q->'table','null'::jsonb),q->>'difficulty',(q->>'position')::int,coalesce(c->'metadata'->'chapter'->>'title',c->>'title'),t->>'title',d->'book'->'book'->>'sourceFile',(q->>'page')::int,q->'metadata',q->>'type');
 insert into public.question_answers values((q->>'id')::uuid,case when q->>'type'='mcq' then (q->>'correctAnswer')::int else null end,q->>'explanation');
 if q->>'type'='open' then insert into public.book_open_answers(question_id,accepted_answers,correct_answer,answer_format,accepted_range) values((q->>'id')::uuid,coalesce(q->'acceptedAnswers','[]'::jsonb),q->>'correctAnswer',q->>'answerFormat',q->'acceptedRange');end if;
 update public.content_review_items set status='approved',note='Imported from supplied structured package; unflagged question with source answer key and lossless crops.',extraction_method='source_image_package',reviewed_at=now() where entity_id=(q->>'id')::uuid;
 end loop;end loop;end loop;
for a in select value from jsonb_array_elements(d->'assets')loop
 insert into public.book_package_assets values(a->>'path','${bid}',(a->>'questionId')::uuid,a->>'kind',a->>'source',a->>'sha256');end loop;
update public.books set published=true where id='${bid}';
insert into public.content_imports(fingerprint,book_id,question_count)values(d->'report'->>'fingerprint','${bid}',(d->'report'->'imported'->>'questions')::int);
end if;
${staged ? `delete from public.book_package_import_chunks where fingerprint='${prepared.report.fingerprint}';` : ""}
end $package$;
commit;
select b.id,b.title,b.published,(select count(*) from public.book_topics where book_id=b.id and parent_id is null) chapters,(select count(*) from public.book_topics t where t.book_id=b.id and not exists(select 1 from public.book_topics child where child.parent_id=t.id)) topics,(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=b.id) questions from public.books b where b.id='${bid}';`;
}

async function main() {
  const zip = process.argv.find((a) => a.endsWith(".zip"));
  if (!zip)
    throw new Error(
      "Usage: node scripts/imports/book-package.js /path/package.zip [--apply] [--verify-assets]",
    );
  const bytes = await readFile(zip),
    fingerprint = createHash("sha256").update(bytes).digest("hex");
  const folder = resolve("local-imports", "packages", fingerprint);
  await mkdir(folder, { recursive: true });
  const { stdout } = await run(
    "python3",
    ["scripts/imports/extract-book-package.py", resolve(zip), folder],
    { maxBuffer: 1024 * 1024 },
  );
  console.log(stdout.trim());
  const load = async (name, fallback) => {
    try {
      return JSON.parse(await readFile(join(folder, name), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT" && fallback) return fallback;
      throw e;
    }
  };
  const [book, manifest, review, provenance, assets] = await Promise.all([
    load("book.json"),
    load("manifest.json"),
    load("review.json", []),
    load("asset-provenance.json", []),
    load("asset-index.json"),
  ]);
  const prepared = preparePackage(book, manifest, review, assets, fingerprint);
  const sql = packageSql(book, manifest, review, provenance, assets, prepared);
  await writeFile(join(folder, "import.sql"), sql, { mode: 0o600 });
  await writeFile(
    join(folder, "report.json"),
    JSON.stringify(prepared.report, null, 2) + "\n",
  );
  console.log(JSON.stringify(prepared.report));
  if (!process.argv.includes("--apply")) return;
  if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== project)
    throw new Error("Unexpected linked project");
  const client = await privateStorageClient(project);
  let complete = 0;
  const verificationFile = join(folder, "verified-assets.json");
  let verified = null;
  try {
    verified = JSON.parse(await readFile(verificationFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const indexHash = createHash("sha256")
    .update(JSON.stringify(assets))
    .digest("hex");
  const verifiedSources = verified?.sources ||
    (verified?.count === assets.length ? assets.map((a) => a.source) : []);
  const resume = process.argv.includes("--resume-assets") &&
    verified?.fingerprint === fingerprint && verified?.indexHash === indexHash &&
    Number.isInteger(verified?.count) && verified.count >= 0 &&
    verified.count <= assets.length && verifiedSources.length === verified.count &&
    assets.slice(0, verified.count).every((a, i) => verifiedSources[i] === a.source);
  if (process.argv.includes("--resume-assets") && !resume)
    throw new Error("No matching fully verified asset checkpoint");
  if (resume) {
    const names = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage
        .from("book-package-assets")
        .list(fingerprint, { limit: 1000, offset });
      if (error) throw error;
      data.forEach((a) => names.add(a.name));
      if (data.length < 1000) break;
    }
    if (assets.slice(0, verified.count).some((a) => !names.has(`${a.storageHash}.png`)))
      throw new Error("Previously verified asset is missing");
    complete = verified.count;
    console.log(
      `Resumed ${complete} previously hash-verified assets; all checkpointed objects still present.`,
    );
  }
  const batchSize = 16;
  for (let offset = complete; offset < assets.length; offset += batchSize) {
    await Promise.all(
      assets.slice(offset, offset + batchSize).map(async (a) => {
        const path = `${fingerprint}/${a.storageHash}.png`,
          raw = await readFile(join(folder, a.source));
        let upload;
        for (let attempt = 0; attempt < 5; attempt++) {
          upload = await client.storage
            .from("book-package-assets")
            .upload(path, raw, { contentType: "image/png", upsert: true });
          if (!upload.error) break;
          if (!/HTTP (408|429|500|502|503|504)/i.test(upload.error.message) || attempt === 4)
            throw new Error(`Asset upload failed: ${a.source}: ${upload.error.message}`);
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
        if (process.argv.includes("--verify-assets")) {
          let download;
          for (let attempt = 0; attempt < 5; attempt++) {
            download = await client.storage
              .from("book-package-assets")
              .download(path);
            if (!download.error) break;
            if (!/HTTP (408|429|500|502|503|504)/i.test(download.error.message) || attempt === 4)
              throw new Error(`Asset download failed: ${a.source}: ${download.error.message}`);
            await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          }
          if (createHash("sha256")
            .update(Buffer.from(await download.data.arrayBuffer()))
            .digest("hex") !== a.sha256)
            throw new Error(`Stored asset verification failed: ${a.source}`);
        }
        complete++;
      }),
    );
    if (complete % 120 < batchSize || complete === assets.length)
      console.log(
        `Assets stored${process.argv.includes("--verify-assets") ? " and verified" : ""}: ${complete}/${assets.length}`,
      );
    if (process.argv.includes("--verify-assets"))
      await writeFile(
        verificationFile,
        JSON.stringify({
          fingerprint,
          indexHash,
          count: complete,
          sources: assets.slice(0, complete).map((a) => a.source),
        }) + "\n",
        { mode: 0o600 },
      );
  }
  if (process.argv.includes("--verify-assets") || resume)
    await writeFile(
      verificationFile,
      JSON.stringify({ fingerprint, indexHash, count: complete }) + "\n",
    );
  const serialized = JSON.stringify(
    packageData(book, manifest, review, provenance, assets, prepared),
  );
  const chunks = [];
  for (let start = 0, part = 0; start < serialized.length; part++) {
    let end = Math.min(start + 200000, serialized.length);
    if (end < serialized.length && /[\uD800-\uDBFF]/.test(serialized[end - 1]))
      end++;
    chunks.push({
      fingerprint,
      part_no: part,
      data: serialized.slice(start, end),
    });
    start = end;
  }
  // Each request stays under transport limits; only the final SQL publishes.
  const { error: cleanError } = await client
    .from("book_package_import_chunks")
    .delete()
    .eq("fingerprint", fingerprint);
  if (cleanError) throw cleanError;
  for (const chunk of chunks) {
    const { error } = await client
      .from("book_package_import_chunks")
      .insert(chunk);
    if (error) throw error;
  }
  await writeFile(
    join(folder, "import.sql"),
    packageSql(book, manifest, review, provenance, assets, prepared, true),
    { mode: 0o600 },
  );
  const { stdout: result } = await run(
    "npx",
    [
      "--offline",
      "supabase@2.119.0",
      "db",
      "query",
      "--linked",
      "--file",
      join(folder, "import.sql"),
      "--output",
      "json",
    ],
    { maxBuffer: 2 * 1024 * 1024, timeout: 120000 },
  );
  const outcome = JSON.parse(result.slice(result.indexOf("{"))).rows[0];
  if (
    outcome.questions !== prepared.report.imported.questions ||
    !outcome.published
  )
    throw new Error("Database import verification failed");
  prepared.report.database = outcome;
  prepared.report.assetsVerified =
    process.argv.includes("--verify-assets") || resume ? complete : 0;
  await writeFile(
    join(folder, "report.json"),
    JSON.stringify(prepared.report, null, 2) + "\n",
  );
  await writeFile(
    prepared.report.slug === "algebra-official-sat-question-bank"
      ? "docs/algebra-package-import-report.json"
      : `docs/${prepared.report.slug}-package-import-report.json`,
    JSON.stringify(prepared.report, null, 2) + "\n",
  );
  console.log(JSON.stringify(outcome));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
