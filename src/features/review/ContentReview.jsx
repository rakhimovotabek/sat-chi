import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import BookCover from "../../components/BookCover.jsx";
import { getBook } from "../books/api.js";
import { vocabBookDetail } from "../learning/api.js";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import ReviewItem from "./ReviewItem.jsx";
import QuestionForm from "../books/QuestionForm.jsx";
import { reviewRpc, reviewHistory, outcomeLabel } from "./api.js";
function Pages({ page, setPage, total, size = 25, loading }) {
  return (
    <div className="button-row">
      <button
        className="button button-secondary"
        disabled={!page || loading}
        onClick={() => setPage(page - 1)}
      >
        Previous page
      </button>
      <span>
        Page {page + 1} · {total || 0} records
      </span>
      <button
        className="button button-secondary"
        disabled={loading || (page + 1) * size >= (total || 0)}
        onClick={() => setPage(page + 1)}
      >
        Next page
      </button>
    </div>
  );
}
function SourceCover({ source }) {
  const state = useContent(
    () =>
      source.book_id
        ? getBook(source.book_id)
        : vocabBookDetail(source.vocabulary_book_id).then((d) => d.book),
    [source.book_id, source.vocabulary_book_id],
  );
  return state.data && (state.data.cover_url || state.data.cover_image_url) ? (
    <BookCover book={state.data} className="book-detail-cover" />
  ) : null;
}
function SourceDetail({ id, onQueue }) {
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start" });
    panel.current?.focus({ preventScroll: true });
  }, [id]);
  const [manual, setManual] = useState(false),
    [manualPage, setManualPage] = useState(""),
    [manualError, setManualError] = useState("");
  const state = useContent(
      () => reviewRpc("content_review_source", { p_id: id }),
      [id],
    ),
    s = state.data;
  return (
    <section
      className="card learning-panel review-detail"
      ref={panel}
      tabIndex={-1}
      aria-label="Source detail"
    >
      <ContentState {...state} onRetry={state.reload} />
      {s && (
        <>
          {(s.book_id || s.vocabulary_book_id) && <SourceCover source={s} />}
          <h2>{s.title}</h2>
          <p>
            {s.source_file} · {s.source_type} · {s.category}
          </p>
          <p>
            {s.parser_version} · Last checkpoint{" "}
            {new Date(s.updated_at).toLocaleString()}
          </p>
          <p>
            {s.imported_count} accepted · {s.skipped_count} skipped checkpoint
            markers · {s.evidence_count} evidence entries
          </p>
          {s.vocabulary_book_id && (
            <p>
              {s.catalog?.sets || 0} sets · {s.catalog?.words || 0} words ·{" "}
              {s.catalog?.passages || 0} passages · {s.catalog?.exercises || 0}{" "}
              exercises
            </p>
          )}
          {s.investigation && (
            <>
              <p>{s.investigation.diagnosis}</p>
              <p>
                {s.investigation.page_count} PDF pages ·{" "}
                {s.investigation.embedded_chars} embedded characters ·{" "}
                {s.investigation.sparse_pages} sparse pages ·{" "}
                {s.investigation.extraction_method}
              </p>
              {s.investigation.samples?.map((p) => (
                <p key={p.page}>
                  Sample page {p.page}: {p.method}
                  {p.mean_confidence != null
                    ? ` · OCR confidence ${p.mean_confidence}/100 · ${p.low_confidence_words} low-confidence words`
                    : ""}
                </p>
              ))}
            </>
          )}
          <p>
            Review progress:{" "}
            {Object.entries(s.review_progress || {})
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ") || "No review items"}
          </p>
          {[...(s.warnings || []), ...(s.errors || [])].map((w, i) => (
            <p key={i} className="form-notice">
              {w}
            </p>
          ))}
          {s.source_type === "book" && (
            <>
              <button
                className="button button-secondary"
                onClick={() => setManual((v) => !v)}
              >
                Transcribe a source question
              </button>
              {manual && (
                <>
                  <p>
                    Enter only content and answers verified against the original
                    PDF. This creates a pending review item, not published
                    content.
                  </p>
                  <label>
                    Manual source page
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={manualPage}
                      onChange={(e) => setManualPage(e.target.value)}
                      required
                    />
                  </label>
                  {manualError && (
                    <p role="alert" className="form-error">
                      {manualError}
                    </p>
                  )}
                  <QuestionForm
                    requireAnswerSelection
                    question={{
                      source: s.source_file,
                      difficulty: "unclassified",
                    }}
                    onSubmitPayload={async (payload) => {
                      setManualError("");
                      if (
                        !Number.isInteger(Number(manualPage)) ||
                        Number(manualPage) < 1
                      )
                        throw new Error("Enter the physical source page.");
                      try {
                        await reviewRpc("add_source_review_question", {
                          p_source: id,
                          p_payload: payload,
                          p_page: Number(manualPage),
                          p_note:
                            "Transcribed from original source; pending second review.",
                        });
                        setManual(false);
                        state.reload();
                        onQueue();
                      } catch (e) {
                        setManualError(e.message);
                        throw e;
                      }
                    }}
                    onSaved={() => {}}
                    onCancel={() => setManual(false)}
                  />
                </>
              )}
            </>
          )}
          <div className="button-row">
            <button className="button button-primary" onClick={onQueue}>
              Review this source
            </button>
            {(s.book_id || s.vocabulary_book_id) && (
              <Link
                className="button button-secondary"
                to={`/admin/${s.vocabulary_book_id ? "vocabulary" : "books"}/${s.vocabulary_book_id || s.book_id}`}
              >
                Open catalog book
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function History({ tab, source }) {
  const [page, setPage] = useState(0),
    state = useContent(
      () =>
        reviewHistory(
          tab === "Import history" ? "import_runs" : "content_review_audit",
          source,
          page,
        ),
      [tab, source, page],
    );
  return (
    <>
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.rows.map((r) => (
        <article className="card learning-panel" key={r.id}>
          <h3>{r.import_jobs?.title || "Removed source"}</h3>
          <p>
            {new Date(r.recorded_at || r.happened_at).toLocaleString()} ·{" "}
            {r.status || r.action}
          </p>
          {tab === "Import history" ? (
            <>
              <p>
                {r.imported_count} catalog items at checkpoint ·{" "}
                {r.skipped_count} skipped markers · {r.parser_version}
              </p>
              <p>
                {r.history_origin === "reconciled_latest_checkpoint"
                  ? "Reconciled latest persisted checkpoint; earlier run timing is unavailable."
                  : "Recorded import checkpoint"}
              </p>
              {[...(r.warnings || []), ...(r.errors || [])].map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </>
          ) : (
            <>
              <p>
                Item {r.item_id || "removed"} · Administrator{" "}
                {r.actor || "historical actor unavailable"}
              </p>
              <details>
                <summary>Before / after</summary>
                <pre className="review-json">
                  {JSON.stringify(
                    { before: r.before_data, after: r.after_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          )}
        </article>
      ))}
      {state.data?.total === 0 && <p>No recorded history for this filter.</p>}
      <Pages
        page={page}
        setPage={setPage}
        total={state.data?.total}
        size={20}
        loading={state.loading}
      />
    </>
  );
}
export default function ContentReview() {
  const [tab, setTab] = useState("Sources"),
    [source, setSource] = useState(""),
    [selectedSource, setSelectedSource] = useState(""),
    [sourcePage, setSourcePage] = useState(0),
    [sourceSearch, setSourceSearch] = useState(""),
    [page, setPage] = useState(0),
    [type, setType] = useState(""),
    [status, setStatus] = useState("pending"),
    [warning, setWarning] = useState(""),
    [search, setSearch] = useState(""),
    [domain, setDomain] = useState(""),
    [confidence, setConfidence] = useState(""),
    [setName, setSetName] = useState(""),
    [item, setItem] = useState(null),
    [revision, setRevision] = useState(0);
  const overview = useContent(
      () => reviewRpc("content_review_overview"),
      [revision],
    ),
    sources = useContent(
      () =>
        reviewRpc("content_review_sources", {
          p_page: sourcePage,
          p_search: sourceSearch,
        }),
      [sourcePage, sourceSearch, revision],
    );
  const queue = useContent(
    () =>
      ["Review queue", "Catalog"].includes(tab)
        ? reviewRpc("content_review_queue", {
            p_source: source || null,
            p_type: type,
            p_status: tab === "Catalog" ? "" : status,
            p_warning: warning,
            p_search: search,
            p_domain: domain,
            p_confidence: confidence === "" ? null : Number(confidence),
            p_page: page,
            p_catalog: tab === "Catalog",
            p_set: setName,
          })
        : Promise.resolve(null),
    [
      tab,
      source,
      type,
      status,
      warning,
      search,
      domain,
      confidence,
      setName,
      page,
      revision,
    ],
  );
  const refresh = () => setRevision((v) => v + 1),
    filter = (setter, value) => {
      setter(value);
      setPage(0);
      setItem(null);
    };
  return (
    <>
      <PageHeader
        title="Content Review"
        eyebrow="Administrator workspace"
        description="Trace source imports, inspect the catalog and review draft content before publication."
      />
      <ContentState {...overview} onRetry={overview.reload} />
      {overview.data && (
        <>
          <div className="review-stats">
            {[
              ["Source books", "sources"],
              ["SAT questions", "questions"],
              ["Vocabulary words", "words"],
              ["Vocabulary sets", "sets"],
              ["Passages", "passages"],
              ["Exercises", "exercises"],
              ["Awaiting review", "awaiting_review"],
              ["Question review", "question_review"],
              ["Word review", "word_review"],
              ["Possible duplicates", "duplicates"],
              ["Import warnings", "warnings"],
            ].map(([label, key]) => (
              <div className="card" key={key}>
                <span>{label}</span>
                <strong>{overview.data[key] || 0}</strong>
              </div>
            ))}
          </div>
          <p className="empty-copy">
            {Object.entries(overview.data.outcomes || {})
              .map(([k, v]) => `${outcomeLabel(k)}: ${v}`)
              .join(" · ")}
          </p>
        </>
      )}
      <div
        className="button-row review-tabs"
        role="group"
        aria-label="Content review sections"
      >
        {[
          "Sources",
          "Review queue",
          "Catalog",
          "Import history",
          "Audit history",
        ].map((t) => (
          <button
            className={`button ${t === tab ? "button-primary" : "button-secondary"}`}
            key={t}
            aria-pressed={t === tab}
            onClick={() => {
              setTab(t);
              setPage(0);
              setItem(null);
            }}
          >
            {t}
          </button>
        ))}
        <button className="button button-secondary" onClick={refresh}>
          Refresh review data
        </button>
      </div>
      {tab === "Sources" ? (
        <>
          <label>
            Find a source
            <input
              type="search"
              value={sourceSearch}
              onChange={(e) => {
                setSourceSearch(e.target.value);
                setSourcePage(0);
              }}
            />
          </label>
          <ContentState {...sources} onRetry={sources.reload} />
          <div className="review-source-list">
            {!sources.loading &&
              sources.data?.rows.map((s) => (
                <article className="card review-source-row" key={s.id}>
                  <div>
                    <h3>{s.title}</h3>
                    <p>
                      {s.source_file} · {s.category} · {s.source_type}
                    </p>
                    <small>{new Date(s.updated_at).toLocaleString()}</small>
                  </div>
                  <div>
                    <span className="subtle-badge">
                      {outcomeLabel(s.outcome)}
                    </span>
                    <p>
                      {s.question_count} questions · {s.word_count} words
                    </p>
                    <p>
                      {s.review_count} awaiting review · {s.warning_count}{" "}
                      warnings/errors
                    </p>
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setSelectedSource(s.id);
                      setSource(s.id);
                    }}
                  >
                    Inspect source
                  </button>
                </article>
              ))}
          </div>
          <Pages
            page={sourcePage}
            setPage={setSourcePage}
            total={sources.data?.total}
            loading={sources.loading}
          />
          {selectedSource && (
            <SourceDetail
              id={selectedSource}
              onQueue={() => {
                filter(setSource, selectedSource);
                setTab("Review queue");
              }}
            />
          )}
        </>
      ) : (
        <>
          <label>
            Source book
            <select
              value={source}
              onChange={(e) => filter(setSource, e.target.value)}
            >
              <option value="">All sources</option>
              {!sources.loading &&
                sources.data?.rows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              {source && !sources.data?.rows.some((s) => s.id === source) && (
                <option value={source}>Selected source</option>
              )}
            </select>
          </label>
          {["Review queue", "Catalog"].includes(tab) ? (
            <>
              <div className="review-filters">
                <label>
                  Item type
                  <select
                    value={type}
                    onChange={(e) => filter(setType, e.target.value)}
                  >
                    <option value="">All types</option>
                    {["question", "word", "passage", "exercise", "source"].map(
                      (t) => (
                        <option key={t}>{t}</option>
                      ),
                    )}
                  </select>
                </label>
                {tab === "Review queue" && (
                  <label>
                    Review status
                    <select
                      value={status}
                      onChange={(e) => filter(setStatus, e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {[
                        "pending",
                        "approved",
                        "rejected",
                        "duplicate",
                        "deferred",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Search content
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => filter(setSearch, e.target.value)}
                  />
                </label>
                <label>
                  Warning contains
                  <input
                    value={warning}
                    onChange={(e) => filter(setWarning, e.target.value)}
                    placeholder="Possible duplicate / underline / OCR"
                  />
                </label>
                <label>
                  Question domain
                  <select
                    value={domain}
                    onChange={(e) => filter(setDomain, e.target.value)}
                  >
                    <option value="">All domains</option>
                    {[
                      "Information and Ideas",
                      "Craft and Structure",
                      "Expression of Ideas",
                      "Standard English Conventions",
                      "Algebra",
                      "Advanced Math",
                      "Problem-Solving and Data Analysis",
                      "Geometry and Trigonometry",
                    ].map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Vocabulary set name
                  <input
                    value={setName}
                    onChange={(e) => filter(setSetName, e.target.value)}
                  />
                </label>
                <label>
                  Maximum recorded confidence
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={confidence}
                    onChange={(e) => filter(setConfidence, e.target.value)}
                  />
                </label>
              </div>
              <ContentState {...queue} onRetry={queue.reload} />
              {!queue.loading &&
                queue.data?.rows.map((r) => (
                  <article className="card review-source-row" key={r.id}>
                    <div>
                      <h3>
                        {r.label.length > 180
                          ? r.label.slice(0, 180) + "…"
                          : r.label}
                      </h3>
                      <p>
                        {r.source_title} · {r.item_type}{" "}
                        {r.set_title
                          ? `· ${r.set_title} (${r.set_size} words, ${r.set_passages} passages, ${r.set_exercises} exercises)`
                          : ""}{" "}
                        · PDF page {r.source_page || "unknown"}
                      </p>
                    </div>
                    <div>
                      <span className="subtle-badge">{r.status}</span>
                      <p>
                        {r.warnings?.length || 0} warnings ·{" "}
                        {r.entity_id ? "In catalog" : "Excluded/source task"}
                      </p>
                    </div>
                    <button
                      className="button button-secondary"
                      onClick={() => setItem(r.id)}
                    >
                      Inspect item
                    </button>
                  </article>
                ))}
              {queue.data?.total === 0 && <p>No items match these filters.</p>}
              <Pages
                page={page}
                setPage={setPage}
                total={queue.data?.total}
                loading={queue.loading}
              />
              {item && (
                <ReviewItem
                  key={item}
                  id={item}
                  onClose={() => setItem(null)}
                  onChanged={refresh}
                />
              )}
            </>
          ) : (
            <History key={tab + source} tab={tab} source={source} />
          )}
        </>
      )}
    </>
  );
}
