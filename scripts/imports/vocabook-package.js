import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { privateStorageClient } from "./private-storage.js";

const run = promisify(execFile);
const archive = process.argv.find((arg) => arg.endsWith(".zip"));
if (!archive)
  throw new Error(
    "Usage: node scripts/imports/vocabook-package.js package.zip [--apply]",
  );
const zipBytes = await readFile(archive);
const fingerprint = createHash("sha256").update(zipBytes).digest("hex");
const readZipJson = async (filename) => {
  const { stdout } = await run("unzip", ["-p", archive, `*/${filename}`], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout);
};
const [source, manifest, review] = await Promise.all([
  readZipJson("book.json"),
  readZipJson("manifest.json"),
  readZipJson("review.json"),
]);
if (source.contentType !== "vocabulary")
  throw new Error("ZIP is not a vocabulary package");
const chapters = source.chapters || [];
const skipped = [];
const sets = chapters.map((chapter, index) => {
  const topics = chapter.topics || [];
  const wordTopic = topics.find((topic) => topic.id.endsWith("_vocabulary"));
  const questions = topics.flatMap((topic) => topic.questions || []);
  if (!wordTopic || wordTopic.questions.length !== 25)
    throw new Error(`Invalid vocabulary topic in ${chapter.id}`);
  const words = wordTopic.questions.map((question, position) => {
    const word = question.vocabulary;
    if (!word?.word || !word.meaning || !word.example)
      throw new Error(`Missing structured word fields in ${question.id}`);
    const relation = word.relatedWords
      ? `${word.relatedWordsType === "synonym" ? "Synonyms" : "Antonyms"}: ${word.relatedWords}`
      : "";
    return {
      word: word.word,
      definition: word.meaning,
      example: word.example,
      synonym: word.relatedWordsType === "synonym" ? word.relatedWords : "",
      antonym: word.relatedWordsType === "antonym" ? word.relatedWords : "",
      notes: relation,
      source_page: question.sourcePage,
      source_metadata: {
        sourceId: question.id,
        questionNumber: question.questionNumber,
        answerFormat: question.answerFormat,
        explanation: question.explanation,
        vocabulary: word,
      },
    };
  });
  const contextQuestions = questions
    .filter((question) => question.type === "mcq")
    .map((question) => {
      const answer = "ABCD".indexOf(question.correctAnswer);
      if (
        question.options?.length !== 4 ||
        question.options.some((option) => !option.text?.trim()) ||
        answer < 0 ||
        question.needsReview
      ) {
        skipped.push({
          id: question.id,
          reason: question.needsReview
            ? question.reviewReason || "Flagged for source review"
            : "Invalid choices or missing source answer text",
        });
        return null;
      }
      return {
        sourceId: question.id,
        questionNumber: question.questionNumber,
        question: question.questionText,
        questionType: "sentence_completion",
        sourcePage:
          question.sourcePageRange?.[0] ?? question.sourcePage ?? null,
        options: question.options.map((option) => option.text),
        correctAnswer: answer,
        explanation: question.explanation || "",
        source_metadata: question,
      };
    })
    .filter(Boolean);
  const passage = chapter.readingPassage;
  if (
    !passage?.title ||
    !passage.text ||
    questions.filter((question) => question.type === "mcq").length !== 10
  )
    throw new Error(`Missing passage or context questions in ${chapter.id}`);
  return {
    source_id: chapter.id,
    title: chapter.title,
    position: index,
    source_set: chapter.setNumber,
    source_page: chapter.sourcePages?.[0] ?? null,
    collection: chapter.section,
    source_metadata: {
      id: chapter.id,
      section: chapter.section,
      setNumber: chapter.setNumber,
      sourcePages: chapter.sourcePages,
      readingPassage: passage,
      topicIds: topics.map((topic) => topic.id),
      sourceQuestions: questions.filter((question) => question.type === "mcq"),
    },
    passageTitle: passage.title,
    passage: passage.text,
    words,
    questions: contextQuestions,
  };
});
const expected = {
  sets: chapters.length,
  words: sets.reduce((total, set) => total + set.words.length, 0),
  passages: sets.filter((set) => set.passage).length,
  questions: sets.reduce((total, set) => total + set.questions.length, 0),
  sourceQuestions: chapters.reduce(
    (total, chapter) =>
      total +
      chapter.topics
        .flatMap((topic) => topic.questions || [])
        .filter((question) => question.type === "mcq").length,
    0,
  ),
};
for (const [key, value] of Object.entries({
  sets: manifest.sets,
  words: manifest.vocabularyWords,
  passages: manifest.readingPassages,
  sourceQuestions: manifest.questions - manifest.vocabularyQuestions,
}))
  if (expected[key] !== value) throw new Error(`Manifest ${key} mismatch`);
