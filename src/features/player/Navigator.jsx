import Modal from "../../components/Modal.jsx";
import { questionState } from "./model.js";
import { useState } from "react";
export default function Navigator({
  items,
  current,
  onNavigate,
  submitted,
  practice,
  onClose,
}) {
  const [page, setPage] = useState(Math.floor(current / 100));
  const start = page * 100;
  return (
    <Modal title="Question Overview" onClose={onClose}>
      <div className="question-overview">
        <div className="question-numbers">
          {items.slice(start, start + 100).map((item, offset) => {
            const i = start + offset;
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
        {items.length > 100 && (
          <div className="button-row overview-pagination">
            <button
              type="button"
              className="button button-secondary"
              disabled={!page}
              onClick={() => setPage(0)}
            >
              First questions
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous questions
            </button>
            <span>
              {start + 1}–{Math.min(start + 100, items.length)} of{" "}
              {items.length}
            </span>
            <button
              type="button"
              className="button button-secondary"
              disabled={start + 100 >= items.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next questions
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={start + 100 >= items.length}
              onClick={() => setPage(Math.floor((items.length - 1) / 100))}
            >
              Last questions
            </button>
            <label>
              Go to question
              <input
                type="number"
                min="1"
                max={items.length}
                placeholder={`1–${items.length}`}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (
                    Number.isInteger(value) &&
                    value >= 1 &&
                    value <= items.length
                  )
                    setPage(Math.floor((value - 1) / 100));
                }}
              />
            </label>
          </div>
        )}
        <div className="navigator-legend">
          {[
            ["unanswered", "Unanswered"],
            ["correct", "Solved first try"],
            ["mixed", "Solved after mistake"],
            ["previously-correct", "Previously correct"],
            ["previously-incorrect", "Previously incorrect"],
            ["previously-corrected", "Corrected in earlier practice"],
            ["checked-current", "Checked in current session"],
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
