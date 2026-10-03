import { useState } from "react";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { getQuestions, deleteQuestion } from "./api.js";
import QuestionForm from "./QuestionForm.jsx";
import ImportPanel from "./ImportPanel.jsx";
export default function TopicQuestions({ topic, onChanged = () => {} }) {
  const [page, setPage] = useState(0);
  const state = useContent(
    () => getQuestions(topic.id, page),
    [topic.id, page],
  );
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = () => {
    setPage(0);
    state.reload();
    onChanged();
  };
  async function remove(q) {
    if (
      !window.confirm(
        "Delete this question? Existing practice sessions retain their copy.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteQuestion(q.id);
      changed();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="topic-questions">
      <div className="section-heading">
        <h2>{topic.title} — Questions</h2>
        <div className="button-row">
          <button className="button" onClick={() => setEditing({})}>
            Create question
          </button>
          <button
            className="button button-secondary"
            onClick={() => setImporting((v) => !v)}
          >
            Import questions
          </button>
        </div>
      </div>
      {editing && (
        <QuestionForm
          key={editing.id || "new"}
          topicId={topic.id}
          question={editing.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      )}
      {importing && <ImportPanel topicId={topic.id} onImported={changed} />}
      <ContentState {...state} onRetry={state.reload} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!state.loading && !state.error && (
        <div className="card table-scroll">
          {state.data?.rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Difficulty</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((q, i) => (
                  <tr key={q.id}>
                    <td>{page * 50 + i + 1}</td>
                    <td className="question-table-text">{q.question_text}</td>
                    <td>{q.difficulty}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          className="button button-secondary button-compact"
                          disabled={busy}
                          onClick={() => setEditing(q)}
                        >
                          Edit question {i + 1}
                        </button>
                        <button
                          className="button button-danger button-compact"
                          disabled={busy}
                          onClick={() => remove(q)}
                        >
                          Delete question {i + 1}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No questions yet. Create a question or import JSON.</p>
          )}
          {state.data?.count > 50 && (
            <div className="pagination">
              <span>
                {page * 50 + 1}–{Math.min(page * 50 + 50, state.data.count)} of{" "}
                {state.data.count} questions
              </span>
              <div className="inline-actions">
                <button
                  className="button button-secondary button-compact"
                  disabled={page === 0 || busy}
                  onClick={() => {
                    setEditing(null);
                    setPage((p) => p - 1);
                  }}
                >
                  Previous page
                </button>
                <button
                  className="button button-secondary button-compact"
                  disabled={(page + 1) * 50 >= state.data.count || busy}
                  onClick={() => {
                    setEditing(null);
                    setPage((p) => p + 1);
                  }}
                >
                  Next page
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
