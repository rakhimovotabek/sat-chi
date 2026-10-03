import { useState } from "react";
import { Link, useParams } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";

import * as api from "./api.js";
import VocabCatalogForm from "./VocabCatalogForm.jsx";
import VocabImport from "./VocabImport.jsx";
export default function Vocabulary({ admin = false }) {
  const { bookId } = useParams(),
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
      {admin && !bookId && (
        <button className="button" onClick={() => setImporting((v) => !v)}>
          Import vocabulary
        </button>
      )}
      {importing && <VocabImport reload={state.reload} />}
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
