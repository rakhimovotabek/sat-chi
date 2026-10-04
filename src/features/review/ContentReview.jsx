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
    [manualError, setManualError] = useState(""),
    [sourceNote, setSourceNote] = useState(""),
    [sourceMessage, setSourceMessage] = useState(""),
    [sourceBusy, setSourceBusy] = useState(false);
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
          <h2>
            {s.book_id || s.vocabulary_book_id ? (
              <Link
                to={`/admin/${s.vocabulary_book_id ? "vocabulary" : "books"}/${s.vocabulary_book_id || s.book_id}`}
              >
                {s.title}
              </Link>
            ) : (
              s.title
            )}
          </h2>
          <p>
            {s.source_file} · {s.source_type} · {s.category}
          </p>
          <p>
            {s.investigation?.page_count || "Unknown"} pages ·{" "}
            {s.investigation?.extraction_method || "Embedded text"}
          </p>
          <details>
            <summary>Developer details</summary>
            <p>
              {s.parser_version} · Last checkpoint{" "}
              {new Date(s.updated_at).toLocaleString()}
            </p>
            <p>
              {s.imported_count} accepted · {s.skipped_count} skipped checkpoint
              markers · {s.evidence_count} evidence entries
            </p>
          </details>
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
                {s.investigation.extraction_method}
              </p>
              <details>
                <summary>Extraction samples</summary>
                {s.investigation.samples?.map((p) => (
                  <p key={p.page}>
                    Sample page {p.page}: {p.method}
                    {p.mean_confidence != null
                      ? ` · OCR confidence ${p.mean_confidence}/100 · ${p.low_confidence_words} low-confidence words`
                      : ""}
                  </p>
                ))}
              </details>
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
                        onQueue("audit");
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
          <details>
            <summary>Source recovery actions</summary>
            <p>
              Retry extraction records a local importer task. Source PDFs and
              page inspection remain private in Desktop/Books.
            </p>
            <label>
              Source action note
              <textarea
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                maxLength={2000}
              />
            </label>
            <div className="button-row">
              {[
                ["retry", "Request extraction retry"],
                ["unsupported", "Mark unsupported"],
                ["ignored", "Ignore source task"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  className="button button-secondary"
                  disabled={sourceBusy || sourceNote.trim().length < 12}
                  onClick={async () => {
                    setSourceBusy(true);
                    try {
                      await reviewRpc("content_review_source_action", {
                        p_source: id,
                        p_action: action,
                        p_note: sourceNote,
                      });
                      setSourceMessage(
                        action === "retry"
                          ? "Extraction retry requested; local importer will preserve the existing catalog."
                          : "Source decision saved in audit history.",
                      );
                      state.reload();
                    } catch (e) {
                      setSourceMessage(e.message);
                    } finally {
                      setSourceBusy(false);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {sourceMessage && <p role="status">{sourceMessage}</p>}
          </details>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => onQueue("human")}
            >
              Review this source
            </button>
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
    [bucket, setBucket] = useState("human"),
    [selected, setSelected] = useState([]),
    [approval, setApproval] = useState(null),
    [bulkError, setBulkError] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false),
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
        ? bucket !== "legacy" && tab !== "Catalog"
          ? reviewRpc("content_review_triage_queue", {
              p_source: source || null,
              p_bucket: bucket,
              p_type: type,
              p_search: search,
              p_page: page,
            })
          : reviewRpc("content_review_queue", {
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
      bucket,
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
      setSelected([]);
      setApproval(null);
    };
  async function previewBulk(scope) {
    setBulkError("");
    setBulkBusy(true);
    const args =
      scope === "selected"
        ? { p_ids: selected }
        : scope === "visible"
          ? {
              p_ids: queue.data.rows
                .filter((r) => r.bucket === "ready")
                .map((r) => r.id),
            }
          : { p_source: source || null };
    try {
      const preview = await reviewRpc("content_review_bulk", args);
      setApproval({ args, ...preview });
    } catch (e) {
      setBulkError(e.message);
    } finally {
      setBulkBusy(false);
    }
  }
  async function confirmBulk() {
    setBulkBusy(true);
    setBulkError("");
    try {
      await reviewRpc("content_review_bulk", {
        ...approval.args,
        p_confirm: approval.safe,
      });
      setApproval(null);
      setSelected([]);
      refresh();
    } catch (e) {
      setBulkError(e.message);
      setApproval(null);
    } finally {
      setBulkBusy(false);
    }
  }
  const openBucket = (value) => {
    setBucket(value);
    setTab("Review queue");
    setPage(0);
    setSelected([]);
    setItem(null);
  };
  return (
    <>
      <PageHeader
        title="Content Review"
        description="Approve validated content, resolve uncertainty, and recover blocked sources."
      />
      <ContentState {...overview} onRetry={overview.reload} />
      {overview.data && (
        <>
          <div className="review-stats">
            {[
              ["Ready to approve", "ready"],
              ["Needs human check", "human"],
              ["Blocked sources", "blocked_sources"],
              ["Possible duplicates", "duplicates"],
              ["Approved", "approved"],
              ["Rejected", "rejected"],
            ].map(([label, key]) => (
              <div className="card" key={key}>
                <span>{label}</span>
                <strong>{overview.data[key] || 0}</strong>
              </div>
            ))}
          </div>
          <p className="empty-copy">
            {overview.data.audit || 0} audit-only records preserved outside the
            review workload.
          </p>
          <p className="empty-copy">
            {Object.entries(overview.data.outcomes || {})
              .map(([k, v]) => `${outcomeLabel(k)}: ${v}`)
              .join(" · ")}
          </p>
        </>
      )}
      <div className="review-quick-actions">
        <strong>Quick actions</strong>
        <button
          className="button button-primary"
          onClick={() => openBucket("human")}
        >
          Review uncertain items
        </button>
        <button
          className="button button-secondary"
          onClick={() => openBucket("ready")}
        >
          Approve safe items
        </button>
        <button
          className="button button-secondary"
          onClick={() => setTab("Blocked sources")}
        >
          Inspect blocked sources
        </button>
      </div>
      <div
        className="button-row review-tabs"
        role="group"
        aria-label="Content review sections"
      >
        {[
          "Sources",
          "Blocked sources",
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
      {["Sources", "Blocked sources"].includes(tab) ? (
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
          {tab === "Blocked sources" && (
            <p>
              Extraction tasks are grouped by source. Potential questions are
              parser estimates, not verified inventories. Inspect pages before
              choosing manual transcription.
            </p>
          )}
          <div className="review-table-wrap">
            <table className="review-source-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type / pages</th>
                  <th>Imported</th>
                  <th>Safe</th>
                  <th>Needs review</th>
                  <th>Blocked / status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!sources.loading &&
                  sources.data?.rows
                    .filter((s) => tab !== "Blocked sources" || s.blocked)
                    .map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="review-title-link"
                            onClick={() => {
                              setSelectedSource(s.id);
                              setSource(s.id);
                            }}
                          >
                            {s.title}
                          </button>
                          <small>{s.source_file}</small>
                          {tab === "Blocked sources" && (
                            <p>
                              {s.reason ||
                                "Source layout or answer mapping requires recovery"}
                            </p>
                          )}
                        </td>
                        <td>
                          {s.category}
                          <small>{s.pages || "Unknown"} pages</small>
                        </td>
                        <td>
                          {Object.entries(s.triage || {})
                            .filter(([bucket]) => bucket !== "audit")
                            .reduce((total, [, count]) => total + count, 0)}
                          <small>
                            {s.triage?.audit || 0} audit records
                            {tab === "Blocked sources"
                              ? ` · ${s.detected_questions} potential questions`
                              : ""}
                          </small>
                        </td>
                        <td>{s.triage?.ready || 0}</td>
                        <td>{s.triage?.human || 0}</td>
                        <td>
                          {s.blocked
                            ? "Extraction blocked"
                            : outcomeLabel(s.outcome)}
                          <small>
                            {outcomeLabel(s.outcome)} ·{" "}
                            {s.triage?.duplicates || 0} duplicates
                          </small>
                        </td>
                        <td>
                          <button
                            className="button button-secondary button-compact"
                            onClick={() => {
                              setSelectedSource(s.id);
                              setSource(s.id);
                            }}
                          >
                            Inspect source
                          </button>
                          <button
                            className="review-title-link"
                            onClick={() => {
                              setSource(s.id);
                              openBucket("ready");
                            }}
                          >
                            Approve safe from source
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
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
              onQueue={(nextBucket = "human") => {
                setBucket(nextBucket);
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
              {tab === "Review queue" && (
                <label>
                  Review bucket
                  <select
                    value={bucket}
                    onChange={(e) => filter(setBucket, e.target.value)}
                  >
                    {[
                      ["human", "Needs human check"],
                      ["ready", "Ready to approve"],
                      ["duplicates", "Duplicates"],
                      ["approved", "Approved"],
                      ["rejected", "Rejected"],
                      ["audit", "Audit / history only"],
                      ["legacy", "Developer queue (all records)"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
                {tab === "Review queue" && bucket === "legacy" && (
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
                {(bucket === "legacy" || tab === "Catalog") && (
                  <>
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
                  </>
                )}
              </div>
              {bucket === "ready" && tab === "Review queue" && (
                <div className="review-bulk-bar">
                  <strong>{queue.data?.total || 0} validated items</strong>
                  <button
                    className="button button-secondary"
                    disabled={bulkBusy || !selected.length}
                    onClick={() => previewBulk("selected")}
                  >
                    Approve selected ({selected.length})
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={bulkBusy || !queue.data?.rows.length}
                    onClick={() => previewBulk("visible")}
                  >
                    Approve all visible safe records
                  </button>
                  <button
                    className="button button-primary"
                    disabled={bulkBusy || !queue.data?.total}
                    onClick={() => previewBulk("source")}
                  >
                    {source
                      ? "Approve all safe from source / book"
                      : "Approve all safe records"}
                  </button>
                </div>
              )}
              {bulkError && (
                <p role="alert" className="form-error">
                  {bulkError}
                </p>
              )}
              {approval && (
                <section
                  className="review-confirm"
                  aria-label="Confirm bulk approval"
                >
                  <h2>Approve {approval.count} validated content items?</h2>
                  <p>
                    Excluded automatically:{" "}
                    {Object.entries(approval.excluded)
                      .map(
                        ([k, v]) =>
                          `${v} ${k === "audit" ? "audit-only" : k === "human" ? "need human review" : k}`,
                      )
                      .join(" · ") || "None"}
                  </p>
                  <p>Approval does not publish any book.</p>
                  <div className="button-row">
                    <button
                      className="button button-primary"
                      disabled={bulkBusy || !approval.count}
                      onClick={confirmBulk}
                    >
                      Confirm approval
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={bulkBusy}
                      onClick={() => setApproval(null)}
                    >
                      Cancel approval
                    </button>
                  </div>
                </section>
              )}
              <ContentState {...queue} onRetry={queue.reload} />
              {!queue.loading &&
                queue.data?.rows.map((r) => (
                  <article className="card review-source-row" key={r.id}>
                    <div>
                      {r.bucket === "ready" && (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.label.slice(0, 70)}`}
                            checked={selected.includes(r.id)}
                            onChange={(e) =>
                              setSelected((v) =>
                                e.target.checked
                                  ? [...v, r.id]
                                  : v.filter((id) => id !== r.id),
                              )
                            }
                          />
                          Select for approval
                        </label>
                      )}
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
                      <span className="subtle-badge">
                        {r.bucket || r.status}
                      </span>
                      {r.reason && <p>{r.reason}</p>}
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
                  onPrevious={() => {
                    const i = queue.data.rows.findIndex((r) => r.id === item);
                    if (i > 0) setItem(queue.data.rows[i - 1].id);
                  }}
                  onNext={() => {
                    const i = queue.data.rows.findIndex((r) => r.id === item);
                    if (i < queue.data.rows.length - 1)
                      setItem(queue.data.rows[i + 1].id);
                  }}
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
