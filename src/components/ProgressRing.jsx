import ActivityChart from "../features/learning/ActivityChart.jsx";
import AnimatedValue from "./AnimatedValue.jsx";

export default function ProgressRing({ value, label }) {
  const known = value != null && Number.isFinite(Number(value));
  const percent = known ? Math.min(100, Math.max(0, Number(value))) : 0;
  return (
    <ActivityChart
      key={known ? percent : "unknown"}
      className="progress-ring"
      label={`${label}: ${known ? `${Math.round(percent)}%` : "unavailable"}`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle
          className="ring-track"
          cx="60"
          cy="60"
          r="50"
          pathLength="100"
        />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r="50"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          data-chart-ring={100 - percent}
        />
      </svg>
      <span className="ring-label" aria-hidden="true">
        <AnimatedValue value={known ? percent : null} format="percent" />
      </span>
    </ActivityChart>
  );
}
