import { readableLines } from "./satakror.js";
import { validateQuestion } from "../../src/features/books/import-validation.js";
export const PrepProVersion = "2026-10-04.preppro1";
const clean = (t) =>
  t
    .replace(/^.*PrepPros SAT Writing Course.*$/gm, "")
    .replace(/^\s*-\s*\d*\s*-?\s*$/gm, "");
export function parsePrepProWriting(text, columns, source) {
  const pages = text.split("\f"),
    topics = [],
    review = [],
    evidence = [];
  let index = 0;
  for (const { chapter, start, end, total, title } of [
    { chapter: 12, start: 122, end: 127, total: 35, title: "Transitions" },
    {
      chapter: 13,
      start: 136,
      end: 144,
      total: 18,
      title: "Rhetorical synthesis",
    },
  ]) {
    const keySection = pages
      .slice(144)
      .join("\n")
      .split(`Chapter ${chapter} Practice (pp.`)[1]
      ?.split(/Chapter \d+:/)[0];
    if (!keySection)
      throw new Error(`Missing explicit Chapter ${chapter} practice key`);
    const keys = new Map();
    for (const m of keySection.matchAll(/\b(\d+)\.\s*([A-D])\b/g)) {
      if (keys.has(+m[1])) throw new Error("Repeated chapter key");
      keys.set(+m[1], m[2].charCodeAt(0) - 65);
    }
    if (
      keys.size !== total ||
      Array.from({ length: total }, (_, i) => i + 1).some((n) => !keys.has(n))
    )
      throw new Error("Incomplete chapter key");
    const questions = [],
      seen = new Set(),
      counts = new Map();
    const blocks = Array.from({ length: end - start + 1 }, (_, i) => {
      const p = start + i,
        body = clean(
          chapter === 12 ? columns[p - 1].columns.join("\n") : pages[p - 1],
        );
      const starts = [
        ...body.matchAll(chapter === 12 ? /^\s*(\d+)\.\s+/gm : /^(\d+)\.\s+/gm),
      ];
      for (const m of starts) counts.set(+m[1], (counts.get(+m[1]) || 0) + 1);
      return { p, body, starts };
    });
    for (const { p, body, starts } of blocks) {
      for (let k = 0; k < starts.length; k++) {
        const number = +starts[k][1],
          raw = body.slice(
            starts[k].index + starts[k][0].length,
            starts[k + 1]?.index ?? body.length,
          ),
          opts = [...raw.matchAll(/^\s*([A-D])\)\s*/gm)];
        const before = raw.slice(0, opts[0]?.index ?? raw.length),
          boundary = before.search(
            chapter === 12 ? /Which choice/ : /The student/,
          );
        const q = {
          type: "mcq",
          question: readableLines(before.slice(Math.max(0, boundary))),
          passage: readableLines(before.slice(0, Math.max(0, boundary))),
          options: opts.map((m, i) =>
            readableLines(
              raw.slice(
                m.index + m[0].length,
                opts[i + 1]?.index ?? raw.length,
              ),
            ),
          ),
          correctAnswer: keys.get(number),
          difficulty: "unclassified",
          domain: "Expression of Ideas",
          skill: title,
          source,
        };
        const reasons = [];
        if (counts.get(number) > 1)
          reasons.push(
            "Repeated source question number; all matching regions quarantined",
          );
        seen.add(number);
        if (boundary < 0 || opts.map((m) => m[1]).join("") !== "ABCD")
          reasons.push("Incomplete passage/prompt/choices");
        if (chapter === 12 && !/_+/.test(q.passage))
          reasons.push("Source blank not recovered");
        if (
          chapter === 12 &&
          columns[p - 1].crossing.some((w) => !/^[\d-]+$/.test(w))
        )
          reasons.push("Text crosses column boundary");
        reasons.push(...validateQuestion(q));
        if (reasons.length)
          review.push({
            set: `Chapter ${chapter}`,
            number,
            page: p,
            status: "NEEDS_REVIEW",
            reasons,
            candidate: { ...q, source_page: p, source_number: number },
          });
        else {
          questions.push(q);
          evidence.push({
            set: `Chapter ${chapter}`,
            number,
            page: p,
            question_index: index++,
            method: chapter === 12 ? "embedded_bbox" : "embedded_layout",
            parser: PrepProVersion,
          });
        }
      }
    }
    for (const number of keys.keys())
      if (!seen.has(number))
        review.push({
          set: `Chapter ${chapter}`,
          number,
          status: "NEEDS_REVIEW",
          reasons: ["Printed key has no complete question region"],
        });
    topics.push({ title, questions });
  }
  return {
    payload: {
      schemaVersion: 1,
      kind: "book",
      book: {
        title: "PrepPro Writing course",
        category: "Reading & Writing",
        description: `Source: ${source}. Chapters 12–13 practice only; other source exercises require manual import.`,
        published: false,
      },
      topics,
    },
    review,
    evidence,
    errors: [],
    detected_questions: 53,
  };
}
