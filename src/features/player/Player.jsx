import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { getPractice, savePractice, finishPractice } from "../books/api.js";
import Stimulus from "./Stimulus.jsx";
import Navigator from "./Navigator.jsx";
import { practiceSummary } from "./model.js";
export default function Player() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const state = useContent(() => getPractice(sessionId), [sessionId]);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const unsaved = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  useEffect(() => {
    alive.current = true;
    const warn = (e) => {
      if (unsaved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false;
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  useEffect(() => {
    if (state.data) {
      setItems(state.data.items);
      setIndex((i) => Math.min(i, Math.max(0, state.data.items.length - 1)));
      unsaved.current = false;
    }
  }, [state.data]);
  function persist(snapshot) {
    const version = ++revision.current;
    unsaved.current = true;
    pending.current++;
    setSaving(true);
    const request = queue.current
      .catch(() => {})
      .then(() => savePractice(sessionId, snapshot));
    queue.current = request;
    request
      .then(
        () => {
          if (version === revision.current) unsaved.current = false;
          if (alive.current) setError("");
        },
        (e) => {
          if (alive.current) setError(e.message);
        },
      )
      .finally(() => {
        pending.current--;
        if (alive.current) setSaving(pending.current > 0);
      });
    return request;
  }
  function change(patch) {
    const updated = { ...items[index], ...patch };
    setItems((previous) =>
      previous.map((item) => (item.id === updated.id ? updated : item)),
    );
    persist([updated]);
  }
  async function submit() {
    if (
      !window.confirm(
        "Submit this practice? Unanswered questions will remain unanswered, and answers cannot be changed afterward.",
      )
    )
      return;
    setSubmitting(true);
    setError("");
    try {
      await persist(items);
      await finishPractice(sessionId);
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }
  async function leave() {
    try {
      if (!state.data.session.submitted_at) await persist(items);
      navigate("/books");
    } catch (e) {
      setError(e.message);
    }
  }
  if (state.loading || state.error)
    return <ContentState {...state} onRetry={state.reload} />;
  if (!items.length)
    return (
      <p className="card" role="status">
        Preparing your questions…
      </p>
    );
  const { session, review } = state.data;
  const submitted = Boolean(session.submitted_at);
  const current = items[index];
  const q = current.question;
  const answer = review.find((v) => v.item_id === current.id);
  const result = practiceSummary(items);
  return (
    <div className="practice-page">
      <div className="practice-heading">
        <div>
          <p className="eyebrow">
            {submitted ? "Practice review" : "Book practice"}
          </p>
          <h1>{session.title}</h1>
        </div>
        <button
          className="button button-secondary"
          onClick={leave}
          disabled={submitting}
        >
          Back to books
        </button>
      </div>
      {submitted && (
        <section className="practice-results" aria-label="Practice results">
          <div>
            <small>Score</small>
            <strong>
              {result.correct} / {result.total}
            </strong>
          </div>
          <div>
            <small>Correct</small>
            <strong>{result.correct}</strong>
          </div>
          <div>
            <small>Incorrect</small>
            <strong>{result.incorrect}</strong>
          </div>
          <div>
            <small>Unanswered</small>
            <strong>{result.unanswered}</strong>
          </div>
          <div>
            <small>Accuracy of answers</small>
            <strong>
              {result.accuracy == null ? "—" : `${result.accuracy}%`}
            </strong>
          </div>
        </section>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
          {!submitted && (
            <button
              className="button button-secondary button-compact"
              onClick={() => persist(items)}
            >
              Retry saving
            </button>
          )}
        </div>
      )}
      <div className="player-toolbar">
        <strong>
          Question {index + 1} of {items.length}
        </strong>
        <span role="status">
          {submitted
            ? "Submitted"
            : saving
              ? "Saving answers…"
              : error
                ? "Save failed"
                : "All changes saved"}
        </span>
        <button
          className={`button button-secondary button-compact ${current.marked ? "marked-control" : ""}`}
          disabled={submitted || submitting}
          onClick={() => change({ marked: !current.marked })}
        >
          {current.marked ? "Marked for review" : "Mark for review"}
        </button>
      </div>
      <div className="question-player">
        <Stimulus question={q} />
        <section
          className="answer-panel"
          aria-label="Question and answer choices"
        >
          <div className="question-meta">
            <span>{q.domain || "SAT practice"}</span>
            <span>{q.difficulty}</span>
          </div>
          <h2 className="question-text">{q.question_text}</h2>
          <fieldset
            className="answer-choices"
            disabled={submitted || submitting}
          >
            <legend className="visually-hidden">Choose your answer</legend>
            {q.options.map((option, i) => {
              const eliminated = current.eliminated.includes(i);
              return (
                <div
                  key={i}
                  className={`answer-choice ${current.selected_answer === i ? "selected" : ""} ${eliminated ? "eliminated" : ""} ${submitted && answer?.correct_answer === i ? "correct-choice" : ""} ${submitted && current.selected_answer === i && current.correct === false ? "incorrect-choice" : ""}`}
                >
                  <label>
                    <input
                      type="radio"
                      name={`answer-${current.id}`}
                      value={i}
                      checked={current.selected_answer === i}
                      disabled={eliminated}
                      onChange={() => change({ selected_answer: i })}
                    />
                    <span className="choice-letter">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{option}</span>
                  </label>
                  {!submitted && (
                    <button
                      className="eliminate-choice"
                      type="button"
                      aria-label={`${eliminated ? "Restore" : "Eliminate"} choice ${String.fromCharCode(65 + i)}`}
                      aria-pressed={eliminated}
                      onClick={() =>
                        change({
                          eliminated: eliminated
                            ? current.eliminated.filter((v) => v !== i)
                            : [...current.eliminated, i],
                          selected_answer:
                            current.selected_answer === i
                              ? null
                              : current.selected_answer,
                        })
                      }
                    >
                      {eliminated ? "↶" : "×"}
                    </button>
                  )}
                </div>
              );
            })}
          </fieldset>
          {submitted && answer && (
            <section className="question-explanation">
              <h3>
                {current.selected_answer == null
                  ? "Unanswered"
                  : current.correct
                    ? "Correct"
                    : "Incorrect"}{" "}
                · Correct answer:{" "}
                {String.fromCharCode(65 + answer.correct_answer)}
              </h3>
              <p className="reading-text">
                {answer.explanation ||
                  "No explanation was provided for this question."}
              </p>
            </section>
          )}
        </section>
      </div>
      <div className="player-footer">
        <button
          className="button button-secondary"
          disabled={index === 0 || submitting}
          onClick={() => setIndex((i) => i - 1)}
        >
          Previous
        </button>
        <span>
          {items.filter((i) => i.selected_answer != null).length} /{" "}
          {items.length} answered
        </span>
        <div className="inline-actions">
          <button
            className="button button-secondary"
            disabled={index === items.length - 1 || submitting}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </button>
          {!submitted && (
            <button className="button" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : "Submit practice"}
            </button>
          )}
        </div>
      </div>
      <Navigator
        items={items}
        current={index}
        onNavigate={setIndex}
        submitted={submitted}
      />
    </div>
  );
}
