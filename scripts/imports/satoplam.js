import { validateQuestion } from "../../src/features/books/import-validation.js";
import { readableLines } from "./satakror.js";
export const SAToplamVersion = "2026-10-04.satoplam1";
export function parseSAToplam(text, regions, source) {
  const pages = text.split("\f"),
    topics = [],
    review = [],
    evidence = [],
    errors = [];
  let from = 0,
    total = 0,
    index = 0;
  for (let p = 0; p < pages.length; p++) {
    const heading = pages[p].match(/(?:^|\n)\s*Answers:\s*([^\n]+)/);
    if (!heading) continue;
    let end = p;
    while (
      end + 1 < pages.length &&
      /Number\s+Answer/.test(pages[end + 1]) &&
      !/Answers:/.test(pages[end + 1])
    )
      end++;
    const keys = new Map();
    for (const m of pages
      .slice(p, end + 1)
      .join("\n")
      .matchAll(/\b(\d+)\s+([A-D])\b/g)) {
      if (keys.has(Number(m[1])))
        errors.push(`${heading[1]}: repeated key ${m[1]}`);
      keys.set(Number(m[1]), m[2].charCodeAt(0) - 65);
    }
    const title = heading[1].trim(),
      questions = [],
      candidates = regions.slice(from, p).flatMap((x) => x.regions),
      seen = new Set();
    total += keys.size;
    for (const region of candidates) {
      const number = region.number;
      if (!keys.has(number)) continue;
      const [left, right] = region.columns,
        starts = [...right.matchAll(/^([A-D])\)\s*/gm)];
      const q = {
        type: "mcq",
        question: readableLines(
          right.slice(0, starts[0]?.index ?? right.length),
        ),
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
        domain: /Boundaries|Form, Structure/i.test(title)
          ? "Standard English Conventions"
          : /Transition|Rhetorical/i.test(title)
            ? "Expression of Ideas"
            : /Main Idea|Inference|Evidence|Detail/i.test(title)
              ? "Information and Ideas"
              : /Purpose|Structure|Context|Synonym|Cross.Text/i.test(title)
                ? "Craft and Structure"
                : "",
        skill: title,
        source,
      };
      const reasons = [];
      if (candidates.filter((c) => c.number === number).length > 1)
        reasons.push(
          "Multiple regions share this source number; all quarantined",
        );
      if (seen.has(number))
        reasons.push("Repeated question region in this section");
      seen.add(number);
      if (starts.map((m) => m[1]).join("") !== "ABCD")
        reasons.push("Incomplete labeled choices or cross-page continuation");
      if (!q.passage || q.passage.length < 25)
        reasons.push("Missing or truncated source passage");
      if (
        !/^(Which|Based on|According to|The student|What|How)\b/.test(
          q.question,
        )
      )
        reasons.push("Question-region boundary requires source review");
      if (region.gaps?.length)
        reasons.push(
          "Unrepresented inline space may contain a vector blank or missing glyph",
        );
      if (region.crossing.length) reasons.push("Text crosses column boundary");
      if (
        /underlin|\b(?:table|graph|figure|chart)\b/i.test(q.question) ||
        /Cross.Text|Underlined|Synonym/i.test(title)
      )
        reasons.push(
          "Essential visual/underline or paired-text structure requires review",
        );
      if (/completes the text/.test(q.question) && !/_+/.test(q.passage))
        reasons.push(
          "Source blank is a vector underline and is not present in embedded text",
        );
      if (
        /(?:[•●]\s+is named|At by inches|\bby inches\b)/i.test(
          q.passage + " " + q.options.join(" "),
        )
      )
        reasons.push(
          "Source fragment is missing a subject or numeric dimensions",
        );
      if (
        new Set(q.options.map((v) => v.toLowerCase())).size !== q.options.length
      )
        reasons.push("Duplicate options");
      reasons.push(...validateQuestion(q));
      if (reasons.length)
        review.push({
          set: title,
          number,
          page: region.page,
          status: "NEEDS_REVIEW",
          reasons,
          candidate: { ...q, source_page: region.page, source_number: number },
        });
      else {
        questions.push(q);
        evidence.push({
          set: title,
          number,
          page: region.page,
          question_index: index++,
          method: "embedded_bbox",
          parser: SAToplamVersion,
        });
      }
    }
    for (const number of keys.keys())
      if (!seen.has(number))
        review.push({
          set: title,
          number,
          status: "NEEDS_REVIEW",
          reasons: ["Printed key exists but question region did not resolve"],
        });
    if (questions.length) topics.push({ title, questions });
    from = end + 1;
    p = end;
  }
  if (!topics.length) errors.push("No complete source sections recovered");
  return {
    payload: {
      schemaVersion: 1,
      kind: "book",
      book: {
        title: source.replace(/\.pdf$/i, ""),
        category: "Reading & Writing",
        description: `Source: ${source}. Section boundaries and explicit number/answer tables preserved. Source PDF is private.`,
        published: false,
      },
      topics,
    },
    errors,
    review,
    evidence,
    detected_questions: total,
  };
}
