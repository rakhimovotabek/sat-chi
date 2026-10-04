// Trusted CLI imports may contain 2,000 items; browser JSON limits remain 500.
import { validateImport } from "../../src/features/books/import-validation.js";
export function validateLocalImport(payload) {
  const copy = structuredClone(payload),
    extra = [];
  const walk = (topics) => {
    for (const t of topics || []) {
      for (const q of t.questions || []) {
        if (
          q.source_page !== undefined &&
          (!Number.isInteger(q.source_page) ||
            q.source_page < 1 ||
            q.source_page > 100000)
        )
          extra.push("Invalid physical source page");
        if (
          q.import_metadata !== undefined &&
          (typeof q.import_metadata !== "object" ||
            Array.isArray(q.import_metadata) ||
            q.import_metadata === null ||
            JSON.stringify(q.import_metadata).length > 4000)
        )
          extra.push("Invalid import metadata");
        delete q.source_page;
        delete q.import_metadata;
      }
      walk(t.children);
    }
  };
  walk(copy?.topics);
  const result = validateImport(copy);
  result.errors = result.errors.filter(
    (e) => e !== "Import at most 500 questions at a time.",
  );
  if (result.questions > 2000)
    result.errors.push("Trusted local import limit is 2,000 questions.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 4000000)
    result.errors.push("Import must be smaller than 4 MB.");
  result.errors.push(...extra);
  return result;
}
