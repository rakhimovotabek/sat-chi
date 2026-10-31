import { useState } from "react";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import "./homework-heatmap.css";

export default function HomeworkHeatmap({ homework, day }) {
  const [page, setPage] = useState(0),
    [mode, setMode] = useState("accuracy"),
    [selected, setSelected] = useState(null);
  const state = useContent(
    () =>
      rpc("homework_question_performance", {
        p_homework: homework,
        p_day: day || null,
        p_page: page,
      }),
    [homework, day, page],
  );
  const data = state.data;
  const rows = data?.rows || [];
  return (
    <section
      className="card learning-panel homework-performance"
      aria-label="Question performance"
    >
      <h2>Question performance</h2>
      <p>
        First recorded grades in this assignment, from submitted attempts only.
        Skipped answers and unknown initial grades are excluded from accuracy.
        Later manual corrections do not rewrite it.
      </p>
      <label>
        Heatmap view
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="accuracy">First-grade accuracy</option>
          <option value="time">Recorded active time</option>
        </select>
      </label>
      <ContentState {...state} onRetry={state.reload} />
      {data && !state.loading && (
        <>
          <p>
            {data.completed_sessions} submitted attempts ·{" "}
            {data.total_questions} distinct questions. Fewer than five known
            results is a small sample.
          </p>
          {rows.length ? (
            <>
              <div className="question-heatmap">
                {rows.map((row) => (
                  <button
                    type="button"
                    key={row.question_id}
                    className={`heatmap-cell ${mode === "time" ? "timed" : row.known < 5 ? "small-sample" : row.accuracy >= 80 ? "high" : row.accuracy >= 50 ? "middle" : "low"}`}
                    onClick={() => setSelected(row)}
                    aria-pressed={selected?.question_id === row.question_id}
                    aria-label={`Question ${row.position}, ${mode === "time" ? (row.average_seconds == null ? "time unavailable" : `${row.average_seconds} active seconds from ${row.timing_samples} timed items`) : row.accuracy == null ? "accuracy unavailable" : `${row.accuracy}% from ${row.known} known grades`}`}
                  >
                    <strong>Q{row.position}</strong>
                    <span>
                      {mode === "accuracy"
                        ? row.accuracy == null
                          ? "—"
                          : `${row.accuracy}%`
                        : row.average_seconds == null
                          ? "No time"
                          : `${row.average_seconds}s`}
                    </span>
                    <small>
                      {mode === "time"
                        ? `${row.timing_samples} timed items`
                        : row.known < 5
                          ? "Small sample"
                          : `${row.known} grades`}
                    </small>
                  </button>
                ))}
              </div>
              <p>
                Accuracy legend: high ≥80% · middle 50–79% · low &lt;50%. Small
                samples use a neutral style. Time shows positive recorded active
                seconds only.
              </p>
              {selected && (
                <div
                  className="heatmap-detail"
                  role="region"
                  aria-label={`Question ${selected.position} details`}
                >
                  <h3>
                    Q{selected.position} ·{" "}
                    {selected.domain || "Unclassified domain"}
                  </h3>
                  <p>
                    {selected.skill || "Unclassified skill"} ·{" "}
                    {selected.difficulty || "Unclassified difficulty"}
                  </p>
                  <p>
                    {selected.correct} first correct / {selected.known} known
                    initial grades · {selected.skipped} skipped ·{" "}
                    {selected.unknown} unknown grades · {selected.samples}{" "}
                    submitted items
                  </p>
                  <p>
                    Active time:{" "}
                    {selected.average_seconds == null
                      ? "unavailable"
                      : `${selected.average_seconds}s mean, ${selected.median_seconds}s median from ${selected.timing_samples} timed items`}
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setSelected(null)}
                  >
                    Close question details
                  </button>
                </div>
              )}
              <details>
                <summary>Question data table</summary>
                <div className="table-scroll">
                  <table className="students-table">
                    <thead>
                      <tr>
                        {[
                          "Question",
                          "Domain",
                          "Correct / known",
                          "Accuracy",
                          "Skipped",
                          "Unknown",
                          "Mean active seconds",
                        ].map((heading) => (
                          <th key={heading} scope="col">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.question_id}>
                          <th scope="row">Q{row.position}</th>
                          <td>{row.domain || "Unclassified"}</td>
                          <td>
                            {row.correct} / {row.known}
                          </td>
                          <td>
                            {row.accuracy == null ? "—" : `${row.accuracy}%`}
                          </td>
                          <td>{row.skipped}</td>
                          <td>{row.unknown}</td>
                          <td>{row.average_seconds ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={page === 0}
                  onClick={() => {
                    setPage(page - 1);
                    setSelected(null);
                  }}
                >
                  Previous questions
                </button>
                <span>Page {page + 1}</span>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={(page + 1) * 100 >= data.total_questions}
                  onClick={() => {
                    setPage(page + 1);
                    setSelected(null);
                  }}
                >
                  Next questions
                </button>
              </div>
            </>
          ) : (
            <p>Submit an assignment to see question-level performance.</p>
          )}
        </>
      )}
    </section>
  );
}
