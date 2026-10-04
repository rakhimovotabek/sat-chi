// Diagnostic metadata only. No source passages or question text in tracked reports.
import { readFile } from "node:fs/promises";
import { atomicJson } from "./source-files.js";
const notes = {
  "800 Challenge - Hard Math 150 (Part 1) - SAT Math Club.pdf":
    "Two-column questions and later solutions; diagonal watermark interleaves words. Fractions/exponents and numeric answers need rendered-region review before deterministic key mapping.",
  "Apostrophe.pdf":
    "Rules-to-results adapter found 22 explicitly keyed questions. All require source underlining/formatting not retained as text; excluded until annotated source rendering is reviewed.",
  "College panda MATH.pdf":
    "All 413 pages are scanned. OCR beginning/middle/end shows corrupted radicals, exponents and math options despite high mean word confidence. Chapter-local exercises/solutions need manual region and answer mapping.",
  "Dual Texts.pdf":
    "Four scanned pages: two printed paired-passage questions and handwritten notes. All pages OCR sampled; handwriting confidence is low. No authoritative answer key; annotations must not become answers.",
  "Erica writing book.pdf":
    "Noisy embedded OCR/circled option glyphs, chapter-local exercises and separated explanations. Underlines and glyph labels require source-specific rendering and chapter key mapping.",
  "Erica-Reading-Digital-SAT.pdf":
    "Mixed lessons/exercises with circled option glyphs and noisy embedded OCR. Local numbering and chapter-scoped solutions require reviewed passage/answer linkage.",
  "HardBook 2.0.pdf":
    "Internally Math Hard Book: four SAT Math domains, two columns, chapter-local answer tables, MCQ and numeric responses. Vector formulas/figures lose essential meaning in text.",
  "MathBook 2.0 Ready.pdf":
    "Repeated topic-local numbers, topic answer tables, MCQ and open answers. Embedded text omits vector fractions, exponents and diagrams; few raster images does not mean text is sufficient.",
  "Mathbook 3.0.pdf":
    "Topic-local keys and vector math/figures. Final area/volume section has a question/key mismatch and an unkeyed final question; unresolved source inconsistency, no answers inferred.",
  "PrepPro Reading (2).pdf":
    "Legacy shared long passages and mixed exercise types. Font extraction replaces ligatures with =/5; chapter/practice key boundaries and shared passage references need manual correction.",
  "PrepPro Writing course.pdf":
    "Recovered only Chapters 12–13 practice: two-column transitions and full-width notes questions, explicit chapter-local keys. Remaining grammar/typed exercises and lesson examples have unsupported structures; not a complete book import.",
  "PrepPros Complete Guide Math.pdf":
    "36 chapters of MCQ/numeric problems and separately keyed solutions. Vector formulas, tables/illustrations and watermark contamination require rendered math-region review.",
  "PrepProsAdvanced MATH(2ndEdition).pdf":
    "Actual questions are scanned; embedded text is only a watermark. OCR samples corrupt squared notation, answer numbers and decimal/fraction/range keys. All OCR requires manual comparison to images.",
  "Pronoun Reference.pdf":
    "Rules-to-results adapter found 27 explicitly keyed questions; all rely on source underlining/visual formatting absent in extracted text.",
  "SATakror.pdf":
    "Source-specific unequal-column reader preserves physical pages, original passages and complete 101-answer table. Missing vector blanks, underlines and paired passages quarantined; readable MCQs remain draft.",
  "SAToplam Reading Book.pdf":
    "Section-specific answer tables, stacked passage/question regions and original numbering retained. Missing vector blanks, underline/paired-text dependencies, crossing/gapped text and repeated region markers quarantined. Review-region count includes duplicate markers, not extra source questions.",
  "SAToplam Writing Book.pdf":
    "Scoped Boundaries/Form-structure/Transitions/Notes answer tables. Missing vector blanks and truncated source fragments quarantined; transitions/notes recovered as draft.",
  "Transition (2).pdf":
    "Three-page transition reference charts only; no questions or answer key. Unsupported for question ingestion; retained source available for manual reference-content review.",
};
const investigations = JSON.parse(
    await readFile("local-imports/source-investigation.json", "utf8"),
  ),
  manifest = JSON.parse(await readFile("local-imports/manifest.json", "utf8"));
for (const r of manifest) {
  const i = investigations.find((i) => i.fingerprint === r.fingerprint);
  if (!i) continue;
  r.investigation = {
    ...i,
    diagnosis: notes[r.source_file],
    sample_check:
      "Beginning/middle/end embedded text inspected; scanned sources OCR sampled and quarantined.",
    review_inventory: "Candidate markers are not a verified source inventory.",
  };
  if (!notes[r.source_file]) throw new Error("Missing source diagnosis");
  if (r.source_file === "Transition (2).pdf")
    r.resolution_status = "unsupported";
  else if (r.intermediate_file && r.parser_version.startsWith("2026-10-04."))
    r.resolution_status = "partial";
  else r.resolution_status = "manual";
  if (r.source_file === "HardBook 2.0.pdf") r.category = "Math";
  // Reconciliation changes must be recorded remotely even for previously reviewed checkpoints.
  delete r.applied_parser_version;
  await atomicJson(`local-imports/${r.fingerprint}.report.json`, r);
}
await atomicJson("local-imports/manifest.json", manifest);
console.log(
  `Reconciled ${investigations.length} unresolved sources with explicit diagnoses.`,
);
