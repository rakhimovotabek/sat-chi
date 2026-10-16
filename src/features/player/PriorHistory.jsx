import { useState } from "react";
import { rpc } from "../learning/api.js";

export function priorStatus(prior) {
  if (!prior) return "Not attempted";
  if (!prior.checked) return "Previously answered · not checked";
  if (prior.first_correct === false && prior.eventually_correct)
    return "Corrected after mistake";
  if (prior.correct === true) return "Previously correct";
  if (prior.correct === false) return "Previously incorrect";
  return "Pending review";
}

export default function PriorHistory({ sessionId, item }) {
  const [data, setData] = useState(null),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const prior = item.prior;
  if (!prior) return null;
  const load = async (next = 0) => {
    setLoading(true);
    setError("");
    try {
      setData(
        await rpc("practice_history_events", {
          p_session: sessionId,
          p_item: item.id,
          p_page: next,
        }),
      );
      setPage(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section
      className="prior-history answer-result"
      aria-label="Previous question activity"
    >
      <strong>{priorStatus(prior)}</strong>
      <p>
        Previous answer:{" "}
        {prior.selected_response ??
          (prior.selected_answer == null
            ? "Unavailable"
            : `Choice ${String.fromCharCode(65 + prior.selected_answer)}`)}
        {prior.recorded_at &&
          ` · ${new Date(prior.recorded_at).toLocaleString()}`}
      </p>
      <p className="empty-copy">
        Previous activity is separate from your answer in this session.
        {prior.checked &&
          prior.first_correct == null &&
          " Original first result unavailable."}
      </p>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && !data && !loading && !error) load();
        }}
      >
        <summary>View recorded answer history</summary>
        {loading && <p role="status">Loading history…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => load(page)}>
              Retry history
            </button>
          </p>
        )}
        {data && (
          <>
            <ol>
              {data.rows.map((a) => (
                <li key={a.id}>
                  {a.selected_response ??
                    (a.selected_answer == null
                      ? "No answer recorded"
                      : `Choice ${String.fromCharCode(65 + a.selected_answer)}`)}
                  {` · ${a.correct == null ? "Pending grading" : a.correct ? "Correct" : "Incorrect"} · ${a.kind} · ${a.source} · ${a.source === "legacy" ? "Snapshot; original answer time unavailable" : new Date(a.created_at).toLocaleString()}`}
                  {!a.first_known &&
                    a.source === "legacy" &&
                    " · first outcome unknown"}
                </li>
              ))}
            </ol>
            {!data.total && <p>No recorded checks.</p>}
            {data.total > 50 && (
              <div className="button-row">
                <button
                  type="button"
                  disabled={loading || !page}
                  onClick={() => load(page - 1)}
                >
                  Earlier history
                </button>
                <button
                  type="button"
                  disabled={loading || (page + 1) * 50 >= data.total}
                  onClick={() => load(page + 1)}
                >
                  Later history
                </button>
              </div>
            )}
          </>
        )}
      </details>
    </section>
  );
}
