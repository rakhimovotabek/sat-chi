import { Link } from "react-router";
import { masteryPercent, vocabularyAccuracy } from "./vocabulary-model.js";
import AnimatedValue from "../../components/AnimatedValue.jsx";
export default function VocabularyStats({ data, compact = false }) {
  if (!data) return null;
  const accuracy = vocabularyAccuracy(data);
  return (
    <section className="card learning-panel vocabulary-overview">
      <div className="section-heading">
        <div>
          <h2>Vocabulary</h2>
          <p>
            {data.due} words due for review · {masteryPercent(data)}% mastered
          </p>
        </div>
        <Link className="button" to="/vocabulary/study?filter=due&mode=cards">
          Review Now
        </Link>
      </div>
      {!compact && (
        <>
          <div className="vocabulary-stat-row">
            {[
              ["Total words", data.total],
              ["Learned", data.learned],
              ["Mastered", data.mastered],
              ["Starred", data.starred],
              ["Accuracy", accuracy, "percent"],
              [
                "Study time",
                Math.round(data.study_seconds / 60),
                "number",
                " min",
              ],
            ].map(([label, value, format, suffix]) => (
              <div key={label}>
                <strong>
                  <AnimatedValue
                    value={value}
                    format={format}
                    suffix={suffix}
                  />
                </strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="button-row">
            <Link
              className="primary-link"
              to="/vocabulary/study?filter=starred"
            >
              Starred Words →
            </Link>
            <Link
              className="primary-link"
              to="/vocabulary/study?filter=weak&mode=cards"
            >
              Practice Weak Words →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
