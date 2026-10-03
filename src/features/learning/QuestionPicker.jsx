import { useState } from "react";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { bank } from "./api.js";
export default function QuestionPicker({ filters, value, onChange }) {
  const [page, setPage] = useState(0);
  const state = useContent(
    () => bank(filters, page),
    [JSON.stringify(filters), page],
  );
  return (
    <section className="question-picker">
      <p>
        {value.length} selected · {state.data?.count ?? "…"} matching questions
      </p>
      {state.loading || state.error ? (
        <ContentState {...state} onRetry={state.reload} />
      ) : (
        <>
          <div className="item-list">
            {state.data.rows.map((q) => (
              <label className="checkbox-row" key={q.id}>
                <input
                  type="checkbox"
                  checked={value.includes(q.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...value, q.id]
                        : value.filter((id) => id !== q.id),
                    )
                  }
                />
                <span>
                  {q.question_text}
                  <small>
                    {q.book_title} · {q.topic_title}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous questions
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={(page + 1) * 25 >= state.data.count}
              onClick={() => setPage((p) => p + 1)}
            >
              More questions
            </button>
          </div>
        </>
      )}
    </section>
  );
}
