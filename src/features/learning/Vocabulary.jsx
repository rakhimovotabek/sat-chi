import { useState, useEffect } from "react";
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
import { shortSetTitle } from "./bank-selection.js";
import { masteryPercent } from "./vocabulary-model.js";
export default function Vocabulary({ admin = false }) {
  const { bookId } = useParams(),
    navigate = useNavigate(),
    [selected, setSelected] = useState([]),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    summary = useContent(
      () => (admin ? Promise.resolve(null) : api.vocabSummary(bookId || null)),
      [bookId, admin],
    ),
    [importing, setImporting] = useState(false),
    [editing, setEditing] = useState(null),
    state = useContent(
      () =>
        bookId ? api.vocabBookDetail(bookId) : api.vocabBooks(page, query),
      [bookId, page, query],
    ),
    action = useAction();
  useEffect(() => {
    setSelected([]);
    setPage(0);
    setSearch("");
    setQuery("");
  }, [bookId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const rows = bookId ? state.data?.sets : state.data;
  const book = bookId ? state.data?.book : null;
  const lifecycle = state.data?.state;
  const publish = (next) =>
    action.run(async () => {
      await api.publishVocabBook(bookId, next);
      state.reload();
    });
  return (
    <>
      <PageHeader
        title={book?.title || "Vocabulary"}
        eyebrow={admin ? "Vocabulary library" : "Words for stronger reading"}
        description={
          bookId
            ? "Choose a set to learn, review, read in context, or test your knowledge."
            : "Build lasting word knowledge with structured vocabulary sets."
        }
      />
      {!admin && <VocabularyStats data={summary.data} />}
      {!bookId && (
        <label className="vocabulary-global-search">
          Search vocabulary books
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title"
          />
        </label>
      )}
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
              onClick={() => setSelected(rows?.map((s) => s.id) || [])}
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
      {admin && book && (
        <section
          className="vocabulary-publication"
          aria-label="Book publication"
        >
          <div>
            <span className={`status-label status-${lifecycle}`}>
              {
                {
                  draft: "Draft",
                  needs_review: "Needs review",
                  published: "Published",
                  archived: "Archived",
                }[lifecycle]
              }
            </span>
            <p>
              {book.published
                ? "Visible to students. Publication applies to every set in this book."
                : state.data.pending > 0
                  ? `${state.data.pending} imported items need approval before publication.`
                  : state.data.eligible
                    ? "Ready to publish. All sets contain words."
                    : "Add at least one set. Every set must contain words before publishing."}
            </p>
            {state.data.pending > 0 && (
              <Link className="primary-link" to="/admin/content-review">
                Review imported content →
              </Link>
            )}
          </div>
          <div className="button-row">
            {book.published ? (
              <button
                className="button button-secondary"
                disabled={action.busy}
                onClick={() => publish("draft")}
              >
                Unpublish
              </button>
            ) : (
              <button
                className="button"
                disabled={action.busy || !state.data.eligible}
                onClick={() => publish("published")}
              >
                Publish Book
              </button>
            )}
            <button
              className="quiet-button"
              onClick={() => {
                setEditing(book);
              }}
            >
              Edit vocabulary book
            </button>
            {!book.archived && (
              <button
                className="quiet-button"
                disabled={action.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Archive this vocabulary book? It will be hidden from students.",
                    )
                  )
                    publish("archived");
                }}
              >
                Archive
              </button>
            )}
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
      {rows?.length ? (
        <div
          className={bookId ? "study-set-list" : "card-grid vocabulary-library"}
        >
          {rows.map((row) => (
            <article
              key={row.id}
              className={
                bookId ? "study-set-row" : "card learning-panel vocabulary-book"
              }
            >
              <Link
                className="study-set-main"
                aria-label={
                  bookId ? shortSetTitle(row.title, book?.title) : row.title
                }
                to={`${admin ? "/admin" : ""}/vocabulary/${bookId ? `${bookId}/sets/${row.id}` : row.id}`}
              >
                {!bookId && admin && (
                  <span className="subtle-badge">
                    {row.archived
                      ? "Archived"
                      : row.published
                        ? "Published"
                        : "Draft"}
                  </span>
                )}
                <h2>
                  {bookId ? shortSetTitle(row.title, book?.title) : row.title}
                </h2>
                {bookId && (
                  <p className="set-metadata">
                    {row.words} words
                    {row.passages > 0 &&
                      ` · ${row.passages} passage${row.passages === 1 ? "" : "s"}`}
                    {row.exercises > 0 && ` · ${row.exercises} exercises`}
                  </p>
                )}
                {!bookId && row.description && (
                  <p className="page-description">{row.description}</p>
                )}
                <span className="set-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              {!admin && bookId && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${shortSetTitle(row.title, book?.title)}`}
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
              {admin && (
                <button
                  className="quiet-button"
                  onClick={() => setEditing(row)}
                >
                  {bookId ? "Edit set" : "Edit vocabulary book"}
                </button>
              )}
              {admin && bookId && (
                <button
                  className="quiet-button quiet-danger"
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
                  className="quiet-button quiet-danger"
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
      {!bookId && !state.loading && (
        <div className="catalog-pagination button-row">
          {page > 0 && (
            <button
              className="button button-secondary"
              onClick={() => setPage((p) => p - 1)}
            >
              Previous vocabulary books
            </button>
          )}
          {state.data?.length === 50 && (
            <button
              className="button button-secondary"
              onClick={() => setPage((p) => p + 1)}
            >
              Next vocabulary books
            </button>
          )}
        </div>
      )}
      {!admin && !bookId && <VocabularyTestHistory />}
    </>
  );
}
