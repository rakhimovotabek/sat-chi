import { useState } from "react";
import { rpc } from "./api.js";

export default function OpenResponseReview({
  sessionId,
  item,
  review,
  onSaved,
  disabled,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const range = review?.accepted_range;
  const official = range
    ? `${range.min} to ${range.max} (${range.inclusive ? "inclusive" : "exclusive"})`
    : review?.accepted_answers?.join(" or ") || review?.correct_answer;
  async function decide(correct) {
    setBusy(true);
    setError("");
    try {
      await rpc("review_open_response", {
        p_session: sessionId,
        p_item: item.id,
        p_correct: correct,
        p_expected_revision: review.review_revision ?? 0,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Open response review">
      <p>Official answer: {official || "Unavailable"}</p>
      <p>
        Review status:{" "}
        {review?.review_correct == null
          ? "Automatic grading"
          : review.review_correct
            ? "Reviewed: Correct"
            : "Reviewed: Incorrect"}
      </p>
      <p>Result: {item.correct ? "Correct" : "Incorrect"}</p>
      {official && item.selected_response?.trim() && (
        <div className="button-row">
          <button
            className="button button-secondary"
            disabled={busy || disabled}
            onClick={() => decide(true)}
          >
            Mark correct
          </button>
          <button
            className="button button-secondary"
            disabled={busy || disabled}
            onClick={() => decide(false)}
          >
            Mark incorrect
          </button>
          <button
            className="button button-secondary"
            disabled={busy || disabled || review?.review_correct == null}
            onClick={() => decide(null)}
          >
            Restore automatic grading
          </button>
        </div>
      )}
      {busy && <p role="status">Saving review…</p>}
      {error && (
        <div role="alert">
          {error}
          <button
            className="button button-secondary"
            onClick={() => {
              setError("");
              onSaved();
            }}
          >
            Reload saved review
          </button>
        </div>
      )}
    </section>
  );
}
