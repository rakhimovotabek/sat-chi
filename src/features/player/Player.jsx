import DrawingLayer from "./DrawingLayer.jsx";
import AnnotationToolbar from "./AnnotationToolbar.jsx";
import FormattedText from "../../components/FormattedText.jsx";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import {
  getPractice,
  savePracticeChanges,
  finishPractice,
  checkBankAnswer,
  checkBankResponse,
  checkBookAnswer,
  checkBookResponse,
} from "../books/api.js";
import useStudyTimer from "./useStudyTimer.js";
import MathTools from "./MathTools.jsx";
import { formatTime, sectionResults } from "../learning/homework-model.js";
import Stimulus from "./Stimulus.jsx";
import QuestionImage from "../../components/QuestionImage.jsx";
import BookExplanation from "./BookExplanation.jsx";
import { preloadQuestionImages } from "../../components/question-image-source.js";
import Navigator from "./Navigator.jsx";
import { practiceSummary, questionAnswerIssue } from "./model.js";
import { createPracticePersistence } from "./practice-persistence.js";
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
  const [drawing, setDrawing] = useState(false),
    [drawingTool, setDrawingTool] = useState("pen"),
    [clearDrawings, setClearDrawings] = useState(0),
    [drawingError, setDrawingError] = useState("");
  const checkEvent = useRef(null);
  const checkPending = useRef(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queue = useRef(Promise.resolve());
  const unsaved = useRef(false);
  const persistence = useRef(null);
  const [saveState, setSaveState] = useState({
    unsaved: false,
    conflicts: [],
    durable: true,
  });
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
    const next = items[index + 1]?.question;
    if (next && ownsSession) preloadQuestionImages(next, auth.user.id);
  }, [items, index, ownsSession, auth.user.id]);
  useEffect(() => {
    const warn = (e) => {
      if (unsaved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  useEffect(() => {
    if (!state.data || !ownsSession) return;
    let storage;
    try {
      storage = window.localStorage;
    } catch {
      /* Visible recovery warning below. */
    }
    const confirmed = new Map(
      (state.background ? persistence.current?.confirmedItems() || [] : []).map(
        (row) => [row.id, row],
      ),
    );
    const incoming = state.data.items.map((row) => {
      const previous = confirmed.get(row.id);
      return previous?.answer_revision > row.answer_revision ? previous : row;
    });
    const controller = createPracticePersistence({
      userId: auth.user.id,
      sessionId,
      items: incoming,
      submitted: Boolean(state.data.session.submitted_at),
      storage,
      save: (changes) => savePracticeChanges(sessionId, changes),
    });
    persistence.current = controller;
    const stop = controller.subscribe((next) => {
      setItems(next.items);
      unsaved.current = next.unsaved;
      setSaving(next.pending > 0);
      setSaveState(next);
    });
    setIndex((previous) =>
      Math.min(
        state.background ? previous : state.data.session.current_position || 0,
        Math.max(0, state.data.items.length - 1),
      ),
    );
    if (controller.state().unsaved && !controller.state().conflicts.length) {
      queue.current = controller.flush();
      queue.current.catch(() => {});
    }
    return stop;
  }, [state.data, sessionId, ownsSession, auth.user.id]);
  // A browser storage failure must not permit a sidebar exit to silently discard
  // the only unsaved copy. Normal navigation uses the durable recovery outbox.
  useEffect(() => {
    const protect = (event) => {
      if (
        unsaved.current &&
        !persistence.current?.state().durable &&
        event.target.closest?.("a[href]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setError(
          "Answer recovery storage is unavailable. Retry saving before leaving.",
        );
      }
    };
    document.addEventListener("click", protect, true);
    return () => document.removeEventListener("click", protect, true);
  }, []);
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
        .then(() => {
          if (unsaved.current) throw new Error("Answers still need saving.");
        })
        .then(() => study.flush())
        .then(() => finishPractice(sessionId))
        .then(() => state.reload())
        .catch(() => {
          autoSubmitted.current = false;
          setError("Time limit reached. Submit your saved answers to retry.");
        });
    }
  }, [study.now, items.length, state.data, sessionId]);
  function persist() {
    const request = persistence.current?.flush() || Promise.resolve();
    queue.current = request;
    request.catch(() => {});
    return request;
  }
  function change(patch) {
    checkEvent.current = null;
    persistence.current.change(items[index].id, patch);
    persist();
  }
  async function check() {
    const item = items[index];
    if (item.selected_answer == null || checkPending.current) return;
    checkPending.current = true;
    const event = (checkEvent.current ||= crypto.randomUUID());
    setChecking(true);
    setError("");
    try {
      await queue.current;
      await study.flush();
      const checkAnswer =
        state.data.session.kind === "book"
          ? item.question.question_type === "open"
            ? checkBookResponse
            : checkBookAnswer
          : item.question.question_type === "open"
            ? checkBankResponse
            : checkBankAnswer;
      const attempt = await checkAnswer(
        sessionId,
        item.id,
        item.question.question_type === "open"
          ? item.selected_response
          : item.selected_answer,
        event,
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
      // Keep the question DOM/images mounted while reconciling authoritative
      // versions after Check changes/locks an answer. Never skip the revision read.
      state.reload({ background: true });
    } catch (e) {
      if (e.code === "PT409" || e.code === "40001")
        state.reload({ background: true });
      setError(e.message);
    } finally {
      checkPending.current = false;
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
      await persist();
      if (unsaved.current)
        throw new Error(
          "Could not save your answers. Retry saving before submitting.",
        );
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
      if (!state.data.session.submitted_at) await persist();
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
  if (!ownsSession)
    return <Navigate to={`/admin/sessions/${sessionId}`} replace />;
  if (!items.length)
    return (
      <p className="card" role="status">
        Preparing your questions…
      </p>
    );
  const { session, review } = state.data;
  const submitted = Boolean(session.submitted_at);
  const practice = ["bank", "book"].includes(session.kind);
  const current = items[index];
  const q = current.question;
  const isBook = session.kind === "book";
  const calculatorWorkspace = ["book", "bank", "homework"].includes(
    session.kind,
  );
  const openResponse = q.question_type === "open";
  const usableChoices = !questionAnswerIssue(q);
  const embeddedChoices =
    q.image_url && q.import_metadata?.questionImageIncludesOptions === true;
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
      {state.refreshError && (
        <div className="form-error" role="alert">
          Could not refresh checked answers. {state.refreshError}
          <button
            type="button"
            className="button button-secondary button-compact"
            onClick={() => state.reload({ background: true })}
          >
            Retry loading saved answers
          </button>
        </div>
      )}
      {(error || saveState.error) && (
        <div className="form-error" role="alert">
          {error || saveState.error}
          {!submitted && (
            <button
              className="button button-secondary button-compact"
              onClick={persist}
            >
              Retry saving
            </button>
          )}
        </div>
      )}
      {saveState.conflicts.length > 0 && (
        <section className="card learning-panel" aria-label="Answer recovery">
          <p>
            Saved answers or homework questions changed. Pending answers remain
            on this device until you review them.
          </p>
          <ul>
            {saveState.recovered?.map((row) => {
              const describe = (values) =>
                values == null
                  ? "Question removed"
                  : (values.selected_response ??
                    (values.selected_answer == null
                      ? "Unanswered"
                      : String.fromCharCode(65 + values.selected_answer)));
              return (
                <li key={row.id}>
                  Question {(row.position ?? 0) + 1}: saved answer:{" "}
                  {describe(row.saved)}; pending answer: {describe(row.pending)}
                </li>
              );
            })}
          </ul>
          <button className="button button-secondary" onClick={state.reload}>
            Reload saved answers
          </button>
          <button
            className="button button-secondary"
            onClick={() => {
              persistence.current.resolve(false);
              state.reload();
            }}
          >
            Keep saved answers
          </button>
          <button
            className="button"
            disabled={!saveState.canUseDrafts}
            onClick={() => {
              persistence.current.resolve(true);
              persist();
            }}
          >
            Use recovered answers
          </button>
        </section>
      )}
      {!saveState.durable && saveState.unsaved && (
        <p role="alert">
          Answer recovery storage is unavailable. Keep this page open until
          saving succeeds.
        </p>
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
        {calculatorWorkspace ? (
          <span
            className="player-math-tools"
            ref={setToolsTarget}
            hidden={q.section !== "Math"}
          />
        ) : (
          q.section === "Math" && <MathTools />
        )}

        {calculatorWorkspace && (
          <AnnotationToolbar
            active={drawing}
            setActive={setDrawing}
            tool={drawingTool}
            setTool={setDrawingTool}
            onClear={() => {
              setDrawingError("");
              setClearDrawings((v) => v + 1);
            }}
          />
        )}
        <span role="status" aria-label="Answer save status">
          {submitted
            ? "Submitted"
            : saving
              ? "Saving answers…"
              : saveState.unsaved
                ? saveState.error
                  ? "Save failed"
                  : "Answers pending"
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
      {drawingError && (
        <p className="annotation-storage-error" role="alert">
          {drawingError}
        </p>
      )}
      <div className="practice-workspace" ref={setWorkspace}>
        {calculatorWorkspace && workspace && (
          <MathTools
            key={sessionId}
            workspace={workspace}
            toolbar={toolsTarget}
            sessionId={sessionId}
            enabled={q.section === "Math"}
          />
        )}
        <div className="question-player">
          <Stimulus question={q}>
            {calculatorWorkspace && (
              <DrawingLayer
                key={`${sessionId}:${q.id || current.id}:passage`}
                userId={auth.user.id}
                sessionId={sessionId}
                questionId={q.id || current.id}
                surface="passage"
                active={drawing}
                tool={drawingTool}
                clearVersion={clearDrawings}
                onStorageError={setDrawingError}
              />
            )}
          </Stimulus>
          <section
            className="answer-panel annotation-surface"
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
            <h2 className="question-text">
              <FormattedText>{q.question_text}</FormattedText>
            </h2>
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
                {embeddedChoices && (
                  <p>Select the matching choice from the question image.</p>
                )}
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
                              {option && (
                                <span>
                                  <FormattedText>{option}</FormattedText>
                                </span>
                              )}
                            </span>
                          ) : (
                            <span>
                              <FormattedText>
                                {embeddedChoices && !option.trim()
                                  ? "Choice in the question image"
                                  : option}
                              </FormattedText>
                            </span>
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
                waitForSave={persist}
              />
            )}
            {practice && current.attempts?.length > 0 && (
              <div
                className={`attempt-feedback answer-result ${current.solved_at ? "correct-choice" : "incorrect-choice"}`}
                aria-live="polite"
              >
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
              <section
                className={`question-explanation answer-result ${current.correct ? "correct-choice" : "incorrect-choice"}`}
              >
                <h3>
                  {current.selected_answer == null
                    ? "Unanswered"
                    : current.correct
                      ? "Correct"
                      : "Incorrect"}{" "}
                  · Correct answer:{" "}
                  {openResponse
                    ? answer.correct_answer ||
                      (answer.accepted_range
                        ? `${answer.accepted_range.min} to ${answer.accepted_range.max}`
                        : answer.accepted_answers?.join(" or "))
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
            {calculatorWorkspace && (
              <DrawingLayer
                key={`${sessionId}:${q.id || current.id}:answers`}
                userId={auth.user.id}
                sessionId={sessionId}
                questionId={q.id || current.id}
                surface="answers"
                active={drawing}
                tool={drawingTool}
                clearVersion={clearDrawings}
                onStorageError={setDrawingError}
              />
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
              type="button"
              onClick={check}
            >
              {checking ? "Checking…" : "Check"}
            </button>
          )}
          {!practice && !submitted && (
            <button className="button" disabled={submitting} onClick={submit}>
              {submitting
                ? "Submitting…"
                : session.kind === "homework"
                  ? "Submit homework"
                  : "Submit practice"}
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
