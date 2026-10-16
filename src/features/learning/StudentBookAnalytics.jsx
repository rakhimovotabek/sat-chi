import { useState } from "react";
import { Link, useParams } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import AdminAnswer from "./AdminAnswer.jsx";
import { rpc } from "./api.js";

export function StudentBookAnalytics({ student }) {
  const [page, setPage] = useState(0);
  const state = useContent(
    () => rpc("admin_student_books", { p_student: student, p_page: page }),
    [student, page],
  );
  return (
    <section className="card learning-panel">
      <h2>Book-by-book progress</h2>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <div className="learning-columns">
            {Object.entries(state.data.channels).map(([kind, data]) => (
              <div key={kind}>
                <h3>
                  {kind === "book"
                    ? "Book Practice"
                    : kind === "bank"
                      ? "Question Bank"
                      : "Homework"}
                </h3>
                <p>
                  {data.attempted} distinct attempted ·{" "}
                  {data.first_accuracy == null
                    ? "—"
                    : `${data.first_accuracy}%`}{" "}
                  first-attempt accuracy · {data.eventually_correct} eventually
                  correct
                </p>
              </div>
            ))}
          </div>
          {!state.data.books.length && (
            <p className="empty-copy">No recorded book activity.</p>
          )}
          <div className="item-list">
            {state.data.books.map((b) => {
              const p = state.data.progress.find((r) => r.book_id === b.id);
              return (
                <Link
                  className="list-button"
                  key={b.id}
                  to={`/admin/students/${student}/books/${b.id}`}
                >
                  <strong>{b.title}</strong>
                  <span>
                    {p.attempted} / {p.total} attempted · {p.first_correct}{" "}
                    first correct · {p.first_incorrect} first incorrect
                  </span>
                  <small>
                    {p.first_accuracy == null
                      ? "First-attempt accuracy unavailable"
                      : `${p.first_accuracy}% first-attempt accuracy`}
                    {p.first_unknown > 0 ? " · partial history" : ""} ·{" "}
                    {p.eventually_correct} eventually correct · Review read-only
                    →
                  </small>
                </Link>
              );
            })}
          </div>
          {state.data.total > 25 && (
            <div className="button-row">
              <button
                className="button button-secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous books
              </button>
              <button
                className="button button-secondary"
                disabled={(page + 1) * 25 >= state.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next books
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function QuestionReview({ student, book, question }) {
  const state = useContent(
    () =>
      rpc("admin_student_book_question", {
        p_student: student,
        p_book: book,
        p_question: question,
      }),
    [student, book, question],
  );
  const [historyPage, setHistoryPage] = useState(0);
  const history = useContent(
    () =>
      state.data?.item.session_id && historyPage > 0
        ? rpc("practice_history_events", {
            p_session: state.data.item.session_id,
            p_item: state.data.item.id,
            p_page: historyPage,
          })
        : Promise.resolve(null),
    [state.data?.item.id, historyPage],
  );
  const events = historyPage > 0 ? history.data : state.data?.history;
  return (
    <section
      className="card learning-panel"
      aria-label="Read-only student answer"
    >
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <p>
            <strong>
              Initial result:{" "}
              {state.data.first_correct == null
                ? "Unavailable"
                : state.data.first_correct
                  ? "Correct"
                  : "Incorrect"}
            </strong>{" "}
            · Currently{" "}
            {state.data.now_correct == null
              ? "ungraded"
              : state.data.now_correct
                ? "correct"
                : "incorrect"}{" "}
            ·{" "}
            {state.data.eventually_correct
              ? "Eventually solved correctly"
              : "Not yet solved correctly"}
          </p>
          <AdminAnswer item={state.data.item} review={state.data.review} />
          <h3>Recorded attempts and grading history</h3>
          <ContentState {...history} onRetry={history.reload} />
          {events?.rows.length ? (
            <ol>
              {events.rows.map((a) => (
                <li key={a.id}>
                  {a.selected_response ??
                    (a.selected_answer == null
                      ? "Unavailable"
                      : `Choice ${String.fromCharCode(65 + a.selected_answer)}`)}{" "}
                  ·{" "}
                  {a.correct == null
                    ? "Pending"
                    : a.correct
                      ? "Correct"
                      : "Incorrect"}{" "}
                  · {a.source} ·{" "}
                  {a.source === "legacy"
                    ? "Snapshot; original answer time unavailable"
                    : new Date(a.created_at).toLocaleString()}
                  {a.source === "legacy" && !a.first_known
                    ? " · original first outcome unknown"
                    : ""}
                </li>
              ))}
            </ol>
          ) : (
            <p>No recorded attempt history.</p>
          )}
          {events?.total > 50 && (
            <div className="button-row">
              <button
                disabled={!historyPage}
                onClick={() => setHistoryPage(historyPage - 1)}
              >
                Earlier history
              </button>
              <button
                disabled={(historyPage + 1) * 50 >= events.total}
                onClick={() => setHistoryPage(historyPage + 1)}
              >
                Later history
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function StudentBookReview() {
  const { studentId, bookId } = useParams();
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(null);
  const state = useContent(
    () =>
      rpc("admin_student_book_outline", {
        p_student: studentId,
        p_book: bookId,
        p_filter: filter,
        p_page: page,
      }),
    [studentId, bookId, filter, page],
  );
  const question = selected || state.data?.rows[0]?.question_id;
  return (
    <>
      <Link className="primary-link" to={`/admin/students/${studentId}`}>
        ← Student profile
      </Link>
      <PageHeader
        title="Student book review"
        description="Read-only learning history. This viewer cannot submit answers or change grades."
      />
      <section className="card learning-panel">
        <h2>Question Overview</h2>
        <label>
          Show questions
          <select
            aria-label="Show questions"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
              setSelected(null);
            }}
          >
            {[
              ["all", "All"],
              ["first_correct", "Correct on first attempt"],
              ["first_incorrect", "Incorrect on first attempt"],
              ["corrected", "Corrected later"],
              ["unanswered", "Unanswered"],
              ["pending", "Pending review"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <ContentState {...state} onRetry={state.reload} />
        <div className="question-numbers">
          {state.data?.rows.map((q) => (
            <button
              className={`question-number ${q.first_correct === false && q.eventually_correct ? "is-mixed" : q.first_correct === true ? "is-correct" : q.first_correct === false ? "is-incorrect" : ""}`}
              key={q.question_id}
              aria-pressed={question === q.question_id}
              aria-label={`Review question ${q.position}`}
              onClick={() => setSelected(q.question_id)}
            >
              {q.position}
            </button>
          ))}
        </div>
        {state.data && (
          <div className="button-row">
            <button
              className="button button-secondary"
              disabled={!page}
              onClick={() => {
                setPage(page - 1);
                setSelected(null);
              }}
            >
              Previous questions
            </button>
            <span>{state.data.total} questions</span>
            <button
              className="button button-secondary"
              disabled={(page + 1) * 100 >= state.data.total}
              onClick={() => {
                setPage(page + 1);
                setSelected(null);
              }}
            >
              Next questions
            </button>
          </div>
        )}
        {state.data?.total === 0 && <p>No questions match this filter.</p>}
      </section>
      {question && (
        <QuestionReview
          key={question}
          student={studentId}
          book={bookId}
          question={question}
        />
      )}
    </>
  );
}
