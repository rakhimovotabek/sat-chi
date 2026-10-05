import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import {
  getPractice,
  savePractice,
  finishPractice,
  checkBankAnswer,
  checkBankResponse,
} from "../books/api.js";
import useStudyTimer from "./useStudyTimer.js";
import MathTools from "./MathTools.jsx";
import { formatTime, sectionResults } from "../learning/homework-model.js";
import Stimulus from "./Stimulus.jsx";
import QuestionImage from "../../components/QuestionImage.jsx";
import BookExplanation from "./BookExplanation.jsx";
import Navigator from "./Navigator.jsx";
import { practiceSummary } from "./model.js";
export default function Player() {
  const { session: auth, profile } = useAuth();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const state = useContent(() => getPractice(sessionId), [sessionId]);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [toolsTarget, setToolsTarget] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const checkEvent = useRef(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const unsaved = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const ownsSession = state.data?.session.student_id === auth.user.id;
  const study = useStudyTimer(
    sessionId,
    index,
    state.data?.session,
    items.length > 0 &&
      ownsSession &&
      !overviewOpen &&
      !items[index]?.solved_at,
  );
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
      setIndex((i) =>
        Math.min(
          state.data.session.current_position ?? i,
          Math.max(0, state.data.items.length - 1),
        ),
      );
      unsaved.current = false;
    }
  }, [state.data]);
  const autoSubmitted = useRef(false);
  useEffect(() => {
    const s = state.data?.session;
    if (
      !items.length ||
      !ownsSession ||
      s?.kind === "bank" ||
      !s?.timed ||
      !s.time_limit ||
      s.submitted_at ||
      autoSubmitted.current
    )
      return;
    if (study.now >= new Date(s.started_at).getTime() + s.time_limit * 1000) {
      autoSubmitted.current = true;
      queue.current
        .catch(() => {})
        .then(() => study.flush())
        .then(() => finishPractice(sessionId))
        .then(() => state.reload())
        .catch(() => {
          autoSubmitted.current = false;
          setError("Time limit reached. Submit your saved answers to retry.");
        });
    }
  }, [study.now, items.length, state.data, sessionId]);
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
    checkEvent.current = null;
    const updated = { ...items[index], ...patch };
    if (state.data.session.kind === "book")
      updated.has_answered =
        updated.has_answered ||
        updated.selected_answer != null ||
        Boolean(updated.selected_response?.trim());
    setItems((previous) =>
      previous.map((item) => (item.id === updated.id ? updated : item)),
    );
    persist([updated]);
  }
  async function check() {
    const item = items[index];
    if (item.selected_answer == null || checking) return;
    checkEvent.current ||= crypto.randomUUID();
    setChecking(true);
    setError("");
    try {
      await queue.current;
      await study.flush();
      const attempt = await (
        item.question.question_type === "open"
          ? checkBankResponse
          : checkBankAnswer
      )(
        sessionId,
        item.id,
        item.question.question_type === "open"
          ? item.selected_response
          : item.selected_answer,
        checkEvent.current,
      );
      setItems((rows) =>
        rows.map((i) =>
          i.id === item.id
            ? {
                ...i,
                correct: attempt.correct,
                solved_at: attempt.correct ? attempt.created_at : null,
                attempts: [
                  ...(i.attempts || []).filter((a) => a.id !== attempt.id),
                  attempt,
                ],
              }
            : i,
        ),
      );
      checkEvent.current = null;
      if (
        attempt.correct &&
        items.every((i) => i.id === item.id || i.solved_at)
      )
        state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
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
      const s = state.data.session;
      if (
        !s.timed ||
        !s.time_limit ||
        Date.now() < new Date(s.started_at).getTime() + s.time_limit * 1000
      )
        await persist(items);
      await study.flush();
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
      await study.flush();
      navigate(
        state.data.session.kind === "homework"
          ? "/homework"
          : state.data.session.kind === "bank"
            ? profile.role === "admin"
              ? "/admin/question-bank"
              : "/question-bank"
            : state.data.session.kind === "vocabulary"
              ? "/vocabulary"
              : "/books",
      );
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
  if (!ownsSession)
    return <Navigate to={`/admin/sessions/${sessionId}`} replace />;
  const { session, review } = state.data;
  const submitted = Boolean(session.submitted_at);
  const practice = session.kind === "bank";
  const current = items[index];
  const q = current.question;
  const isBook = session.kind === "book";
  const openResponse = q.question_type === "open";
  const usableChoices =
    q.options?.length === 4 &&
    q.options.every(
      (option, i) =>
        (option.trim() || q.option_image_urls?.[i]) &&
        !/^Choice [A-D] in the source image$/i.test(option),
    );
  const answer = review.find((v) => v.item_id === current.id);
  const result = practiceSummary(items);
  return (
    <div className="practice-page">
      <div className="practice-heading">
        <div>
          <p className="eyebrow">
            {submitted
              ? "Practice review"
              : session.kind === "bank"
                ? "Question Bank practice"
                : "Book practice"}
          </p>
          <h1>{session.title}</h1>
        </div>
        <button
          className="button button-secondary"
          onClick={leave}
          disabled={submitting}
        >
          Back to practice
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
      {study.warning && <p className="empty-copy">{study.warning}</p>}
      {submitted && (
        <section className="card learning-panel">
          <h2>Section results</h2>
          <div className="section-list">
            {sectionResults(items).map((s) => (
              <div key={s.name} className="list-row">
                <strong>{s.name}</strong>
                <span>
                  {s.correct} correct · {s.incorrect} incorrect · {s.unanswered}{" "}
                  unanswered
                </span>
              </div>
            ))}
          </div>
          <p>Study time: {formatTime(state.data.session.elapsed_seconds)}</p>
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
        <span className="practice-clock">
          {session.timed ? "Time remaining · " : "Study time · "}
          {formatTime(
            session.timed && session.time_limit
              ? Math.max(
                  0,
                  session.time_limit -
                    Math.floor(
                      (study.now - new Date(session.started_at).getTime()) /
                        1000,
                    ),
                )
              : study.elapsed,
          )}
          {session.time_limit ? ` / ${formatTime(session.time_limit)}` : ""}
        </span>
        {practice || isBook ? (
          <span
            className="player-math-tools"
            ref={setToolsTarget}
            hidden={q.section !== "Math"}
          />
        ) : (
          q.section === "Math" && <MathTools />
        )}

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
      <div className="practice-workspace" ref={setWorkspace}>
        {(practice || isBook) && workspace && (
          <MathTools
            key={sessionId}
            workspace={workspace}
            toolbar={toolsTarget}
            sessionId={sessionId}
            enabled={q.section === "Math"}
          />
        )}
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
            <p className="answer-state">
              {openResponse
                ? current.selected_response?.trim()
                  ? "Answer entered"
                  : "No answer entered"
                : current.selected_answer == null
                  ? "No answer selected"
                  : `Answer ${String.fromCharCode(65 + current.selected_answer)} selected`}
            </p>
            <h2 className="question-text">{q.question_text}</h2>
            {openResponse ? (
              <label className="book-open-response">
                Your answer
                <input
                  type="text"
                  inputMode="text"
                  maxLength={200}
                  value={current.selected_response ?? ""}
                  disabled={
                    submitted ||
                    submitting ||
                    checking ||
                    Boolean(current.solved_at)
                  }
                  onChange={(e) =>
                    change({
                      selected_response: e.target.value,
                      selected_answer: e.target.value.trim() ? 0 : null,
                    })
                  }
                />
              </label>
            ) : (
              <fieldset
                className="answer-choices"
                disabled={
                  submitted ||
                  submitting ||
                  checking ||
                  (practice && Boolean(current.solved_at)) ||
                  !usableChoices
                }
              >
                <legend className="visually-hidden">Choose your answer</legend>
                {!usableChoices && (
                  <p role="alert">
                    This question’s answer choices need recovery. It is excluded
                    from new graded practice.
                  </p>
                )}
                {usableChoices &&
                  q.options.map((option, i) => {
                    const eliminated = current.eliminated.includes(i);
                    return (
                      <div
                        key={i}
                        className={`answer-choice ${current.selected_answer === i ? "selected" : ""} ${eliminated ? "eliminated" : ""} ${(submitted && answer?.correct_answer === i) || (practice && current.attempts?.some((a) => a.selected_answer === i && a.correct)) ? "correct-choice" : ""} ${(submitted && current.selected_answer === i && current.correct === false) || (practice && current.attempts?.some((a) => a.selected_answer === i && !a.correct)) ? "incorrect-choice" : ""}`}
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
                          <span
                            className={`choice-letter ${q.option_image_urls?.[i] && q.import_metadata?.option_labels_in_images ? "visually-hidden" : ""}`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          {q.option_image_urls?.[i] ? (
                            <span className="book-option-content">
                              <QuestionImage
                                src={q.option_image_urls[i]}
                                allowZoom={false}
                                alt={`Choice ${String.fromCharCode(65 + i)}`}
                              />
                              {option && <span>{option}</span>}
                            </span>
                          ) : (
                            <span>{option}</span>
                          )}
                        </label>
                        {!submitted && !current.solved_at && (
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
                                selected_answer: current.selected_answer,
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
            )}
            {(isBook || practice) && (
              <BookExplanation
                key={`${sessionId}/${current.id}`}
                sessionId={sessionId}
                item={current}
                waitForSave={() => queue.current}
              />
            )}
            {practice && current.attempts?.length > 0 && (
              <div className="attempt-feedback" aria-live="polite">
                <p>
                  {current.solved_at
                    ? "Solved. Continue to the next question."
                    : "That answer is incorrect. Try another choice."}
                </p>
                <ol>
                  {current.attempts.map((a) => (
                    <li key={a.id}>
                      Attempt {a.attempt_order}:{" "}
                      {a.selected_response ??
                        String.fromCharCode(65 + a.selected_answer)}{" "}
                      · {a.correct ? "Correct" : "Incorrect"} ·{" "}
                      {formatTime(a.active_seconds)} active time
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {submitted && answer && (
              <section className="question-explanation">
                <h3>
                  {current.selected_answer == null
                    ? "Unanswered"
                    : current.correct
                      ? "Correct"
                      : "Incorrect"}{" "}
                  · Correct answer:{" "}
                  {openResponse
                    ? answer.accepted_answers?.join(" or ")
                    : String.fromCharCode(65 + answer.correct_answer)}
                </h3>
                {isBook ? null : (
                  <p className="reading-text">
                    {answer.explanation ||
                      "No explanation was provided for this question."}
                  </p>
                )}
              </section>
            )}
          </section>
        </div>
      </div>
      <div className="player-footer">
        <button
          className="button button-secondary"
          disabled={index === 0 || submitting}
          onClick={() => setIndex((i) => i - 1)}
        >
          Previous
        </button>
        <button
          className="button button-secondary overview-trigger"
          onClick={() => setOverviewOpen(true)}
          aria-haspopup="dialog"
        >
          Question {index + 1} of {items.length}
        </button>
        <div className="inline-actions">
          <button
            className={`button ${practice && current.solved_at ? "" : "button-secondary"}`}
            disabled={index === items.length - 1 || submitting || checking}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </button>
          {practice && !submitted && !current.solved_at && (
            <button
              className="button"
              disabled={
                checking ||
                saving ||
                current.selected_answer == null ||
                current.eliminated.includes(current.selected_answer)
              }
              onClick={check}
            >
              {checking ? "Checking…" : "Check"}
            </button>
          )}
          {!practice && !submitted && (
            <button className="button" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : "Submit practice"}
            </button>
          )}
        </div>
      </div>
      {overviewOpen && (
        <Navigator
          items={items}
          current={index}
          onNavigate={setIndex}
          submitted={submitted}
          practice={practice}
          onClose={() => setOverviewOpen(false)}
        />
      )}
    </div>
  );
}
