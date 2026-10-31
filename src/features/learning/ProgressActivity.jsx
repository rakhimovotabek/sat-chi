import ActivityChart from "./ActivityChart.jsx";
import AccuracyTrend from "./AccuracyTrend.jsx";
import { useEffect, useState } from "react";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import "./progress-activity.css";

function savedScope() {
  try {
    const value = JSON.parse(sessionStorage.getItem("satchi-progress-scope"));
    return value &&
      [7, 30, 90].includes(value.days) &&
      ["", "Math", "Reading & Writing"].includes(value.section) &&
      ["questions", "accuracy", "accuracy-trend"].includes(value.metric)
      ? value
      : {};
  } catch {
    return {};
  }
}

export default function ProgressActivity() {
  const [days, setDays] = useState(() => savedScope().days || 30);
  const [section, setSection] = useState(() => savedScope().section || "");
  const [metric, setMetric] = useState(
    () => savedScope().metric || "questions",
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "satchi-progress-scope",
        JSON.stringify({ days, section, metric }),
      );
    } catch {
      /* private browsing: use in-memory scope */
    }
  }, [days, section, metric]);
  const state = useContent(
    () => rpc("progress_activity", { p_days: days, p_section: section }),
    [days, section],
  );
  const data = state.data;
  const maximum =
    metric === "accuracy"
      ? 100
      : Math.max(1, ...(data?.days || []).map((row) => row.questions));
  return (
    <section
      className="card learning-panel progress-activity"
      aria-label="First-attempt activity"
    >
      <h2>First-attempt activity</h2>
      <p>
        Each question appears on its first graded date across Books, Question
        Bank and Homework. Later corrections stay separate.
      </p>
      <div className="progress-filters">
        <label>
          Activity period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option value={n} key={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </label>
        <label>
          Activity subject
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All subjects</option>
            <option>Math</option>
            <option>Reading &amp; Writing</option>
          </select>
        </label>
        <label>
          Activity metric
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="questions">Questions</option>
            <option value="accuracy">First-attempt accuracy</option>
            <option value="accuracy-trend">Accuracy trend line</option>
          </select>
        </label>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {data && !state.loading && !state.error && (
        <>
          <p className="progress-summary" role="status">
            {section || "All subjects"} · Last {days} days · {data.timezone}:{" "}
            {data.questions} distinct graded questions · {data.known} known
            first results ·{" "}
            {data.accuracy == null
              ? "No accuracy data"
              : `${data.accuracy}% first-attempt accuracy`}{" "}
            · {data.corrected} later corrected
          </p>
          {data.questions ? (
            <>
              {metric === "accuracy-trend" ? (
                <AccuracyTrend
                  key={`${days}:${section}:${metric}`}
                  days={data.days}
                  timezone={data.timezone}
                />
              ) : (
                <>
                  <ActivityChart
                    key={`${days}:${section}:${metric}`}
                    label={`${metric === "accuracy" ? "Daily first-attempt accuracy, scale 0 to 100 percent" : `Daily questions, scale 0 to ${maximum}`}. Exact values in the table below.`}
                  >
                    {data.days.map((row) => {
                      const value =
                        metric === "accuracy" ? row.accuracy : row.questions;
                      return (
                        <div
                          className="progress-column"
                          key={row.day}
                          title={`${row.day}: ${value == null ? "No known first results" : value}${metric === "accuracy" && value != null ? "%" : " questions"}`}
                        >
                          <span
                            style={{
                              height: `${((value || 0) / maximum) * 100}%`,
                            }}
                          />
                        </div>
                      );
                    })}
                  </ActivityChart>
                  <div className="progress-axis" aria-hidden="true">
                    <span>{data.days[0]?.day}</span>
                    <span>{data.days.at(-1)?.day}</span>
                  </div>
                </>
              )}
              <details>
                <summary>Daily values and sample sizes</summary>
                <div className="table-scroll">
                  <table className="students-table">
                    <caption>First graded dates · {data.timezone}</caption>
                    <thead>
                      <tr>
                        {[
                          "Date",
                          "Questions",
                          "Known first results",
                          "First correct",
                          "Accuracy",
                          "Later corrected",
                        ].map((label) => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map((row) => (
                        <tr key={row.day}>
                          <th scope="row">{row.day}</th>
                          <td>{row.questions}</td>
                          <td>{row.known}</td>
                          <td>{row.correct}</td>
                          <td>
                            {row.accuracy == null ? "—" : `${row.accuracy}%`}
                          </td>
                          <td>{row.corrected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p>
              No graded questions in this period. Check a practice answer to
              start your record.
            </p>
          )}
          <p className="empty-copy">
            Accuracy excludes unknown first results. A day without known results
            has no accuracy value. This chart excludes Battles, vocabulary and
            study time. Summary cards below show all-time totals.
          </p>
        </>
      )}
    </section>
  );
}
