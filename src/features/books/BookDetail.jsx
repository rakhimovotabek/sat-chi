import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import BookCover from "../../components/BookCover.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import {
  getBook,
  getTopics,
  deleteBook,
  deleteTopic,
  startPractice,
} from "./api.js";
import BookApproval from "./BookApproval.jsx";
import BookForm from "./BookForm.jsx";
import TopicForm from "./TopicForm.jsx";
import TopicQuestions from "./TopicQuestions.jsx";
function TopicTree({
  topics,
  parent = null,
  bookId,
  admin,
  onSelect,
  onEdit,
  onDelete,
  onPractice,
  busy,
}) {
  return (
    <ul className="topic-tree">
      {topics
        .filter((t) => t.parent_id === parent)
        .map((t) => (
          <li key={t.id}>
            <div className="topic-row">
              <div>
                <strong>
                  {admin ? (
                    t.title
                  ) : (
                    <Link to={`/books/${bookId}/topics/${t.id}`}>
                      {t.title} →
                    </Link>
                  )}
                </strong>
                <small>{t.questions?.[0]?.count || 0} direct questions</small>
                {!admin && t.progress && (
                  <small>
                    {t.progress.solved} / {t.progress.total} solved ·{" "}
                    {t.progress.checked} checked
                  </small>
                )}
              </div>
              <div className="inline-actions">
                {admin ? (
                  <>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => onSelect(t)}
                    >
                      Questions
                    </button>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => onEdit(t)}
                    >
                      Edit topic
                    </button>
                    <button
                      className="button button-danger button-compact"
                      disabled={busy}
                      onClick={() => onDelete(t)}
                    >
                      Delete topic
                    </button>
                  </>
                ) : (
                  <button
                    className="button button-compact"
                    disabled={busy}
                    onClick={() => onPractice(t)}
                  >
                    Start practice
                  </button>
                )}
              </div>
            </div>
            <TopicTree
              topics={topics}
              parent={t.id}
              bookId={bookId}
              admin={admin}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onPractice={onPractice}
              busy={busy}
            />
          </li>
        ))}
    </ul>
  );
}
export default function BookDetail({ admin = false }) {
  const { bookId, topicId } = useParams();
  const navigate = useNavigate();
  const state = useContent(
    async () => ({
      book: await getBook(bookId),
      topics: await getTopics(bookId),
    }),
    [bookId],
  );
  const [editing, setEditing] = useState(false);
  const [topicForm, setTopicForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function perform(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const removeBook = () => {
    if (
      window.confirm(
        "Delete this book, all topics and questions? Existing practice snapshots remain available.",
      )
    )
      perform(async () => {
        await deleteBook(bookId);
        navigate("/admin/books");
      });
  };
  const removeTopic = (t) => {
    if (
      window.confirm(
        "Delete this topic, its subtopics, and all their questions?",
      )
    )
      perform(async () => {
        await deleteTopic(t.id);
        setSelected(null);
        state.reload();
      });
  };
  if ((state.loading && !state.data) || state.error)
    return <ContentState {...state} onRetry={state.reload} />;
  const { book, topics } = state.data;
  const focused = topicId ? topics.find((t) => t.id === topicId) : null;
  if (topicId && !focused)
    return (
      <ContentState error="This topic is unavailable." onRetry={state.reload} />
    );
  const progressTopics = focused
    ? [focused]
    : topics.filter((t) => !t.parent_id);
  const progress = progressTopics.reduce(
    (sum, t) => ({
      solved: sum.solved + (t.progress?.solved || 0),
      total: sum.total + (t.progress?.total || 0),
    }),
    { solved: 0, total: 0 },
  );
  return (
    <>
      <Link className="card-link" to={admin ? "/admin/books" : "/books"}>
        ← All books
      </Link>
      <div className="book-detail-heading">
        {!focused && <BookCover book={book} className="book-detail-cover" />}
        <PageHeader
          eyebrow={book.category}
          title={focused?.title || book.title}
          description={book.description || "Choose a topic to begin."}
        />
      </div>
      {!admin && (
        <p>
          {progress.solved} / {progress.total} questions solved
        </p>
      )}
      {admin && (
        <div className="button-row">
          <span className="subtle-badge">
            {book.published ? "Published" : "Draft"}
          </span>
          <button
            className="button button-secondary"
            onClick={() => setEditing(true)}
          >
            Edit book
          </button>
          <button className="button" onClick={() => setTopicForm({})}>
            Create topic
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={removeBook}
          >
            Delete book
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {admin && <BookApproval bookId={bookId} onPublished={state.reload} />}
      {editing && (
        <BookForm
          book={book}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            state.reload();
          }}
        />
      )}
      {topicForm && (
        <TopicForm
          key={topicForm.id || "new"}
          bookId={bookId}
          topics={topics}
          topic={topicForm.id ? topicForm : null}
          onCancel={() => setTopicForm(null)}
          onSaved={() => {
            setTopicForm(null);
            state.reload();
          }}
        />
      )}
      <section className="card topic-section">
        {focused && (
          <>
            <Link className="card-link" to={`/books/${bookId}`}>
              ← {book.title}
            </Link>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  perform(async () =>
                    navigate(`/practice/${await startPractice(focused.id)}`),
                  )
                }
              >
                Start topic practice
              </button>
            </div>
          </>
        )}
        <h2>{focused ? "Subtopics" : "Topics & subtopics"}</h2>
        <p className="page-description">
          Practice a topic includes its subtopics. Question answers are revealed
          after submission.
        </p>
        {topics.length ? (
          <TopicTree
            topics={topics}
            parent={topicId || null}
            bookId={bookId}
            admin={admin}
            busy={busy}
            onSelect={setSelected}
            onEdit={setTopicForm}
            onDelete={removeTopic}
            onPractice={(t) =>
              perform(async () =>
                navigate(`/practice/${await startPractice(t.id)}`),
              )
            }
          />
        ) : (
          <p className="page-description">No topics have been added yet.</p>
        )}
      </section>
      {admin && selected && (
        <TopicQuestions
          key={selected.id}
          topic={topics.find((t) => t.id === selected.id) || selected}
          onChanged={state.reload}
        />
      )}
    </>
  );
}
