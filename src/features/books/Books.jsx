import { useState } from "react";
import { Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { getBooks } from "./api.js";
import BookForm from "./BookForm.jsx";
import ImportPanel from "./ImportPanel.jsx";
export default function Books({ admin = false }) {
  const state = useContent(getBooks);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const books = (state.data || []).filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase()),
  );
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
                <div className="book-cover">
                  {b.cover_url ? (
                    <img src={b.cover_url} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">
                      SAT’chi
                      <br />
                      {b.category}
                    </span>
                  )}
                </div>
                <div className="book-card-copy">
                  <span className="subtle-badge">{b.category}</span>
                  {admin && (
                    <span className="subtle-badge">
                      {b.published ? "Published" : "Draft"}
                    </span>
                  )}
                  <h2>{b.title}</h2>
                  <p>{b.description || "Explore the topics in this book."}</p>
                  <span className="card-link">Open book →</span>
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
    </>
  );
}