if ((review.unresolvedExtractionIssues || []).length)
  throw new Error("Vocabook package has unresolved review issues");
const payload = {
  fingerprint,
  expected: {
    sets: expected.sets,
    words: expected.words,
    passages: expected.passages,
    questions: expected.questions,
  },
  title: source.book.title,
  source: "Vocabook 4 by SATashkent",
  description: `${source.book.edition} · ${source.book.authors.join(", ")} · ${expected.sets} sets · ${expected.words} words · ${expected.questions} read-in-context questions.`,
  source_metadata: {
    slug: source.book.slug,
    title: source.book.title,
    publisher: source.book.publisher,
    edition: source.book.edition,
    authors: source.book.authors,
    sourceFile: source.book.sourceFile,
    totalPages: source.book.totalPages,
    sections: source.book.sections,
    sourceNotes: source.sourceNotes,
    manifest,
    review,
    skipped,
  },
  sets,
};
const report = {
  title: payload.title,
  fingerprint,
  expected: {
    ...expected,
    vocabularyWords: expected.words,
    contextQuestions: expected.questions,
    sourceQuestions: expected.sourceQuestions,
  },
  imported: null,
  skipped,
};
console.log(JSON.stringify(report));
if (!process.argv.includes("--apply")) process.exit(0);

const directory = "local-imports/vocabook-4-import";
await mkdir(directory, { recursive: true, mode: 0o700 });
const client = await privateStorageClient();
const { error: cleanupError } = await client
  .from("vocabulary_package_import_chunks")
  .delete()
  .eq("fingerprint", fingerprint);
if (cleanupError) throw cleanupError;
const serialized = JSON.stringify(payload);
const chunks = [];
for (let start = 0, part = 0; start < serialized.length; part++) {
  let end = Math.min(start + 100000, serialized.length);
  if (end < serialized.length && /[\uD800-\uDBFF]/.test(serialized[end - 1]))
    end++;
  chunks.push({
    fingerprint,
    part_no: part,
    data: serialized.slice(start, end),
  });
  start = end;
}
for (let offset = 0; offset < chunks.length; offset += 8) {
  const { error } = await client
    .from("vocabulary_package_import_chunks")
    .insert(chunks.slice(offset, offset + 8));
  if (error) throw error;
}
const sql = `select public.import_vocabulary_package('${fingerprint}');\n`;
const sqlFile = `${directory}/finalize.sql`;
await writeFile(sqlFile, sql, { mode: 0o600 });
const { stdout } = await run(
  "npx",
  [
    "--offline",
    "supabase@2.119.0",
    "db",
    "query",
    "--linked",
    "--file",
    sqlFile,
    "--output",
    "json",
  ],
  { maxBuffer: 1024 * 1024, timeout: 120000 },
);
const result = JSON.parse(stdout.slice(stdout.indexOf("{"))).rows[0]
  .import_vocabulary_package;
if (
  result.sets !== expected.sets ||
  result.words !== expected.words ||
  result.passages !== expected.passages ||
  result.questions !== expected.questions ||
  !result.published
)
  throw new Error("Vocabulary package import verification failed");
report.imported = result;
await writeFile(
  `${directory}/report.json`,
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(result));
