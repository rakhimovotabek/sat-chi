import { useState } from "react";
import { Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { importJobs, importEvidence } from "./api.js";
function Evidence({ job }) {
  const state = useContent(
    () =>
      job.source_metadata
        ? Promise.resolve({ source_metadata: job.source_metadata })
        : importEvidence(job.id),
    [job.id],
  );
  return (
    <>
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.source_metadata?.review_items?.map((item, i) => (
        <p key={i}>
          {item.set ? `${item.set} · ` : ""}Question{" "}
          {item.number ?? item.question_index ?? "unknown"}
          {item.page ? ` · PDF page ${item.page}` : ""}:{" "}
          {(
            item.reasons || [item.reason || "Manual source review required"]
          ).join(" ")}
        </p>
      ))}
      {state.data?.source_metadata?.evidence?.length > 0 && (
        <p>
          {state.data.source_metadata.evidence.length} source evidence entries
          recorded.
        </p>
      )}
    </>
  );
}
export default function ImportStatus() {
  const [page, setPage] = useState(0),
    [open, setOpen] = useState({}),
    state = useContent(() => importJobs(page), [page]);
  return (
    <>
      <PageHeader
        title="Import status"
        eyebrow="Private source processing"
        description="Source checkpoints, draft imports and review requirements. Source PDFs stay on the owner's computer."
      />
      <ContentState {...state} onRetry={state.reload} />
      <button
        className="button button-secondary"
        onClick={state.reload}
        disabled={state.loading}
      >
        Refresh import reports
      </button>
      {state.data?.map((job) => (
        <article key={job.id} className="card learning-panel">
          <div className="section-heading">
            <h2>{job.title}</h2>
            <span className="subtle-badge">{job.status}</span>
          </div>
          <p>{job.source_path || job.source_file}</p>
          <div className="section-list">
            <span>
              {job.source_type || "book"} · {job.category || "Other"}
            </span>
            <span>{job.detected_topics} detected topics</span>
            <span>{job.detected_questions} candidate questions</span>
            {job.source_type === "vocabulary" && (
              <span>
                {job.detected_vocabulary_sets || 0} sets ·{" "}
                {job.word_count || job.source_metadata?.detected_words || 0}{" "}
                words
              </span>
            )}
            <span>
              {job.imported_count} imported · {job.skipped_count} skipped
            </span>
            <span>{job.needs_review_count || 0} questions need review</span>
          </div>
          {job.status === "review" && (
            <p className="form-notice">
              NEEDS_REVIEW — no content from this source was imported.
            </p>
          )}
          {job.status === "imported" && (
            <p className="empty-copy">
              Initially imported as draft. Admin review controls publication.
            </p>
          )}
          {(job.book_id || job.vocabulary_book_id) && (
            <Link
              className="button button-secondary button-compact"
              to={`/admin/${job.vocabulary_book_id ? "vocabulary" : "books"}/${job.vocabulary_book_id || job.book_id}`}
            >
              Review imported content
            </Link>
          )}
          <details
            onToggle={(e) => {
              const expanded = e.currentTarget.open;
              setOpen((v) => ({ ...v, [job.id]: expanded }));
            }}
          >
            <summary>Question review evidence</summary>
            {open[job.id] && <Evidence job={job} />}
          </details>
          {[...(job.warnings || []), ...(job.errors || [])].map((text, i) => (
            <p className="empty-copy" key={i}>
              {text}
            </p>
          ))}
        </article>
      ))}
      {state.data && !state.data.length && (
        <section className="card empty-state">
          <h2>No import reports</h2>
          <p>
            Run local inspection, then apply its private checkpoints through the
            documented administrator workflow.
          </p>
        </section>
      )}
      <div className="button-row">
        <button
          className="button button-secondary"
          disabled={!page || state.loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous reports
        </button>
        <button
          className="button button-secondary"
          disabled={state.loading || (state.data?.length || 0) < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          Next reports
        </button>
      </div>
    </>
  );
}
