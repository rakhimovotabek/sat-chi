import Modal from "../../components/Modal.jsx";
import { questionState } from "./model.js";
export default function Navigator({
  items,
  current,
  onNavigate,
  submitted,
  practice,
  onClose,
}) {
  return (
    <Modal title="Question Overview" onClose={onClose}>
      <div className="question-overview">
        <div className="question-numbers">
          {items.map((item, i) => {
            const states = questionState(
              item,
              i === current,
              submitted,
              practice,
            );
            return (
              <button
                key={item.id}
                type="button"
                className={`question-number ${states.map((s) => `is-${s}`).join(" ")}`}
                aria-label={`Question ${i + 1}, ${states.join(", ")}`}
                aria-current={i === current ? "step" : undefined}
                onClick={() => {
                  onNavigate(i);
                  onClose();
                }}
              >
                {i + 1}
                {item.marked && (
                  <span className="question-mark" aria-label="Marked" />
                )}
              </button>
            );
          })}
        </div>
        <div className="navigator-legend">
          {[
            ["unanswered", "Unanswered"],
            ["correct", "Solved"],
            ["incorrect", "Needs another attempt"],
            ["marked", "Marked"],
            ["current", "Current"],
          ].map(([state, label]) => (
            <span key={state}>
              <i className={`legend-dot is-${state}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}
