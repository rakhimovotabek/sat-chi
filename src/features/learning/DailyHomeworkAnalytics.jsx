import { useState } from "react";
import { Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { dailyStatistics, dailyDirectory } from "./daily-homework-api.js";
import { localDay, dateWindow, dailyAccuracy } from "./daily-homework-model.js";
import { formatTime } from "./homework-model.js";
export default function DailyHomeworkAnalytics({ student }) {
  const [end, setEnd] = useState(localDay()),
    [page, setPage] = useState(0);
  const summary = useContent(() => dailyStatistics(student), [student]);
  const history = useContent(
    () =>
      dailyDirectory({ p_student: student, ...dateWindow(end), p_page: page }),
    [student, end, page],
  );
  const data = summary.data;
  return (
    <section className="card learning-panel">
      <h2>Daily Homework performance</h2>
      <ContentState {...summary} onRetry={summary.reload} />
      {data && (
        <>
          <div className="metrics-grid">
            {[
              [
                "Daily Homework completion rate",
                data.completion_rate == null ? "—" : `${data.completion_rate}%`,
              ],
              ["Current homework streak", `${data.current_streak} days`],
              ["Longest homework streak", `${data.longest_streak} days`],
              ["Missed days", data.missed_days],
              [
                "Average homework accuracy",
                data.accuracy == null ? "—" : `${data.accuracy}%`,
              ],
              [
                "Average active homework time",
                data.average_seconds == null
                  ? "—"
                  : formatTime(data.average_seconds),
              ],
            ].map(([label, value]) => (
              <div className="metric-card" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="empty-copy">
            All-time metrics. A streak requires all homework for a scheduled day
            to finish on time. Unscheduled days are skipped; unfinished work
            still due today does not break a streak. Late completion counts
            toward completion rate and accuracy.
          </p>
        </>
      )}
      <h3>Recent daily history</h3>
      <label className="learning-field">
        History ending
        <input
          type="date"
          max={localDay()}
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <ContentState {...history} onRetry={history.reload} />
      {history.data && (
        <>
          <div className="table-scroll">
            <table className="students-table">
              <thead>
                <tr>
                  {[
                    "Date",
                    "Assignment",
                    "Status",
                    "Progress",
                    "Accuracy",
                    "Active time",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((r) => (
                  <tr key={`${r.template_id}-${r.study_date}`}>
                    <td>{r.study_date}</td>
                    <td>
                      {r.session_id ? (
                        <Link to={`/admin/sessions/${r.session_id}`}>
                          {r.title}
                        </Link>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td>{r.status}</td>
                    <td>
                      {r.answered} / {r.question_count}
                    </td>
                    <td>{dailyAccuracy(r)}</td>
                    <td>{formatTime(r.active_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.data.rows.length && (
              <p className="empty-copy">No daily homework history yet.</p>
            )}
          </div>
          <div className="button-row">
            <button
              className="button button-secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Previous history
            </button>
            <span>{history.data.total} records in this 31-day period</span>
            <button
              className="button button-secondary"
              disabled={(page + 1) * 50 >= history.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next history
            </button>
          </div>
        </>
      )}
    </section>
  );
}
