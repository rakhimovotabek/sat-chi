import { validateImport } from "../../src/features/books/import-validation.js";
export function parseGrammar(text, source) {
  const clean = text
    .replace(/\f/g, "\n")
    .split("\n")
    .filter((l) => !/Ultimate Grammar Book.*Page\s+\d+/i.test(l))
    .join("\n");
  const practice = clean
    .split(/\nPractice Section\s*\n/)[1]
    ?.split(/\nAnswer Key\s*\n/)[0];
  const keysText = clean
    .split(/\nAnswer Key\s*\n/)[1]
    ?.split(/\nWorked Solutions\s*\n/)[0];
  if (!practice || !keysText)
    throw new Error("No unambiguous practice/answer-key boundaries.");
  const keys = new Map(
    [...keysText.matchAll(/\b(\d+)\.\s*([A-D])\b/g)].map((m) => [
      Number(m[1]),
      m[2],
    ]),
  );
  const solutions = new Map(
    [
      ...clean.matchAll(
        /\bQ(\d+) Answer:\s*([A-D])\.\s*([\s\S]*?)(?=\bQ\d+ Answer:|\nYou Now Know the Rules\.|$)/g,
      ),
    ].map((m) => [Number(m[1]), { answer: m[2], explanation: m[3].trim() }]),
  );
  const matches = [
    ...practice.matchAll(/^\s*(\d+)\s+([A-Z][A-Z &—,.-]+)\s*$/gm),
  ];
  const topics = [],
    errors = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i],
      number = Number(m[1]),
      body = practice
        .slice(m.index + m[0].length, matches[i + 1]?.index ?? practice.length)
        .trim();
    // Use explicit option boundaries, never infer an answer or difficulty.
    const starts = [...body.matchAll(/^\s*([A-D])\.\s*/gm)];
    const choices = starts.map((s, n) =>
      body
        .slice(s.index + s[0].length, starts[n + 1]?.index ?? body.length)
        .trim(),
    );
    const prompt = body.slice(0, starts[0]?.index ?? 0).trim();
    const split = prompt.search(/(?:Which choice|Which of the following)/);
    if (
      number !== i + 1 ||
      starts.map((s) => s[1]).join("") !== "ABCD" ||
      !keys.has(number) ||
      !solutions.has(number) ||
      keys.get(number) !== solutions.get(number).answer ||
      split < 0
    ) {
      errors.push(
        `Question ${number}: numbering, choices, answer or prompt is ambiguous.`,
      );
      continue;
    }
    const skill = m[2].trim();
    let topic = topics.find((t) => t.title === skill);
    if (!topic) topics.push((topic = { title: skill, questions: [] }));
    topic.questions.push({
      type: "mcq",
      difficulty: "unclassified",
      question: prompt.slice(split),
      passage: prompt.slice(0, split).trim(),
      options: choices,
      correctAnswer: keys.get(number).charCodeAt(0) - 65,
      explanation: solutions.get(number).explanation,
      domain:
        skill === "TRANSITIONS"
          ? "Expression of Ideas"
          : "Standard English Conventions",
      skill,
      source,
    });
  }
  if (matches.length !== 41 || keys.size !== 41 || solutions.size !== 41)
    errors.push("Expected 41 complete questions, keys and solutions.");
  const payload = {
    schemaVersion: 1,
    kind: "book",
    book: {
      title: "Ultimate Grammar Book",
      category: "Reading & Writing",
      description: `Source: ${source}. Locally supplied material; no source PDF is distributed. Difficulty is not classified.`,
      published: false,
    },
    topics,
  };
  return { payload, errors: [...errors, ...validateImport(payload).errors] };
}
export function inspectText(text) {
  const topics = [
    ...new Set(
      [
        ...text.matchAll(
          /^\s*(?:CHAPTER\s+\d+|Set\s+\d+|Chapter\s+\d+)[^\n]*$/gm,
        ),
      ].map((m) => m[0].trim()),
    ),
  ].slice(0, 200);
  return {
    topics,
    detectedQuestions: [...text.matchAll(/^\s*(?:Q\d+|\d+[.)])\s+/gm)].length,
    sparse:
      text.replace(/\s/g, "").length / Math.max(1, text.split("\f").length) <
      200,
  };
}
