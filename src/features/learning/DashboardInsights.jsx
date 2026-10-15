import { Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";

export default function DashboardInsights({ metrics }) {
  const state = useContent(() => rpc("dashboard_study_activity"));
  const weak = (metrics.attention || [])
    .filter((a) => a.attempted >= 10 && a.correct / a.attempted < 0.7)
    .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted)
    .slice(0, 4);
  const data = state.data,
    maximum = Math.max(1, ...(data?.days || []).map((d) => d.questions));
  const improvement =
    data && data.recent_known >= 10 && data.previous_known >= 10
      ? 100 *
        (data.recent_correct / data.recent_known -
          data.previous_correct / data.previous_known)
      : null;
  return (
    <div className="learning-columns dashboard-insights">
      <section className="card learning-panel">
        <h2>Study activity</h2>
        <ContentState {...state} onRetry={state.reload} />
        {data && (
          <>
            <p className="empty-copy">
              Distinct questions checked per day · last 7 days · {data.timezone}
            </p>
            <ol className="weekly-activity">
              {data.days.map((d) => (
                <li key={d.day}>
                  <strong>{d.questions}</strong>
                  <span className="activity-bar-track" aria-hidden="true">
                    <span
                      style={{ height: `${(d.questions / maximum) * 100}%` }}
                    />
                  </span>
                  <span>
                    {new Date(d.day + "T12:00:00Z").toLocaleDateString(
                      undefined,
                      { weekday: "short", timeZone: "UTC" },
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p>
              {improvement == null
                ? "A trend needs at least 10 recorded first results in each 14-day period."
                : `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)} percentage points in first-attempt accuracy: last 14 days versus the previous 14 days.`}
            </p>
          </>
        )}
      </section>
      <section className="card learning-panel">
        <h2>Weak areas</h2>
        <p className="empty-copy">
          Based on at least 10 known first results per domain in the last 30
          days.
        </p>
        {weak.length ? (
          <div className="item-list">
            {weak.map((a) => (
              <Link
                className="list-button"
                key={a.section + a.domain}
                to="/question-bank"
                state={{
                  preset: {
                    section: a.section,
                    domains: [a.domain],
                    skills: [],
                  },
                }}
              >
                <strong>{a.domain}</strong>
                <small>
                  {Math.round((a.correct / a.attempted) * 100)}% first-attempt
                  accuracy · {a.attempted} questions · Practice this domain →
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p>
            No weakness label yet. Keep practicing to build a meaningful sample.
          </p>
        )}
        <Link className="primary-link" to="/progress">
          Explore your performance →
        </Link>
      </section>
    </div>
  );
}
