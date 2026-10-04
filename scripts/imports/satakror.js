import { validateQuestion } from "../../src/features/books/import-validation.js";
export const SATakrorVersion = "2026-10-04.satakror1";
// Normalize only deterministic PDF line-wrap artifacts; preserve all supplied words.
export const readableLines = (text) =>
  text
    .normalize("NFC")
    .replace(/([a-z])-[ \t]*\n(?=[a-z])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
export function parseSATakror(text, pages, source, imagePages = new Set()) {
  const keyText = text.split(/Answers to SATakror/)[1];
  if (!keyText) throw new Error("Missing SATakror key boundary");
  const keys = new Map();
  for (const m of keyText.matchAll(/\b(\d+)\.\s*([A-D])\b/g)) {
    const number = Number(m[1]);
    if (keys.has(number)) throw new Error("Repeated SATakror key");
    keys.set(number, m[2].charCodeAt(0) - 65);
  }
  if (
    keys.size !== 101 ||
    Array.from({ length: 101 }, (_, i) => i + 1).some((n) => !keys.has(n))
  )
    throw new Error("Expected complete explicit 101-answer SATakror key");
  const questions = [],
    review = [],
    evidence = [],
    seen = new Set();
  for (const page of pages) {
    if (!page.question_number) continue;
    const number = page.question_number,
      reasons = [...(page.warnings || [])];
    seen.add(number);
    const [left, right] = page.columns,
      starts = [...right.matchAll(/^([A-D])\)\s*/gm)];
    const rawPrompt = right
      .slice(0, starts[0]?.index ?? right.length)
      .replace(/^\d+\)\s*/, "");
    const q = {
      type: "mcq",
      question: readableLines(rawPrompt),
      passage: readableLines(left),
      options: starts.map((m, i) =>
        readableLines(
          right.slice(
            m.index + m[0].length,
            starts[i + 1]?.index ?? right.length,
          ),
        ),
      ),
      correctAnswer: keys.get(number),
      difficulty: "unclassified",
      domain: "",
      skill: "",
      source,
    };
    if (starts.map((m) => m[1]).join("") !== "ABCD")
      reasons.push("Expected four complete labeled choices");
    if (!q.passage) reasons.push("Passage unavailable");
    if (/completes the text/.test(q.question) && !/_+/.test(q.passage))
      reasons.push("Source blank is not present in embedded text");
    if (page.crossing?.length)
      reasons.push("Text crosses detected paragraph/question boundary");
    if (
      /underlin|\b(?:graph|table|figure)\b/i.test(q.question) ||
      /\bText [12]\b/.test(q.passage) ||
      imagePages.has(page.page)
    )
      reasons.push(
        "Essential underline, paired-text or visual needs source review",
      );
    reasons.push(...validateQuestion(q));
    const candidate = { ...q, source_page: page.page, source_number: number };
    if (reasons.length)
      review.push({
        number,
        page: page.page,
        status: "NEEDS_REVIEW",
        reasons,
        candidate,
      });
    else {
      questions.push(q);
      evidence.push({
        number,
        page: page.page,
        question_index: questions.length - 1,
        method: "embedded_bbox",
        parser: SATakrorVersion,
      });
    }
  }
  for (const number of keys.keys())
    if (!seen.has(number))
      review.push({
        number,
        page: number + 1,
        status: "NEEDS_REVIEW",
        reasons: ["Key exists but source question region did not resolve"],
      });
  return {
    payload: {
      schemaVersion: 1,
      kind: "book",
      book: {
        title: "SATakror",
        category: "Reading & Writing",
        description: `Source: ${source}. Original passages and explicit printed keys; physical PDF pages retained in import evidence.`,
        published: false,
      },
      topics: [{ title: "Reading practice", questions }],
    },
    errors: [],
    review,
    evidence,
    detected_questions: keys.size,
  };
}
