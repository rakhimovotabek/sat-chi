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

// Source-family adapter: explicit numbered exam headers in two columns, followed
// by a numbered answer key. No key is inferred from a question's wording.
export function parseRulesToResults(text, pages, source, imagePages = new Set()) {
  const keyStart = text.lastIndexOf('Answer Key');
  if (keyStart < 0 || !/Rules-To-Results/i.test(text)) return null;
  const keys = new Map(), errors = [], review = [], evidence = [];
  for (const m of text.slice(keyStart).matchAll(/\b(\d+)\.\s*([A-D])\b/g)) {
    const number = Number(m[1]);
    if (keys.has(number)) errors.push(`Repeated answer key for question ${number}.`);
    keys.set(number, m[2]);
  }
  if (keys.size && [...keys.keys()].sort((a,b)=>a-b).some((n,i)=>n!==i+1)) errors.push('Answer-key numbering is incomplete.');
  if (!keys.size || errors.length) return { errors, review, evidence };
  const topic = source.replace(/\.pdf$/i, ''), questions = [], seen = new Set();
  const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const header = new RegExp(`^\\s*(\\d+)\\s+((?:${months})\\s+\\d{4}[^\\n]*)$`, 'gm');
  for (let p = 0; p < pages.length; p++) {
    if (/^\s*Answer Key\s*$/m.test(text.split('\f')[p]||'')) break;
    for (const column of pages[p].columns) {
      const clean = column.split('\n').filter(l => !/Rules-To-Results|telegram channel|www\.kernelsat|@kernel_sat/.test(l)).join('\n');
      const matches = [...clean.matchAll(header)];
      for (let i = 0; i < matches.length; i++) {
        const number = Number(matches[i][1]), body = clean.slice(matches[i].index + matches[i][0].length, matches[i+1]?.index ?? clean.length).trim();
        const options = [...body.matchAll(/^\s*([A-D])\.\s*/gm)];
        const prompt = body.slice(0, options[0]?.index ?? 0).trim();
        const split = prompt.search(/Which (?:choice|of the following)/);
        const reasons = [];
        if (seen.has(number)) reasons.push('Duplicate source question number.');
        seen.add(number);
        if (!keys.has(number)) reasons.push('No reliable matching answer key.');
        if (options.map(m=>m[1]).join('') !== 'ABCD' || split < 0) reasons.push('Question/choice boundaries require review.');
        if (imagePages.has(p+1) || /(?:graph|figure|table|underlined|\bText 1\b|\bText 2\b)/i.test(body)) reasons.push('Essential visual, underline or paired-text formatting requires review.');
        if (pages[p].crossing.some(w=>w.length>3 && body.includes(w))) reasons.push('Column boundary crosses source text.');
        if (reasons.length) { review.push({ number, page:p+1, status:'NEEDS_REVIEW', reasons }); continue; }
        questions.push({ type:'mcq', question:prompt.slice(split), passage:prompt.slice(0,split).trim(),
          options:options.map((m,n)=>body.slice(m.index+m[0].length,options[n+1]?.index??body.length).trim()),
          correctAnswer:keys.get(number).charCodeAt(0)-65, difficulty:'unclassified',
          domain: /transition/i.test(topic)?'Expression of Ideas': /Central Ideas/i.test(topic)?'Information and Ideas': /(?:Apostrophe|Verb|Pronoun|Punctuation|Tense|Modifier)/i.test(topic)?'Standard English Conventions':'',
          skill:topic, source });
        evidence.push({ number, page:p+1, exam:matches[i][2], question_index:questions.length-1 });
      }
    }
  }
  for (const number of keys.keys()) if (!seen.has(number)) review.push({ number,status:'NEEDS_REVIEW',reasons:['Key exists but question extraction did not match.'] });
  if (!questions.length) errors.push('No safely matched questions.');
  const ordered=questions.map((question,index)=>({question,evidence:evidence[index]})).sort((a,b)=>a.evidence.number-b.evidence.number);
  questions.splice(0,questions.length,...ordered.map(x=>x.question));
  evidence.splice(0,evidence.length,...ordered.map((x,i)=>({...x.evidence,question_index:i})));
  const payload={schemaVersion:1,kind:'book',book:{title:topic,category:'Reading & Writing',description:`Source: ${source}. Local Rules-To-Results material; source PDF remains private.`,published:false},topics:[{title:topic,questions}]};
  errors.push(...validateImport(payload).errors);
  return { payload,errors,review,evidence,detected_questions:keys.size };
}
