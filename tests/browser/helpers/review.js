import { contentFixture, sampleQuestion } from "./content.js";
export async function reviewFixture(page, role = "admin") {
  const base = await contentFixture(page, role),
    source = {
      id: "source-1",
      title: "Imported source",
      source_file: "Synthetic.pdf",
      source_type: "book",
      category: "Math",
      status: "imported",
      outcome: "partial",
      parser_version: "layout1",
      updated_at: "2026-10-04T10:00:00Z",
      question_count: 1,
      word_count: 0,
      review_count: 2,
      warning_count: 1,
      detected_questions: 2,
      skipped_count: 1,
      imported_count: 1,
      warnings: ["Uncertain visual"],
      errors: [],
      review_progress: { pending: 2 },
      evidence_count: 1,
    };
  const items = [
      {
        id: "review-1",
        source_id: source.id,
        item_type: "question",
        entity_id: "question-1",
        source_page: 7,
        extraction_method: "embedded_bbox",
        warnings: [],
        status: "pending",
        updated_at: "2026-10-04T10:00:00Z",
        payload: { ...sampleQuestion, source: "Synthetic.pdf", source_page: 7 },
      },
      {
        id: "review-2",
        source_id: source.id,
        item_type: "question",
        entity_id: null,
        source_page: 8,
        extraction_method: "ocr",
        confidence: 62,
        warnings: ["OCR uncertain"],
        status: "pending",
        updated_at: "2026-10-04T10:00:00Z",
        payload: {
          ...sampleQuestion,
          question: "Which value completes the second equation?",
        },
      },
    ],
    audit = [];
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Expose-Headers": "content-range",
  };
  await page.route(
    /\/rest\/v1\/(rpc\/(content_review_\w+|update_content_review|add_source_review_question)|content_review_audit|import_runs)(\?|$)/,
    async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        name = u.pathname.split("/").pop(),
        b = req.postDataJSON() || {};
      const json = (data, status = 200) =>
        route.fulfill({
          status,
          headers,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      base.requests.push({ path: u.pathname, body: b });
      if (role !== "admin")
        return json({ message: "Administrator access required" }, 403);
      if (name === "content_review_overview")
        return json({
          sources: 1,
          questions: 1,
          words: 0,
          sets: 0,
          passages: 0,
          exercises: 0,
          awaiting_review: items.filter((r) =>
            ["pending", "deferred"].includes(r.status),
          ).length,
          question_review: 2,
          word_review: 0,
          duplicates: items.filter((r) => r.status === "duplicate").length,
          warnings: 1,
          outcomes: { partial: 1 },
        });
      if (name === "content_review_sources")
        return json({ rows: [source], total: 1 });
      if (name === "content_review_source") return json(source);
      if (name === "content_review_queue") {
        const rows = items
          .filter(
            (r) =>
              (!b.p_status || r.status === b.p_status) &&
              (!b.p_warning ||
                r.warnings
                  .join()
                  .toLowerCase()
                  .includes(b.p_warning.toLowerCase())) &&
              (!b.p_catalog || r.entity_id) &&
              (!b.p_type || r.item_type === b.p_type) &&
              (!b.p_search ||
                r.payload.question
                  .toLowerCase()
                  .includes(b.p_search.toLowerCase())),
          )
          .map((r) => ({
            ...r,
            label: r.payload.question,
            source_title: source.title,
          }));
        return json({ rows, total: rows.length });
      }
      if (name === "content_review_detail")
        return json({
          ...items.find((r) => r.id === b.p_id),
          source: source.source_file,
          parser_version: source.parser_version,
        });
      if (name === "add_source_review_question") {
        const id = "manual-" + items.length;
        items.push({
          id,
          source_id: source.id,
          item_type: "question",
          entity_id: null,
          source_page: b.p_page,
          extraction_method: "manual",
          warnings: ["Manually transcribed source"],
          status: "pending",
          updated_at: new Date().toISOString(),
          payload: b.p_payload,
        });
        return json(id);
      }
      if (name === "update_content_review") {
        const r = items.find((r) => r.id === b.p_id);
        if (b.p_action === "edit") {
          r.payload = { ...b.p_payload };
          r.source_page = b.p_payload.source_page || r.source_page;
        }
        r.status = {
          edit: "pending",
          approve: "approved",
          reject: "rejected",
          duplicate: "duplicate",
          defer: "deferred",
        }[b.p_action];
        r.note = b.p_note;
        r.updated_at = new Date().toISOString();
        audit.push({
          id: audit.length + 1,
          item_id: r.id,
          action: b.p_action,
          actor: "admin-fixture",
          happened_at: r.updated_at,
          import_jobs: source,
          before_data: { status: "pending" },
          after_data: { note: b.p_note },
        });
        return json(r.id);
      }
      if (name === "import_runs")
        return route.fulfill({
          headers: { ...headers, "content-range": "0-0/1" },
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: 1,
              source_id: source.id,
              recorded_at: source.updated_at,
              parser_version: "layout1",
              status: "imported",
              imported_count: 1,
              skipped_count: 1,
              warnings: [],
              errors: [],
              history_origin: "reconciled_latest_checkpoint",
              import_jobs: source,
            },
          ]),
        });
      if (name === "content_review_audit")
        return route.fulfill({
          headers: {
            ...headers,
            "content-range": `0-${audit.length - 1}/${audit.length}`,
          },
          contentType: "application/json",
          body: JSON.stringify(audit),
        });
      return json(null);
    },
  );
  return { base, source, items, audit };
}
