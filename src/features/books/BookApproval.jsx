import { useState } from "react";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { reviewRpc } from "../review/api.js";
export default function BookApproval({ bookId, onPublished }) {
  const state = useContent(
    () => reviewRpc("book_review_summary", { p_book: bookId }),
    [bookId],
  );
  const [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const s = state.data;
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      state.reload();
    } catch {
      setError(
        "Could not complete this action. Refresh the approval counts and retry. No uncertain questions will be published.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="book-approval" aria-label="Book approval workflow">
      <h2>Publish the validated subset</h2>
      <p>
        Unresolved questions stay excluded while approved questions become
        available to students.
      </p>
      <ContentState {...state} onRetry={state.reload} />
      {s && (
        <>
          <dl className="approval-counts">
            {[
              ["Validated", s.validated],
              ["Needs human check", s.human],
              ["Excluded / unresolved", s.excluded],
              ["Duplicates", s.duplicates],
              ["Approved", s.approved],
              ["Published", s.published ? "Yes" : "No"],
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <div className="button-row">
            <button
              className="button"
              disabled={busy || !s.validated}
              onClick={() =>
                run(async () =>
                  setPreview(
                    await reviewRpc("content_review_bulk", { p_book: bookId }),
                  ),
                )
              }
            >
              Approve all validated questions
              {s.validated ? ` (${s.validated})` : ""}
            </button>
            <button
              className="button button-secondary"
              disabled={busy || !s.approved || s.published}
              onClick={() =>
                run(async () => {
                  await reviewRpc("publish_approved_book", { p_book: bookId });
                  onPublished?.();
                })
              }
            >
              {s.published
                ? "Approved content is published"
                : "Publish approved content"}
            </button>
          </div>
          {preview && (
            <div role="group" aria-label="Confirm validated approval">
              <p>
                Approve {preview.count} validated questions? All uncertain,
                unresolved and duplicate records are excluded automatically.
                Approval does not publish the book.
              </p>
              <button
                className="button"
                disabled={busy || !preview.count}
                onClick={() =>
                  run(async () => {
                    await reviewRpc("content_review_bulk", {
                      p_book: bookId,
                      p_confirm: preview.safe,
                    });
                    setPreview(null);
                  })
                }
              >
                Confirm approval
              </button>
              <button className="quiet-button" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
