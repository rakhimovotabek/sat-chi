import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import { formatTime } from "./homework-model.js";
import { localDay } from "./daily-homework-model.js";
import { resultStatus, resultTotals } from "./homework-results-model.js";
export default function HomeworkResults() {
  const { homeworkId } = useParams(),
    [params] = useSearchParams();
  const recurring = params.get("recurring") === "true";
  const [day, setDay] = useState(localDay());
  const state = useContent(
    () =>
      rpc("admin_homework_results", {
        p_homework: homeworkId,
        p_day: recurring ? day : null,
      }),
    [homeworkId, recurring, day],
  );
  const data = state.data,
    meta = data?.assignment,
    totals = data && resultTotals(data.rows);
  return (
    <>
      <PageHeader
        title={meta?.title || "Homework results"}
        eyebrow="Assignment details"
        description="Persisted student results; each recurring date is reported separately."
      />
      <Link to="/admin/homework">Back to Homework</Link>
      {recurring && (
        <label className="learning-field">
          Occurrence date
          <input
            type="date"
            value={day}
            max={localDay()}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
      )}
      <ContentState {...state} onRetry={state.reload} />
      {data && (
        <>
          <section className="card learning-panel">
            <h2>Assignment overview</h2>
            <p>{meta.instructions || meta.data?.instructions}</p>
            <dl className="daily-overview">
              {[
                [
                  "Assigned students",
                  data.rows
                    .filter((r) => r.active !== false)
                    .map((r) => r.display_name || r.username || "Student")
                    .join(", ") || "None for this occurrence",
                ],
                [
                  "Groups",
                  data.groups.map((g) => g.name).join(", ") || "No groups",
                ],
                [
                  "Recurrence",
                  recurring ? `Daily · ${meta.timezone} · ${day}` : "One-time",
                ],
                [
                  "Questions per day",
                  recurring ? meta.data.count : "Not recurring",
                ],
                [
                  "Start",
                  recurring
                    ? meta.data.startDate
                    : new Date(meta.created_at).toLocaleString(),
                ],
                [
                  "Deadline",
                  recurring
                    ? `Midnight · ${meta.timezone} · end ${meta.data.endDate || "No end date"}`
                    : new Date(meta.due_at).toLocaleString(),
                ],
                ["Eligible students", totals.eligible],
                ["Started", totals.started],
                ["Completed", totals.completed],
                ["Pending", totals.pending],
                [
                  "Current grading accuracy",
                  totals.accuracy == null
                    ? "—"
                    : `${totals.accuracy}% (graded answers)`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card learning-panel table-scroll">
            <h2>Student results</h2>
            <table className="students-table">
              <thead>
                <tr>
                  {[
                    "Student",
                    "Status",
                    "Answered",
                    "Correct",
                    "Incorrect",
                    "Unanswered",
                    "Awaiting grading",
                    "Current grading accuracy",
                    "First-attempt accuracy (question history)",
                    "Active time",
                    "Completed at",
                    "Details",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.student_id}>
                    <td>{r.display_name || r.username || "Student"}</td>
                    <td>{resultStatus(r)}</td>
                    <td>{r.answered}</td>
                    <td>{r.correct}</td>
                    <td>{r.incorrect}</td>
                    <td>{Math.max(0, r.question_count - r.answered)}</td>
                    <td>{r.ungraded}</td>
                    <td>
                      {Number(r.correct) + Number(r.incorrect)
                        ? `${Math.round((r.correct / (Number(r.correct) + Number(r.incorrect))) * 100)}%`
                        : "—"}
                    </td>
                    <td>
                      {r.question_history?.first_accuracy == null
                        ? "—"
                        : `${r.question_history.first_accuracy}%`}
                      {r.question_history?.first_unknown > 0
                        ? " · partial history"
                        : ""}
                    </td>
                    <td>{formatTime(r.active_seconds)}</td>
                    <td>
                      {r.completed_at
                        ? new Date(r.completed_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {r.session_id ? (
                        <Link to={`/admin/sessions/${r.session_id}`}>
                          Details
                        </Link>
                      ) : (
                        "Not started"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && (
              <p>No assigned students for this occurrence.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
