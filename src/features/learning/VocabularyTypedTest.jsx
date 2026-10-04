import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import ContentState from "../books/ContentState.jsx";
import useContent from "../books/useContent.js";
import useAction from "./useAction.js";
import { rpc } from "./api.js";

export function VocabularyTestHistory() {
  const [page, setPage] = useState(0);
  const state = useContent(
    () => rpc("vocabulary_typed_history", { p_page: page }),
    [page],
  );
  return (
    <section className="card learning-panel">
      <h2>Saved typed tests</h2>
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.map((s) => (
        <article className="vocab-test-history" key={s.id}>
          <div>
            <strong>{s.title}</strong>
            <p>
              {new Date(s.created_at).toLocaleDateString()} · {s.answered}/
              {s.item_count} answered
              {s.submitted_at ? ` · ${s.correct} correct` : " · In progress"}
            </p>
          </div>
          <Link
            className="button button-secondary button-compact"
            to={`/vocabulary/test/${s.id}`}
          >
            {s.submitted_at ? "View results" : "Resume test"}
          </Link>
        </article>
      ))}
      {state.data?.length === 0 && (
        <p>No saved typed tests yet. Choose sets, then Test → Typed recall.</p>
      )}
      <div className="button-row">
        {page > 0 && (
          <button
            className="button button-secondary"
            onClick={() => setPage((p) => p - 1)}
          >
            Newer tests
          </button>
        )}
        {state.data?.length === 20 && (
          <button
            className="button button-secondary"
            onClick={() => setPage((p) => p + 1)}
          >
            Older tests
          </button>
        )}
      </div>
    </section>
  );
}
export default function VocabularyTypedTest() {
  const { sessionId } = useParams();
  return <TypedTest key={sessionId} sessionId={sessionId} />;
}
function TypedTest({ sessionId }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0),
    [index, setIndex] = useState(0),
    [mistakes, setMistakes] = useState(false),
    [answer, setAnswer] = useState(""),
    [confirmFinish, setConfirmFinish] = useState(false);
  const action = useAction(),
    initialized = useRef(false),
    timer = useRef({ start: Date.now(), elapsed: 0, active: !document.hidden }),
    pending = useRef(null);
  const state = useContent(
    () =>
      rpc("vocabulary_typed_test", {
        p_session: sessionId,
        p_page: page,
        p_mistakes: mistakes,
      }),
    [sessionId, page, mistakes],
  );
  const data = state.data,
    item = data?.items[index],
    submitted = Boolean(data?.session.submitted_at);
  useEffect(() => {
    setPage(0);
    setIndex(0);
    setMistakes(false);
    setAnswer("");
    setConfirmFinish(false);
    initialized.current = false;
  }, [sessionId]);
  useEffect(() => {
    if (!state.loading && data && !initialized.current) {
      initialized.current = true;
      if (!data.session.submitted_at && data.next_position != null) {
        setPage(Math.floor(data.next_position / 100));
        setIndex(data.next_position % 100);
      } else setIndex(0);
    }
  }, [state.loading, data]);
  useEffect(() => {
    setAnswer("");
    pending.current = null;
    timer.current = { start: Date.now(), elapsed: 0, active: !document.hidden };
    const pause = () => {
      const c = timer.current;
      if (c.active) c.elapsed += (Date.now() - c.start) / 1000;
      c.active = false;
    };
    const resume = () => {
      const c = timer.current;
      if (!c.active) {
        c.start = Date.now();
        c.active = !document.hidden;
      }
    };
    const visibility = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
    };
  }, [item?.id, sessionId]);
  const seconds = () => {
    const c = timer.current;
    return Math.min(
      300,
      Math.max(
        0,
        Math.round(c.elapsed + (c.active ? (Date.now() - c.start) / 1000 : 0)),
      ),
    );
  };
  const grade = (e) => {
    e.preventDefault();
    if (!item || action.busy) return;
    action.run(async () => {
      const request = pending.current || {
        p_session: sessionId,
        p_item: item.id,
        p_answer: answer,
        p_seconds: seconds(),
      };
      pending.current = request;
      await rpc("answer_vocabulary_typed_test", request);
      pending.current = null;
      state.reload();
    });
  };
  const changePage = (next) => {
    setIndex(0);
    setPage(next);
  };
  const finish = () =>
    action.run(async () => {
      await rpc("finish_vocabulary_typed_test", { p_session: sessionId });
      setConfirmFinish(false);
      setIndex(0);
      setPage(0);
      state.reload();
    });
  return (
    <>
      <PageHeader
        title={submitted ? "Typed recall results" : "Typed vocabulary recall"}
        eyebrow="Vocabulary test"
        description="Recall the word from its supplied definition. Answers save as you go."
      />
      <Link className="primary-link" to="/vocabulary">
        ← Vocabulary library
      </Link>
      <ContentState {...state} onRetry={state.reload} />
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
      {data && !state.loading && (
        <>
          <section className="card learning-panel">
            {submitted ? (
              <>
                <h2>
                  {Math.round((data.correct / data.session.item_count) * 100)}%
                  score
                </h2>
                <p>
                  {data.correct} correct · {data.incorrect} incorrect ·{" "}
                  {data.session.item_count - data.answered} unanswered
                </p>
                <p>
                  Recall accuracy:{" "}
                  {data.answered
                    ? Math.round((data.correct / data.answered) * 100)
                    : 0}
                  % · {data.mastered} words currently mastered ·{" "}
                  {Math.round(data.session.study_seconds / 60)} active minutes
                </p>
                <p>
                  Mastery requires successful recall across several days.
                  Incorrect words return to spaced review.
                </p>
                <div className="button-row">
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setMistakes((m) => !m);
                      setPage(0);
                      setIndex(0);
                    }}
                  >
                    {mistakes ? "Review all answers" : "Review mistakes"}
                  </button>
                  {data.incorrect > 0 && (
                    <button
                      className="button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          const id = await rpc("start_vocabulary_typed_test", {
                            p_count: 0,
                            p_retry: sessionId,
                          });
                          navigate(`/vocabulary/test/${id}`);
                        })
                      }
                    >
                      Practice incorrect words
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2>
                  {data.answered} of {data.session.item_count} answers saved
                </h2>
                <p>
                  You can leave and resume this test from the vocabulary
                  library.
                </p>
                {!confirmFinish ? (
                  <button
                    className="button button-secondary"
                    disabled={action.busy}
                    onClick={() => setConfirmFinish(true)}
                  >
                    Submit test
                  </button>
                ) : (
                  <div className="button-row">
                    <p>
                      {data.session.item_count - data.answered} unanswered.
                      Submit for final results?
                    </p>
                    <button
                      className="button"
                      disabled={action.busy}
                      onClick={finish}
                    >
                      Confirm submission
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => setConfirmFinish(false)}
                    >
                      Keep studying
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          {item ? (
            <section className="card learning-panel typed-test-player">
              <small>
                Question {item.position + 1} of {data.session.item_count} ·{" "}
                {item.question.set_title}
              </small>
              <h2>Which word matches this definition?</h2>
              <p className="typed-test-definition">
                {item.question.definition}
              </p>
              {item.question.part_of_speech && (
                <p>{item.question.part_of_speech}</p>
              )}
              {item.answered_at || submitted ? (
                <div className="typed-test-feedback" role="status">
                  <strong>
                    {item.answered_at
                      ? item.correct
                        ? "Correct"
                        : "Needs review"
                      : "Unanswered"}
                    : {item.feedback.word}
                  </strong>
                  <p>Your answer: {item.selected_text || "—"}</p>
                  {item.feedback.example && <p>{item.feedback.example}</p>}
                </div>
              ) : (
                <form onSubmit={grade}>
                  <label>
                    Your word
                    <input
                      autoFocus
                      maxLength={200}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      disabled={action.busy}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={action.busy || !answer.trim()}
                  >
                    Check answer
                  </button>
                </form>
              )}
              <div className="button-row">
                <button
                  className="button button-secondary"
                  disabled={index === 0 || action.busy}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  Previous word
                </button>
                <button
                  className="button"
                  disabled={index >= data.items.length - 1 || action.busy}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  Next word
                </button>
              </div>
            </section>
          ) : (
            <p>
              {mistakes
                ? "No incorrect words in this test."
                : "No words on this page."}
            </p>
          )}
          {data.total > 100 && (
            <div className="button-row">
              <button
                className="button button-secondary"
                disabled={page === 0 || action.busy}
                onClick={() => changePage(page - 1)}
              >
                Previous 100 questions
              </button>
              <span>
                Page {page + 1} of {Math.ceil(data.total / 100)}
              </span>
              <button
                className="button button-secondary"
                disabled={(page + 1) * 100 >= data.total || action.busy}
                onClick={() => changePage(page + 1)}
              >
                Next 100 questions
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
