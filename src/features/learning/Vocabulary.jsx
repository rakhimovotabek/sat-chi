import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";

import * as api from "./api.js";
import VocabCatalogForm from "./VocabCatalogForm.jsx";
import VocabImport from "./VocabImport.jsx";
import { VocabularyTestHistory } from "./VocabularyTypedTest.jsx";
import VocabularyStats from "./VocabularyStats.jsx";
import { masteryPercent } from "./vocabulary-model.js";
export default function Vocabulary({ admin = false }) {
  const { bookId } = useParams(),
    navigate = useNavigate(),
    [selected, setSelected] = useState([]),
    summary = useContent(
      () => (admin ? Promise.resolve(null) : api.vocabSummary(bookId || null)),
      [bookId, admin],
    ),
    [importing, setImporting] = useState(false),
    [editing, setEditing] = useState(null),
    state = useContent(
      () => (bookId ? api.vocabSets(bookId) : api.vocabBooks()),
      [bookId],
    ),
    action = useAction();
  return (
    <>
      <PageHeader
        title="Vocabulary"
        eyebrow={admin ? "Vocabulary library" : "Words for stronger reading"}
        description={
          bookId
            ? "Choose a set to learn, review, read in context, or test your knowledge."
            : "Build lasting word knowledge with structured vocabulary sets."
        }
      />
      {!admin && <VocabularyStats data={summary.data} />}
      {!admin && !bookId && <VocabularyTestHistory />}
      {!admin && summary.error && (
        <p className="form-error" role="alert">
          {summary.error}
        </p>
      )}
      {!admin && bookId && (
        <section className="vocabulary-selection">
          <strong>{selected.length} sets selected</strong>
          <div className="button-row">
            <button
              className="button button-secondary"
              onClick={() => setSelected(state.data?.map((s) => s.id) || [])}
            >
              Select All
            </button>
            <button
              className="button button-secondary"
              onClick={() =>
                setSelected(
                  summary.data?.sets
                    .filter((s) => s.learned > 0)
                    .map((s) => s.set_id) || [],
                )
              }
            >
              Select learned sets
            </button>
            {selected.length > 0 && (
              <Link
                className="primary-link"
                to={`/study-plan?sets=${selected.join(",")}`}
              >
                Use in Study Plan →
              </Link>
            )}
            <button
              className="button button-secondary"
              onClick={() => setSelected([])}
            >
              Clear Selection
            </button>
            <button
              className="button"
              disabled={!selected.length}
              onClick={() =>
                navigate(`/vocabulary/study?sets=${selected.join(",")}`)
              }
            >
              Study Selected Sets
            </button>
          </div>
        </section>
      )}
      {admin && (
        <button
          className="button button-secondary"
          onClick={() => setEditing({})}
        >
          {bookId ? "Create set" : "Create vocabulary book"}
        </button>
      )}
      {editing && (
        <VocabCatalogForm
          bookId={bookId}
          values={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
        />
      )}
      {admin && (
        <button className="button" onClick={() => setImporting((v) => !v)}>
          Import vocabulary
        </button>
      )}
      {importing && <VocabImport bookId={bookId} reload={state.reload} />}
      <ContentState {...state} onRetry={state.reload} />
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      {state.data?.length ? (
        <div className="card-grid">
          {state.data.map((row) => (
            <article key={row.id} className="card learning-panel">
              <span className="subtle-badge">
                {bookId ? "Study set" : row.published ? "Published" : "Draft"}
              </span>
              <h2>{row.title}</h2>
              {!admin && bookId && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.title}`}
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, row.id]
                          : v.filter((id) => id !== row.id),
                      )
                    }
                  />
                  Include in study pool
                </label>
              )}
              {!admin &&
                bookId &&
                summary.data?.sets
                  ?.filter((s) => s.set_id === row.id)
                  .map((s) => (
                    <div key={s.set_id}>
                      <p>
                        {s.total} words · {s.learned} learned · {s.reviewing}{" "}
                        reviewing · {s.new} new
                      </p>
                      <progress
                        value={s.mastered}
                        max={s.total || 1}
                        aria-label={`${row.title} mastery`}
                      />
                      <small>Mastery: {masteryPercent(s)}%</small>
                    </div>
                  ))}
              <p className="page-description">{row.description || ""}</p>
              <Link
                className="button button-secondary"
                to={`${admin ? "/admin" : ""}/vocabulary/${bookId ? `${bookId}/sets/${row.id}` : row.id}`}
              >
                {bookId ? "Open set" : "Open book"}
              </Link>
              {admin && (
                <button
                  className="button button-secondary button-compact"
                  onClick={() => setEditing(row)}
                >
                  {bookId ? "Edit set" : "Edit vocabulary book"}
                </button>
              )}
              {admin && bookId && (
                <button
                  className="button button-danger button-compact"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this set and all of its words, passages and progress?",
                      )
                    )
                      action.run(async () => {
                        const { supabase } = await import(
                          "../../lib/supabase.js"
                        );
                        await api.checked(
                          supabase
                            .from("vocabulary_sets")
                            .delete()
                            .eq("id", row.id),
                        );
                        state.reload();
                      });
                  }}
                >
                  Delete set
                </button>
              )}
              {admin && !bookId && (
                <button
                  className="button button-danger button-compact"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this vocabulary book and all sets?",
                      )
                    )
                      action.run(async () => {
                        await api.deleteVocabBook(row.id);
                        state.reload();
                      });
                  }}
                >
                  Delete book
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        !state.loading &&
        !state.error && (
          <section className="card empty-state">
            <h2>No vocabulary {bookId ? "sets" : "books"} yet</h2>
            <p>
              {admin
                ? "Import a validated vocabulary book to begin."
                : "Published vocabulary material will appear here."}
            </p>
          </section>
        )
      )}
    </>
  );
}
