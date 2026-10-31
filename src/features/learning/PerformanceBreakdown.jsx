import { useState } from "react";
import ActivityChart from "./ActivityChart.jsx";
import { performanceBreakdown } from "./performance-breakdown.js";
import "./performance-breakdown.css";

export default function PerformanceBreakdown({ breakdowns }) {
  const [group, setGroup] = useState("domain");
  const rows = performanceBreakdown(breakdowns, group);
  return (
    <section
      className="card learning-panel performance-breakdown"
      aria-label="Performance breakdown"
    >
      <div className="section-heading">
        <h2>Performance breakdown</h2>
        <label>
          Break down by
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            {["domain", "skill", "difficulty", "source"].map((value) => (
              <option key={value} value={value}>
                {value === "source" ? "Book / source" : value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="empty-copy">
        All time · distinct attempted questions. Accuracy excludes unknown first
        results. Lowest recorded accuracy appears first; fewer than 10 known
        results is a small sample, not an established weakness.
      </p>
      {!rows.length ? (
        <p>No recorded results to compare yet.</p>
      ) : (
        <>
          <ActivityChart
            key={group}
            className="performance-bars"
            role="group"
            label={`All-time ${group} first-attempt accuracy`}
          >
            <ul>
              {rows.map((row) => (
                <li key={row.label}>
                  <div className="performance-bar-heading">
                    <strong>{row.label}</strong>
                    <span>
                      {row.accuracy === null
                        ? "Unavailable"
                        : `${Math.round(row.accuracy)}%`}
                    </span>
                  </div>
                  <div className="performance-bar-track" aria-hidden="true">
                    {row.accuracy !== null && (
                      <span
                        data-chart-grow="true"
                        style={{ width: `${row.accuracy}%` }}
                      />
                    )}
                  </div>
                  <small>
                    {row.correct} first correct / {row.known} known results ·{" "}
                    {row.attempted} attempted
                    {row.known < row.attempted ? " · partial history" : ""}
                    {row.known < 10 ? " · small sample" : ""}
                  </small>
                </li>
              ))}
            </ul>
          </ActivityChart>
          <details>
            <summary>Exact performance values</summary>
            <div className="table-scroll">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Attempted</th>
                    <th>First correct</th>
                    <th>First incorrect</th>
                    <th>Known first results</th>
                    <th>First-attempt accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.attempted}</td>
                      <td>{row.correct}</td>
                      <td>{row.incorrect}</td>
                      <td>{row.known}</td>
                      <td>
                        {row.accuracy === null
                          ? "Unavailable"
                          : `${Math.round(row.accuracy)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
