import ActivityChart from "./ActivityChart.jsx";
import { accuracyGeometry } from "./accuracy-geometry.js";

export default function AccuracyTrend({ days, timezone }) {
  const chart = accuracyGeometry(days);
  if (!chart.points.length)
    return <p>No known first results to plot in this period.</p>;
  return (
    <>
      <ActivityChart
        className="progress-chart progress-trend-chart"
        label={`Daily first-attempt accuracy, zero to 100 percent, ${chart.points.length} observed dates, ${timezone}. Gaps have no known first results. Exact values and sample sizes in the table below.`}
      >
        <div className="accuracy-plot-grid" aria-hidden="true">
          <div className="accuracy-y-axis">
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            className="accuracy-plot"
            aria-hidden="true"
          >
            {[chart.top, (chart.top + chart.baseline) / 2, chart.baseline].map(
              (y) => (
                <line
                  key={y}
                  x1="0"
                  x2={chart.width}
                  y1={y}
                  y2={y}
                  className="accuracy-grid"
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
            <g
              data-chart-rise="true"
              style={{
                transformOrigin: `0px ${chart.baseline}px`,
                transformBox: "view-box",
              }}
            >
              {chart.paths.map((path, index) => (
                <path
                  key={index}
                  d={path}
                  data-chart-draw="true"
                  className="accuracy-line"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {chart.points.map((point) => (
                <circle
                  key={point.day}
                  data-day={point.day}
                  data-accuracy={point.accuracy}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className="accuracy-point"
                >
                  <title>
                    {point.day}: {point.accuracy}% · {point.correct}/
                    {point.known} known first results
                  </title>
                </circle>
              ))}
            </g>
          </svg>
        </div>
        <div className="accuracy-x-axis" aria-hidden="true">
          <span>{days[0]?.day}</span>
          <span>{days.at(-1)?.day}</span>
        </div>
      </ActivityChart>
      <p className="empty-copy">
        Each point is a recorded day’s first-attempt accuracy. A gap means no
        known results, not zero accuracy. Lines join adjacent dates only.
        {chart.points.length === 1
          ? " Only one date has known results; there is no trend yet."
          : ""}
      </p>
    </>
  );
}
