import useDailyRefresh from "./useDailyRefresh.js";
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";
import {
  dailyDirectory,
  dailyReport,
  startDaily,
} from "./daily-homework-api.js";
import {
  dailyDone,
  dailyAccuracy,
  dateWindow,
  localDay,
} from "./daily-homework-model.js";
import { formatTime } from "./homework-model.js";
function DailyAssignment({ row, action, navigate }) {
  const locked = !row.is_today && !row.allow_late && !dailyDone(row);
  const incomplete = row.status === "Incomplete";
  return (
    <article className="daily-assignment">
      <div>
        <h3>{row.title}</h3>
        <p>
          {row.answered
            ? `${row.answered} / ${row.question_count} questions`
            : `${row.question_count} questions`}{" "}
          · {row.status}
        </p>
        <small>
          {row.is_today ? "Due by midnight" : `Due date: ${row.study_date}`} ·{" "}
          {row.timezone}
        </small>
        {row.instructions && <p className="empty-copy">{row.instructions}</p>}
        {dailyDone(row) && (
          <p>
            Accuracy: {dailyAccuracy(row)} · Active time:{" "}
            {formatTime(row.active_seconds)}
          </p>
        )}
        {locked && (
          <p className="empty-copy">
            The deadline passed. Late work is disabled.
          </p>
        )}
        {incomplete && (
          <p className="empty-copy">
            Time limit ended before all questions were answered. This day
            receives no completion credit.
          </p>
        )}
      </div>
      <button
        className="button button-secondary"
        disabled={action.busy || locked}
        onClick={() =>
          action.run(async () => navigate(`/practice/${await startDaily(row)}`))
        }
      >
        {dailyDone(row) || incomplete
          ? "View results"
          : row.session_id
            ? "Continue"
            : "Start"}
      </button>
    </article>
  );
}
export default function DailyHomeworkStudent() {
  const minute = useDailyRefresh();
  const [todayPage, setTodayPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [end, setEnd] = useState(localDay()),
    action = useAction(),
    navigate = useNavigate();
  // Include adjacent dates: each assignment decides today's date in its own timezone.
  const utcDay = localDay("UTC");
  const next = new Date(`${utcDay}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const today = useContent(
    () =>
      dailyDirectory({
        ...dateWindow(next.toISOString().slice(0, 10), 2),
        p_page: todayPage,
      }),
    [utcDay, todayPage, minute],
  );
  const history = useContent(
    () => dailyDirectory({ ...dateWindow(end), p_page: historyPage }),
    [end, historyPage, minute],
  );
  const rows = today.data?.rows.filter((r) => r.is_today) || [],
    past = history.data?.rows.filter((r) => !r.is_today) || [];
  return (
    <>
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      <section className="card learning-panel">
        <div className="section-heading">
          <h2>Today</h2>
          <span>Daily homework</span>
        </div>
        <ContentState {...today} onRetry={today.reload} />
        {today.data && (
          <>
            {rows.length ? (
              rows.map((r) => (
                <DailyAssignment
                  key={`${r.template_id}-${r.study_date}`}
                  row={r}
                  action={action}
                  navigate={navigate}
                />
              ))
            ) : (
              <p className="empty-copy">No daily homework today.</p>
            )}
            {today.data.total > 50 && (
              <DailyPages
                page={todayPage}
                setPage={setTodayPage}
                total={today.data.total}
              />
            )}
          </>
        )}
      </section>
      <section className="card learning-panel">
        <h2>Overdue / Missed</h2>
        <ContentState {...history} onRetry={history.reload} />
        {history.data && (
          <>
            {past.filter((r) => !dailyDone(r)).length ? (
              past
                .filter((r) => !dailyDone(r))
                .map((r) => (
                  <DailyAssignment
                    key={`${r.template_id}-${r.study_date}`}
                    row={r}
                    action={action}
                    navigate={navigate}
                  />
                ))
            ) : (
              <p className="empty-copy">No missed daily work in this period.</p>
            )}
          </>
        )}
      </section>
      <details className="card learning-panel">
        <summary>Daily homework history</summary>
        <label className="learning-field">
          History ending
          <input
            type="date"
            max={localDay()}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setHistoryPage(0);
            }}
          />
        </label>
        <p className="empty-copy">
          31 days ending {end}. Choose an earlier date to see older history.
        </p>
        {past.filter(dailyDone).map((r) => (
          <DailyAssignment
            key={`${r.template_id}-${r.study_date}`}
            row={r}
            action={action}
            navigate={navigate}
          />
        ))}
        {history.data && (
          <DailyPages
            page={historyPage}
            setPage={setHistoryPage}
            total={history.data.total}
          />
        )}
      </details>
    </>
  );
}
function DailyPages({ page, setPage, total }) {
  return (
    <div className="button-row">
      <button
        className="button button-secondary"
        disabled={!page}
        onClick={() => setPage(page - 1)}
      >
        Previous daily records
      </button>
      <span>Page {page + 1}</span>
      <button
        className="button button-secondary"
        disabled={(page + 1) * 50 >= total}
        onClick={() => setPage(page + 1)}
      >
        Next daily records
      </button>
    </div>
  );
}
export function DailyDashboard() {
  const minute = useDailyRefresh();
  const state = useContent(() => dailyReport(), [minute]);
  const assigned = state.data?.today.reduce((n, r) => n + r.assigned, 0) || 0,
    completed = state.data?.today.reduce((n, r) => n + r.completed, 0) || 0;
  return (
    <section className="card learning-panel">
      <div className="section-heading">
        <h2>Daily Homework</h2>
        <Link className="primary-link" to="/homework">
          {assigned && completed < assigned ? "Continue" : "View homework"}
        </Link>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <p>
          {assigned
            ? completed === assigned
              ? "Today's homework complete"
              : `${assigned} assignments today · ${completed} completed · ${assigned - completed} remaining`
            : "No daily assignments today."}
        </p>
      )}
    </section>
  );
}
