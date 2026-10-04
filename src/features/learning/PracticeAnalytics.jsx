import { useState } from "react";
import { Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import { formatTime } from "./homework-model.js";
const percent = (value) => (value == null ? "—" : `${value}%`);
export default function PracticeAnalytics({ student }) {
  const [sort, setSort] = useState("slowest"),
    [page, setPage] = useState(0),
    [level, setLevel] = useState("domain");
  const summary = useContent(
    () => rpc("practice_analytics", { p_student: student || null }),
    [student],
  );
  const questions = useContent(
    () =>
      rpc("practice_question_analytics", {
        p_student: student || null,
        p_sort: sort,
        p_page: page,
      }),
    [student, sort, page],
  );
  const data = summary.data;
  const areas = (data?.areas || []).filter((a) => a.level === level);
  return (
    <section className="learning-panel card">
      <h2>Practice learning analytics</h2>
      <p>
        Question Bank checks, including unfinished sessions. Accuracy measures
        checked questions; homework completion is reported separately.
      </p>
      <ContentState {...summary} onRetry={summary.reload} />
      {data && (
        <>
          <div className="metrics-grid">
            {[
              ["Questions practiced", data.practiced],
              ["Solved questions", data.solved],
              ["Unresolved questions", data.unresolved],
              ["First-attempt accuracy", percent(data.first_accuracy)],
              ["Eventual accuracy", percent(data.eventual_accuracy)],
              ["Average attempts / question", data.average_attempts ?? "—"],
              [
                "Average active time / question",
                data.average_seconds == null
                  ? "—"
                  : formatTime(Math.round(data.average_seconds)),
              ],
              [
                "Median active time / question",
                data.median_seconds == null
                  ? "—"
                  : formatTime(Math.round(data.median_seconds)),
              ],
            ].map(([label, value]) => (
              <div key={label} className="metric-card">
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <label>
            Break down practice by
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {["section", "domain", "skill"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="learning-columns">
            {[
              [
                "Hardest areas",
                areas.filter((a) => a.first_accuracy < 70).slice(0, 5),
              ],
              [
                "Strongest areas",
                areas
                  .filter((a) => a.first_accuracy >= 80 && a.attempts <= 1.5)
                  .sort(
                    (a, b) =>
                      b.first_accuracy - a.first_accuracy ||
                      a.attempts - b.attempts ||
                      a.seconds - b.seconds,
                  )
                  .slice(0, 5),
              ],
            ].map(([title, rows]) => (
              <div key={title}>
                <h3>{title}</h3>
                {rows.length ? (
                  rows.map((a) => (
                    <p key={a.label}>
                      <strong>{a.label}</strong> · {percent(a.first_accuracy)}{" "}
                      first attempt · {a.attempts} attempts/question ·{" "}
                      {formatTime(Math.round(a.seconds))} · {a.samples}{" "}
                      questions · {a.review_marks} marked checks
                    </p>
                  ))
                ) : (
                  <p className="empty-copy">
                    Needs 10 checked questions across at least 5 distinct
                    questions in an area. Accuracy carries more weight than
                    time.
                  </p>
                )}
              </div>
            ))}
          </div>
          {areas.length > 0 && (
            <div className="table-scroll">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Questions</th>
                    <th>First attempt</th>
                    <th>Eventual</th>
                    <th>Attempts/question</th>
                    <th>Active time/question</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((a) => (
                    <tr key={a.label}>
                      <td>{a.label}</td>
                      <td>{a.samples}</td>
                      <td>{percent(a.first_accuracy)}</td>
                      <td>{percent(a.eventual_accuracy)}</td>
                      <td>{a.attempts}</td>
                      <td>{formatTime(Math.round(a.seconds))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <h3>Question details</h3>
      <label>
        Show questions
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          <option value="slowest">Slowest questions</option>
          <option value="retried">Most retried questions</option>
          <option value="unresolved">Unresolved questions</option>
          <option value="missed">Repeatedly missed questions</option>
        </select>
      </label>
      <ContentState {...questions} onRetry={questions.reload} />
      {questions.data && (
        <>
          <div className="table-scroll">
            <table className="students-table">
              <thead>
                <tr>
                  {[
                    "Question",
                    "Source / book",
                    "Domain",
                    "Skill",
                    "Active time",
                    "Attempts",
                    "Result",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questions.data.rows.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link
                        to={
                          student
                            ? `/admin/sessions/${q.session_id}#${q.id}`
                            : `/practice/${q.session_id}`
                        }
                      >
                        {q.question}
                      </Link>
                    </td>
                    <td>{q.source}</td>
                    <td>{q.domain}</td>
                    <td>{q.skill}</td>
                    <td>{formatTime(q.active_seconds)}</td>
                    <td>{q.attempts}</td>
                    <td>{q.solved_at ? "Solved" : "Needs another attempt"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!questions.data.total && (
            <p className="empty-copy">No checks recorded yet.</p>
          )}
          <div className="button-row">
            <button
              className="button button-secondary"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous questions
            </button>
            <span>{questions.data.total} questions</span>
            <button
              className="button button-secondary"
              disabled={(page + 1) * 25 >= questions.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next questions
            </button>
          </div>
        </>
      )}
      {data && (
        <>
          <h3>Recent study activity</h3>
          {data.activity.length ? (
            data.activity.map((a, i) => (
              <p key={a.id || i}>
                {a.id ? (
                  <Link
                    to={
                      student ? `/admin/sessions/${a.id}` : `/practice/${a.id}`
                    }
                  >
                    {a.title}
                  </Link>
                ) : (
                  a.title
                )}{" "}
                · {a.kind} · {new Date(a.created_at).toLocaleString()} ·{" "}
                {formatTime(a.duration)} · {a.questions} questions{" "}
                {a.kind === "bank" && (
                  <>
                    · {percent(a.first_accuracy)} first attempt ·{" "}
                    {percent(a.eventual_accuracy)} eventual ·{" "}
                    {a.average_seconds == null
                      ? "—"
                      : formatTime(Math.round(a.average_seconds))}{" "}
                    per question
                  </>
                )}
              </p>
            ))
          ) : (
            <p className="empty-copy">Study activity will appear here.</p>
          )}
        </>
      )}
    </section>
  );
}
