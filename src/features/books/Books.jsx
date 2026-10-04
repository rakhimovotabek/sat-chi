import { useState, useEffect } from "react";
import { Link } from "react-router";
import BookCover from "../../components/BookCover.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { getBookCatalog } from "./api.js";
import BookForm from "./BookForm.jsx";
import ImportPanel from "./ImportPanel.jsx";
export default function Books({ admin = false }) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const state = useContent(() => getBookCatalog(page, query), [page, query]);
  const books = state.data?.books || [];
  return (
    <>
      <PageHeader
        title="Books"
        eyebrow={admin ? "Learning library" : "Your learning library"}
        description={
          admin
            ? "Create structured books, topics, and SAT questions."
            : "Explore a book and build your understanding, one topic at a time."
        }
      />
      <div className="content-toolbar">
        <label className="search-field">
          Search books
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title"
          />
        </label>
        {admin && (
          <div className="button-row">
            <Link className="button button-secondary" to="/admin/imports">
              Import status
            </Link>
            <button className="button" onClick={() => setCreating(true)}>
              Create book
            </button>
            <button
              className="button button-secondary"
              onClick={() => setImporting((v) => !v)}
            >
              JSON import
            </button>
          </div>
        )}
      </div>
      {creating && (
        <BookForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            state.reload();
          }}
        />
      )}
      {importing && <ImportPanel onImported={() => state.reload()} />}
      <ContentState {...state} onRetry={state.reload} />
      {!state.loading &&
        !state.error &&
        (books.length ? (
          <div className="book-grid">
            {books.map((b) => (
              <Link
                key={b.id}
                className="book-card"
                to={`${admin ? "/admin" : ""}/books/${b.id}`}
              >
                <BookCover book={b} />
                <div className="book-card-copy">
                  <span className="subtle-badge">{b.category}</span>
                  {admin && (
                    <span className="subtle-badge">
                      {b.published ? "Published" : "Draft"}
                    </span>
                  )}
                  <h2>{b.title}</h2>
                  <p>{b.description || "Explore the topics in this book."}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>
              {search ? "No matching books" : "Your library is getting ready"}
            </h2>
            <p>
              {admin
                ? "Create a book or import your learning content."
                : "Published books will appear here when your administrator adds them."}
            </p>
          </div>
        ))}
      {!state.loading && state.data?.total > 0 && (
        <div className="catalog-pagination button-row">
          <span>
            {state.data.total} books · Page {page + 1} of{" "}
            {Math.ceil(state.data.total / 50)}
          </span>
          <button
            className="button button-secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous books
          </button>
          <button
            className="button button-secondary"
            disabled={(page + 1) * 50 >= state.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next books
          </button>
        </div>
      )}
    </>
  );
}
