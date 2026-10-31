import { useEffect, useState } from "react";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { vocabBooks, vocabSets } from "../learning/api.js";

export default function BattleVocabularyFilters({ value, onChange }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const books = useContent(() => vocabBooks(0, query), [query]);
  const sets = useContent(
    () => (value.book ? vocabSets(value.book) : Promise.resolve([])),
    [value.book],
  );
  const selected = value.sets || [];
  return (
    <details>
      <summary>Vocabulary book and topic sets</summary>
      <label>
        Find vocabulary book
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search published vocabulary"
        />
      </label>
      <ContentState {...books} onRetry={books.reload} />
      <label>
        Vocabulary book
        <select
          aria-label="Vocabulary book"
          value={value.book || ""}
          onChange={(event) =>
            onChange({ ...value, book: event.target.value, sets: [] })
          }
        >
          <option value="">All published vocabulary</option>
          {(books.data || []).map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </label>
      <ContentState {...sets} onRetry={sets.reload} />
      {value.book && (
        <fieldset>
          <legend>Topic sets · {selected.length} selected</legend>
          <p>
            Leave all unchecked to use the whole book. Select up to 32 sets.
          </p>
          {(sets.data || []).map((set) => (
            <label key={set.id}>
              <input
                type="checkbox"
                checked={selected.includes(set.id)}
                disabled={!selected.includes(set.id) && selected.length >= 32}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sets: event.target.checked
                      ? [...selected, set.id]
                      : selected.filter((id) => id !== set.id),
                  })
                }
              />
              {set.title}
            </label>
          ))}
          {!sets.loading && sets.data?.length === 0 && (
            <p>No readable topic sets in this book.</p>
          )}
        </fieldset>
      )}
    </details>
  );
}
