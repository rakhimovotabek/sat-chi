import { questionState } from "./model.js";
export default function Navigator({ items, current, onNavigate, submitted }) {
  return (
    <details className="question-overview">
      <summary>Question overview · {items.length} questions</summary>
      <div className="navigator-legend">
        ○ Unanswered · ● Answered · ⚑ Marked{" "}
        {submitted && "· ✓ Correct · × Incorrect"}
      </div>
      <div className="question-numbers">
        {items.map((item, i) => {
          const states = questionState(item, i === current, submitted);
          return (
            <button
              key={item.id}
              type="button"
              className={`question-number ${states.map((s) => `is-${s}`).join(" ")}`}
              aria-label={`Question ${i + 1}, ${states.join(", ")}`}
              aria-current={i === current ? "step" : undefined}
              onClick={() => onNavigate(i)}
            >
              {i + 1}
              {item.marked && <span aria-hidden="true">⚑</span>}
            </button>
          );
        })}
      </div>
    </details>
  );
}
