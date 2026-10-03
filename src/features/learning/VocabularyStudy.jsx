import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { vocabPool, vocabPassages } from "./api.js";
import VocabularyLearning from "./VocabularyLearning.jsx";
export default function VocabularyStudy() {
  const [params] = useSearchParams(),
    sets = (params.get("sets") || "").split(",").filter(Boolean),
    filter = params.get("filter") || "all",
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const state = useContent(async () => {
    const pool = await vocabPool(sets, filter, query, page);
    const visibleSets = [
      ...new Set(pool.words.flatMap((w) => w.source_sets || [w.set_id])),
    ];
    return {
      ...pool,
      passages: visibleSets.length ? await vocabPassages(visibleSets) : [],
    };
  }, [sets.join(","), filter, query, page]);
  return (
    <>
      <PageHeader
        title={
          filter === "due"
            ? "Review due words"
            : filter === "starred"
              ? "Starred words"
              : filter === "weak"
                ? "Words I Miss"
                : "Study selected sets"
        }
        eyebrow="Vocabulary studio"
        description={`${sets.length ? `${sets.length} original sets selected` : "Your published vocabulary library"}. Every word keeps its source set.`}
      />
      <Link className="primary-link" to="/vocabulary">
        ← Vocabulary library
      </Link>
      <label className="vocabulary-global-search">
        Search the whole study pool
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Word or definition"
        />
      </label>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && !state.loading && (
        <VocabularyLearning
          key={`${page}/${query}/${filter}`}
          words={state.data.words}
          passages={state.data.passages}
          setIds={sets}
          scopeFilter={filter}
          total={state.data.total}
          initialMode={params.get("mode") || "words"}
          hasMore={(page + 1) * 100 < state.data.total}
          nextPage={() => setPage((p) => p + 1)}
        />
      )}
      <div className="button-row">
        {page > 0 && (
          <button
            className="button button-secondary"
            onClick={() => setPage((p) => p - 1)}
          >
            Previous 100 words
          </button>
        )}
      </div>
    </>
  );
}
