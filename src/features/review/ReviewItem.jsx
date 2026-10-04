import { useState, useRef, useEffect } from "react";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import QuestionForm from "../books/QuestionForm.jsx";
import { reviewRpc } from "./api.js";
const wordFields = [
  "word",
  "definition",
  "part_of_speech",
  "additional_definitions",
  "example",
  "synonym",
  "antonym",
  "translation",
  "notes",
];
export default function ReviewItem({
  id,
  onClose,
  onChanged,
  onPrevious,
  onNext,
}) {
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start" });
    panel.current?.focus({ preventScroll: true });
  }, [id]);
  const state = useContent(
    () => reviewRpc("content_review_detail", { p_id: id }),
    [id],
  );
  const [editing, setEditing] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState("");
  const r = state.data,
    p = r?.payload || {};
  async function act(action, payload = null) {
    setBusy(true);
    setError("");
    try {
      await reviewRpc("update_content_review", {
        p_id: id,
        p_action: action,
        p_payload: payload,
        p_note: note,
        p_version: r.updated_at,
      });
      setEditing(false);
      state.reload();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function keydown(e) {
      if (
        e.target.closest("input,textarea,select,button") ||
        editing ||
        busy ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevious?.();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext?.();
      }
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onPrevious, onNext, onClose, editing, busy]);
  const editable = ["question", "exercise", "word", "passage"].includes(
    r?.item_type,
  );
  return (
    <section
      className="card learning-panel review-detail"
      aria-label="Review item"
      ref={panel}
      tabIndex={-1}
    >
      <div className="section-heading">
        <h2>Review item</h2>
        <div className="button-row">
          {onPrevious && (
            <button
              className="button button-secondary button-compact"
              onClick={onPrevious}
            >
              Previous item
            </button>
          )}
          {onNext && (
            <button
              className="button button-secondary button-compact"
              onClick={onNext}
            >
              Next item
            </button>
          )}
        </div>
        <button
          className="button button-secondary button-compact"
          onClick={onClose}
        >
          Close item
        </button>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {r && (
        <>
          <p>
            <strong>{r.source}</strong> · {r.item_type} · {r.status}
          </p>
          <p className="empty-copy">
            PDF page {r.source_page || "unknown"} ·{" "}
            {r.extraction_method || "not recorded"} ·{" "}
            {p.import_metadata?.parser_version || r.parser_version}{" "}
            {r.confidence != null ? `· confidence ${r.confidence}/100` : ""}
          </p>
          {(r.warnings || []).map((w, i) => (
            <p className="form-notice" key={i}>
              {w}
            </p>
          ))}
          {r.note && <p>Last review note: {r.note}</p>}
          {!editing && (
            <>
              {r.item_type === "question" || r.item_type === "exercise" ? (
                <>
                  <p className="reading-text">{p.passage || p.stimulus}</p>
                  <h3>{p.question || "Prompt not recovered"}</h3>
                  <ol type="A">
                    {(p.options || []).map((o, i) => (
                      <li key={i}>{o || "Missing choice"}</li>
                    ))}
                  </ol>
                  <p>
                    {p.domain || "Domain unclassified"} ·{" "}
                    {p.skill || "Skill unclassified"}
                  </p>
                  <p>
                    Proposed correct answer:{" "}
                    {Number.isInteger(p.correctAnswer)
                      ? String.fromCharCode(65 + p.correctAnswer)
                      : "Not supplied — must be verified"}
                  </p>
                  {p.explanation && <p>{p.explanation}</p>}
                  {p.imageUrl && (
                    <a href={p.imageUrl} target="_blank" rel="noreferrer">
                      Source figure
                    </a>
                  )}
                </>
              ) : r.item_type === "word" ? (
                <>
                  <h3>{p.word}</h3>
                  {wordFields
                    .slice(1)
                    .filter((k) => p[k])
                    .map((k) => (
                      <p key={k}>
                        <strong>{k.replaceAll("_", " ")}: </strong>
                        {p[k]}
                      </p>
                    ))}
                </>
              ) : r.item_type === "passage" ? (
                <p className="reading-text">{p.passage}</p>
              ) : (
                <>
                  <p>
                    {p.diagnosis ||
                      p.reason ||
                      (p.reasons || []).join(" ") ||
                      "Question mapping or visual source review is required."}
                  </p>
                  <p>
                    Source PDF remains in Desktop/Books. Correct source regions
                    through the existing JSON import tools; no answer is
                    inferred.
                  </p>
                  {p.samples?.map((s) => (
                    <p key={s.page}>
                      Sample page {s.page}: {s.method}
                      {s.mean_confidence != null
                        ? ` · OCR ${s.mean_confidence}/100; ${s.low_confidence_words} low-confidence words`
                        : ""}
                    </p>
                  ))}
                </>
              )}
            </>
          )}
          {editing &&
          (r.item_type === "question" || r.item_type === "exercise") ? (
            <>
              <label>
                Physical source page
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                />
              </label>
              <QuestionForm
                requireAnswerSelection
                key={r.updated_at}
                question={{
                  question_text: p.question,
                  passage: p.passage,
                  stimulus: p.stimulus,
                  options: Array.from(
                    { length: 4 },
                    (_, i) => p.options?.[i] || "",
                  ),
                  question_answers: {
                    correct_answer: p.correctAnswer,
                    explanation: p.explanation,
                  },
                  domain: p.domain,
                  skill: p.skill,
                  difficulty: p.difficulty || "unclassified",
                  source: p.source || r.source,
                  image_url: p.imageUrl,
                  stimulus_table: p.table,
                }}
                onSubmitPayload={(payload) =>
                  act(
                    "edit",
                    r.item_type === "question"
                      ? {
                          ...payload,
                          ...(page || r.source_page
                            ? { source_page: Number(page || r.source_page) }
                            : {}),
                        }
                      : {
                          ...p,
                          ...payload,
                          ...(p.type ? { type: p.type } : {}),
                          ...(page || r.source_page
                            ? { sourcePage: Number(page || r.source_page) }
                            : {}),
                        },
                  )
                }
                onSaved={() => {}}
                onCancel={() => setEditing(false)}
              />
            </>
          ) : editing ? (
            <form
              className="learning-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const payload =
                  r.item_type === "word"
                    ? Object.fromEntries(
                        wordFields.map((k) => [k, String(data.get(k) || "")]),
                      )
                    : {
                        title: String(data.get("title") || ""),
                        passage: String(data.get("passage") || ""),
                        ...(data.get("source_page")
                          ? { source_page: Number(data.get("source_page")) }
                          : {}),
                      };
                if (r.item_type === "word" && p.source_page)
                  payload.source_page = p.source_page;
                act("edit", payload);
              }}
            >
              {(r.item_type === "word" ? wordFields : ["title", "passage"]).map(
                (k) => (
                  <label key={k}>
                    {k.replaceAll("_", " ")}
                    <textarea
                      name={k}
                      defaultValue={p[k] || ""}
                      required={["word", "definition", "passage"].includes(k)}
                      maxLength={k === "passage" ? 60000 : 10000}
                    />
                  </label>
                ),
              )}
              {r.item_type === "passage" && (
                <label>
                  Physical source page
                  <input
                    name="source_page"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={r.source_page || ""}
                  />
                </label>
              )}
              <div className="button-row">
                <button className="button button-primary" disabled={busy}>
                  Save correction
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  Cancel editing
                </button>
              </div>
            </form>
          ) : null}
          <label>
            Review note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="Describe source verification or your reason for rejecting."
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!editing && (
            <div className="button-row">
              {editable && (
                <>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => act("approve")}
                  >
                    Approve item
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => {
                      setPage(String(r.source_page || ""));
                      setEditing(true);
                    }}
                  >
                    Edit item
                  </button>
                </>
              )}
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => act("reject")}
              >
                Reject item
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => act("duplicate")}
              >
                Mark duplicate
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => act("defer")}
              >
                Skip for now
              </button>
            </div>
          )}
          <p className="empty-copy">
            Approval is a review decision. Publish the book separately after its
            catalog items are approved. Editing or rejecting published source
            content returns its book to draft. Rejected and duplicate records
            remain in the audit trail.
          </p>
        </>
      )}
    </section>
  );
}
