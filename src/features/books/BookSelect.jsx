import { useEffect, useState } from "react";
import useContent from "./useContent.js";
import { getBook, getBookCatalog } from "./api.js";
export default function BookSelect({
  value,
  onChange,
  label = "Book",
  emptyLabel = "Choose a book",
}) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const books = useContent(() => getBookCatalog(page, query), [page, query]);
  const selected = useContent(
    () => (value ? getBook(value) : Promise.resolve(null)),
    [value],
  );
  const rows = books.data?.books || [];
  const options =
    selected.data && !rows.some((b) => b.id === selected.data.id)
      ? [selected.data, ...rows]
      : rows;
  return (
    <div className="book-select">
      <label>
        Find {label.toLowerCase()}
        <input
          type="search"
          placeholder="Search book titles"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        {label}
        <select
          aria-label={label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {options.map((b) => (
            <option value={b.id} key={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      {books.data?.total > 50 && (
        <div className="button-row">
          <button
            type="button"
            className="button button-secondary button-compact"
            disabled={page === 0 || books.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Earlier books
          </button>
          <span>
            {page + 1}/{Math.ceil(books.data.total / 50)}
          </span>
          <button
            type="button"
            className="button button-secondary button-compact"
            disabled={(page + 1) * 50 >= books.data.total || books.loading}
            onClick={() => setPage((p) => p + 1)}
          >
            More books
          </button>
        </div>
      )}
      {(books.error || selected.error) && (
        <p className="form-error" role="alert">
          {books.error || selected.error}
        </p>
      )}
    </div>
  );
}
