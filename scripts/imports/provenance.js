export function attachProvenance(topics, evidence, source, version) {
  const byIndex = new Map(
    evidence
      .filter((e) => e.question_index !== undefined)
      .map((e) => [e.question_index, e]),
  );
  let index = 0;
  function walk(rows) {
    for (const t of rows) {
      for (const q of t.questions || []) {
        const e = byIndex.get(index++);
        if (e?.page) {
          q.source_page = e.page;
          q.import_metadata = {
            source_file: source,
            parser_version: version,
            extraction_method: e.method || "embedded_bbox",
            source_number: e.number,
            source_section: e.set || e.skill || t.title,
            review_required: true,
          };
        }
      }
      walk(t.children || []);
    }
  }
  walk(topics);
}
