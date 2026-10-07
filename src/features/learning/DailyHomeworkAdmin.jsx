import { useState } from "react";
import { Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import HomeworkForm from "./HomeworkForm.jsx";
import Modal from "../../components/Modal.jsx";
import useAction from "./useAction.js";
import {
  dailyTemplates,
  dailyDirectory,
  dailyReport,
  setDailyState,
} from "./daily-homework-api.js";
import {
  dailyAudience,
  dailyAccuracy,
  dateWindow,
  localDay,
} from "./daily-homework-model.js";
import { formatTime } from "./homework-model.js";
export function DailyRows({ rows }) {
  return (
    <div className="table-scroll">
      <table className="students-table">
        <thead>
          <tr>
            {[
              "Student",
              "Date",
              "Status",
              "Progress",
              "Accuracy",
              "Active time",
              "Completed at",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.template_id}-${r.student_id}-${r.study_date}`}>
              <td>
                <Link to={`/admin/students/${r.student_id}`}>
                  {r.display_name || "Student"}
                </Link>
              </td>
              <td>{r.study_date}</td>
              <td>{r.status}</td>
              <td>
                {r.answered} / {r.question_count}
              </td>
              <td>{dailyAccuracy(r)}</td>
              <td>{formatTime(r.active_seconds)}</td>
              <td>
                {r.completed_at
                  ? new Date(r.completed_at).toLocaleString()
                  : "—"}
                {r.session_id && (
                  <>
                    {" "}
                    ·{" "}
                    <Link to={`/admin/sessions/${r.session_id}`}>
                      View attempt
                    </Link>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="empty-copy">No scheduled work in this period.</p>
      )}
    </div>
  );
}
function Pagination({ page, setPage, total, label = "records" }) {
  return (
    <div className="button-row">
      <button
        className="button button-secondary"
        disabled={!page}
        onClick={() => setPage(page - 1)}
      >
        Previous {label}
      </button>
      <span>
        {total} {label}
      </span>
      <button
        className="button button-secondary"
        disabled={(page + 1) * 50 >= total}
        onClick={() => setPage(page + 1)}
      >
        Next {label}
      </button>
    </div>
  );
}
function DailyDetail({ template, onClose }) {
  const [tab, setTab] = useState("Overview"),
    [end, setEnd] = useState(localDay(template.timezone)),
    [page, setPage] = useState(0);
  const today = localDay(template.timezone);
  const args = {
    p_template: template.id,
    ...(tab === "Today" ? { p_from: today, p_until: today } : dateWindow(end)),
    p_page: page,
  };
  const state = useContent(
    () =>
      tab === "Overview"
        ? Promise.resolve(null)
        : tab === "Today"
          ? dailyDirectory(args)
          : dailyReport(args),
    [template.id, tab, end, page],
  );
  const d = template.data;
  return (
    <section
      className="card learning-panel"
      aria-label="Recurring assignment detail"
    >
      <div className="section-heading">
        <h2>{d.title}</h2>
        <button className="button button-secondary" onClick={onClose}>
          Close detail
        </button>
      </div>
      <div
        className="learning-tabs"
        role="tablist"
        aria-label="Recurring assignment views"
      >
        {["Overview", "Today", "History", "Students"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={`button ${tab === t ? "" : "button-secondary"}`}
            key={t}
            onClick={() => {
              setTab(t);
              setPage(0);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" ? (
        <>
          <p>{d.instructions || "No description"}</p>
          <dl className="daily-overview">
            {[
              ["Audience", dailyAudience(template)],
              ["Questions per day", d.count],
              [
                "Question rules",
                Object.entries(d.filters || {})
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || "All published, approved questions",
              ],
              [
                "Specific pool",
                d.questionIds?.length
                  ? `${d.questionIds.length} selected questions`
                  : `${template.pool_count} usable questions`,
              ],
              ["Selection", "Prefer unseen; avoid assigned questions"],
              [
                "Reuse",
                d.allowRepeat
                  ? "Allowed after exhaustion"
                  : "Expand pool when exhausted",
              ],
              ["Date range", `${d.startDate} – ${d.endDate || "No end date"}`],
              ["Deadline", `Due by midnight · ${template.timezone}`],
              ["Time limit", d.timeLimit ? formatTime(d.timeLimit) : "Untimed"],
              ["Status", template.state],
              [
                "Latest revision",
                `${template.revision} · effective ${template.valid_from}`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <>
          {tab !== "Today" && (
            <label className="learning-field">
              History ending
              <input
                type="date"
                max={today}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          <ContentState {...state} onRetry={state.reload} />
          {state.data &&
            (tab === "Today" ? (
              <>
                <DailyRows rows={state.data.rows || []} />
                <Pagination
                  page={page}
                  setPage={setPage}
                  total={state.data.total}
                />
              </>
            ) : (
              <div className="table-scroll">
                <table className="students-table">
                  <thead>
                    <tr>
                      {(tab === "History"
                        ? [
                            "Date",
                            "Completed / assigned",
                            "Missed",
                            "Completed late",
                            "Accuracy",
                            "Average active time",
                          ]
                        : [
                            "Student",
                            "Completed / assigned",
                            "Completion rate",
                            "Missed",
                            "Accuracy",
                            "Average active time",
                          ]
                      ).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "History"
                      ? state.data.history || []
                      : state.data.students || []
                    ).map((r) => (
                      <tr key={r.study_date || r.student_id}>
                        <td>
                          {tab === "History" ? (
                            r.study_date
                          ) : (
                            <Link to={`/admin/students/${r.student_id}`}>
                              {r.display_name || "Student"}
                            </Link>
                          )}
                        </td>
                        <td>
                          {r.completed} / {r.assigned}
                        </td>
                        {tab === "Students" && (
                          <td>
                            {r.completion_rate == null
                              ? "—"
                              : `${r.completion_rate}%`}
                          </td>
                        )}
                        <td>{r.missed}</td>
                        {tab === "History" && <td>{r.late}</td>}
                        <td>{r.accuracy == null ? "—" : `${r.accuracy}%`}</td>
                        <td>
                          {r.average_seconds == null
                            ? "—"
                            : formatTime(r.average_seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tab === "Students" && (
                  <Pagination
                    page={page}
                    setPage={setPage}
                    total={state.data.student_total}
                    label="students"
                  />
                )}
                <p className="empty-copy">
                  31-day period. Completion rate counts due assignments and
                  completed work; unfinished work still due today is excluded.
                </p>
              </div>
            ))}
        </>
      )}
    </section>
  );
}
export default function DailyHomeworkAdmin() {
  const state = useContent(async () => {
    const [templates, report] = await Promise.all([
      dailyTemplates(),
      dailyReport(),
    ]);
    return { templates, report };
  });
  const action = useAction(),
    [archived, setArchived] = useState(false),
    [detail, setDetail] = useState(null),
    [editing, setEditing] = useState(null),
    [archiveTarget, setArchiveTarget] = useState(null);
  const change = (t, next) =>
    action.run(async () => {
      await setDailyState(t.id, next);
      setArchiveTarget(null);
      state.reload();
    });
  const selected = state.data?.templates.find((t) => t.id === detail);
  return (
    <>
      <section className="card learning-panel">
        <div className="section-heading">
          <h2>Daily recurring homework</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        <ContentState {...state} onRetry={state.reload} />
        {action.error && (
          <p className="form-error" role="alert">
            {action.error}
          </p>
        )}
        {state.data && (
          <div className="table-scroll">
            <table className="students-table">
              <thead>
                <tr>
                  {[
                    "Title",
                    "Audience",
                    "Questions/day",
                    "Start",
                    "End",
                    "Today completion",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.templates
                  .filter((t) => archived || t.state !== "archived")
                  .map((t) => {
                    const today = state.data.report.today.find(
                      (r) => r.template_id === t.id,
                    );
                    return (
                      <tr key={t.id}>
                        <td>{t.data.title}</td>
                        <td>{dailyAudience(t)}</td>
                        <td>{t.data.count}</td>
                        <td>{t.data.startDate}</td>
                        <td>{t.data.endDate || "—"}</td>
                        <td>
                          {today
                            ? `${today.completed} / ${today.assigned}`
                            : "No work today"}
                        </td>
                        <td>{t.state}</td>
                        <td>
                          <div className="button-row daily-admin-actions">
                            <button
                              className="button button-secondary"
                              onClick={() => setDetail(t.id)}
                            >
                              View
                            </button>
                            {t.state !== "archived" && (
                              <>
                                <button
                                  className="button button-secondary"
                                  onClick={() => setEditing(t)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="button button-secondary"
                                  disabled={action.busy}
                                  onClick={() =>
                                    change(
                                      t,
                                      t.state === "active"
                                        ? "paused"
                                        : "active",
                                    )
                                  }
                                >
                                  {t.state === "active" ? "Pause" : "Resume"}
                                </button>
                                <button
                                  className="button button-secondary"
                                  onClick={() => setArchiveTarget(t)}
                                >
                                  Archive
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!state.data.templates.filter(
              (t) => archived || t.state !== "archived",
            ).length && (
              <p className="empty-copy">
                No recurring assignments. Choose Daily recurring in New homework
                to create one.
              </p>
            )}
            <p className="empty-copy">
              Latest 100 recurring assignments. Pause and archive stop
              tomorrow’s work and preserve today and history.
            </p>
          </div>
        )}
        {archiveTarget && (
          <div
            className="daily-archive-confirm"
            role="group"
            aria-label="Confirm archival"
          >
            <p>
              Archive “{archiveTarget.data.title}”? This preserves history and
              stops future days. Archived assignments cannot resume.
            </p>
            <div className="button-row">
              <button
                className="button"
                disabled={action.busy}
                onClick={() => change(archiveTarget, "archived")}
              >
                Confirm archive
              </button>
              <button
                className="button button-secondary"
                onClick={() => setArchiveTarget(null)}
              >
                Cancel archive
              </button>
            </div>
          </div>
        )}
      </section>
      {editing && (
        <Modal
          title="Edit recurring homework assignment"
          onClose={() => setEditing(null)}
        >
          <HomeworkForm
            key={editing.id}
            template={editing}
            onCreated={() => {
              setEditing(null);
              state.reload();
            }}
          />
        </Modal>
      )}
      {selected && (
        <DailyDetail
          key={selected.id}
          template={selected}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
