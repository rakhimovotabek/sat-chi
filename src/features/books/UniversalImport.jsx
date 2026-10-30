import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { inspectPackage } from "../../../supabase/functions/_shared/universal-package.js";
import { supabase } from "../../lib/supabase.js";
import FormattedText from "../../components/FormattedText.jsx";
export default function UniversalImport({ onImported }) {
  const [file, setFile] = useState(null),
    [pkg, setPkg] = useState(null),
    [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [stage, setStage] = useState("Upload");
  const [jobs, setJobs] = useState([]),
    [historyError, setHistoryError] = useState(""),
    [confirmPublish, setConfirmPublish] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    loadJobs();
    return () => {
      active.current = false;
    };
  }, []);
  async function loadJobs() {
    setHistoryError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (!active.current) return;
    if (authError || !auth?.user) {
      setHistoryError("Sign in again to load your import history.");
      return;
    }
    const { data, error } = await supabase
      .from("universal_book_jobs")
      .select(
        "id,book_id,status,question_cursor,asset_cursor,manifest,created_at,updated_at",
      )
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!active.current) return;
    if (error) setHistoryError(error.message);
    else setJobs(data || []);
  }
  async function inspect(selected) {
    if (!selected) return;
    setConfirmPublish(false);
    setFile(selected);
    setPkg(null);
    setJob(null);
    setError("");
    setBusy(true);
    setStage("Validate");
    try {
      setPkg(await inspectPackage(await selected.arrayBuffer()));
      setIndex(0);
      setStage("Preview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function invoke(body, headers) {
    const { data, error } = await supabase.functions.invoke("import-book", {
      body,
      headers,
    });
    if (error) {
      let detail;
      try {
        detail = await error.context.json();
      } catch {
        /* transport error */
      }
      throw new Error(detail?.error || error.message);
    }
    if (data.error) throw new Error(data.error);
    return data;
  }
  async function run(resumeJob = null) {
    setBusy(true);
    setError("");
    setStage("Import");
    try {
      let current =
        resumeJob ||
        (await invoke(file, { "Content-Type": "application/zip" }));
      setJob(current);
      while (current.status === "importing" && active.current) {
        current = await invoke({ jobId: current.id });
        setJob(current);
      }
      if (!active.current) return;
      setConfirmPublish(false);
      setStage("Publish");
      loadJobs();
      onImported?.(current);
    } catch (e) {
      setError(`${e.message} Retry the same ZIP to resume safely.`);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("universal_publish", {
      p_job: job.id,
    });
    if (error) setError(error.message);
    else {
      setJob({ ...job, status: "published" });
      onImported?.(job);
      setConfirmPublish(false);
      loadJobs();
    }
    setBusy(false);
  }
  const q = pkg?.questions[index];
  const questionTotal =
    job?.manifest?.questionCount || pkg?.questions.length || 0;
  return (
    <section
      className="card import-panel universal-import"
      aria-label="Import Book"
    >
      <h2>Import Book</h2>
      <details>
        <summary>Your recent imports</summary>
        <p>
          Progress comes from saved server records. Resume an interrupted import
          without choosing the ZIP again after its upload finished.
        </p>
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={loadJobs}
        >
          Refresh import history
        </button>
        {historyError && <p role="alert">{historyError}</p>}
        {!historyError && jobs.length === 0 && (
          <p>No saved imports available.</p>
        )}
        <ul>
          {jobs.map((saved) => (
            <li key={saved.id}>
              <strong>{saved.manifest.book.title}</strong>
              {" · "}
              {saved.status}
              {" · "}
              {saved.question_cursor}/{saved.manifest.questionCount} questions
              <p>
                Job {saved.id} · Updated{" "}
                {new Date(saved.updated_at).toLocaleString()}
              </p>
              {saved.status === "importing" ? (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => {
                    setPkg(null);
                    setFile(null);
                    run(saved);
                  }}
                >
                  Resume import
                </button>
              ) : (
                <Link to={`/admin/books/${saved.book_id}`}>Review book</Link>
              )}
            </li>
          ))}
        </ul>
      </details>
      <ol className="import-stages" aria-label="Import stages">
        {["Upload", "Validate", "Preview", "Import", "Publish"].map((s) => (
          <li key={s} aria-current={stage === s ? "step" : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <div
        className="import-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) inspect(e.dataTransfer.files[0]);
        }}
      >
        <label>
          Choose or drop a satchi-book-v1 ZIP
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => inspect(e.target.files[0])}
          />
        </label>
        <p>
          Up to 32 MB · Original or authorized content · Private draft until
          publication
        </p>
        {file && (
          <strong>
            {file.name} ·{" "}
            {file.size >= 1048576
              ? `${(file.size / 1048576).toFixed(2)} MB`
              : `${(file.size / 1024).toFixed(1)} KB`}
          </strong>
        )}
      </div>
      {busy && (
        <p role="status">
          {stage === "Validate"
            ? "Checking archive and content…"
            : `Importing verified content: ${job?.question_cursor || 0} / ${questionTotal} questions`}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {pkg && (
        <>
          <h3>{pkg.manifest.book.title}</h3>
          <p>
            {pkg.manifest.book.author} · {pkg.manifest.book.section} ·{" "}
            {pkg.summary.questions} questions · {pkg.summary.topics} topics
          </p>
          <details>
            <summary>Chapters, topics and classification</summary>
            <ul>
              {pkg.manifest.topics.map((t) => (
                <li key={t.id}>
                  {t.parent ? "↳ " : ""}
                  {t.title}
                </li>
              ))}
            </ul>
            <p>
              {Object.entries(
                pkg.questions.reduce((counts, q) => {
                  const key = `${q.domain} / ${q.difficulty}`;
                  counts[key] = (counts[key] || 0) + 1;
                  return counts;
                }, {}),
              )
                .map(([key, n]) => `${key}: ${n}`)
                .join(" · ")}
            </p>
          </details>
          <label>
            Preview question
            <select
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {pkg.questions.map((q, i) => (
                <option value={i} key={q.id}>
                  {i + 1}. {q.id} — {q.reviewStatus}
                </option>
              ))}
            </select>
          </label>
          {q && (
            <article className="preview-question">
              <p className="reading-text">
                <FormattedText>{q.passage}</FormattedText>
              </p>
              <h4>
                <FormattedText>{q.text}</FormattedText>
              </h4>
              {q.image && <LocalImage bytes={pkg.files.get(q.image)} />}
              <ol type="A">
                {q.options?.map((o, i) => (
                  <li key={o.label}>
                    <FormattedText>{o.text}</FormattedText>
                    {o.image && (
                      <LocalImage bytes={pkg.files.get(o.image)} />
                    )}{" "}
                    {q.answer === i && <strong>Correct</strong>}
                  </li>
                ))}
              </ol>
              {q.type === "open" && (
                <p>Accepted: {q.acceptedAnswers.join(", ")}</p>
              )}
              <p>
                <FormattedText>{q.explanation}</FormattedText>
              </p>
              {q.explanationImage && (
                <LocalImage bytes={pkg.files.get(q.explanationImage)} />
              )}
            </article>
          )}
          {!job && (
            <button className="button" disabled={busy} onClick={() => run()}>
              Import as draft
            </button>
          )}
        </>
      )}
      {job && (
        <div>
          <p role="status">
            Job {job.id} · {job.status} · {job.question_cursor}/{questionTotal}{" "}
            questions saved · {job.asset_cursor} assets saved
          </p>
          {job.status === "importing" && !busy && (
            <button className="button" onClick={() => run(job)}>
              Resume import
            </button>
          )}
          {job.status !== "importing" && (
            <>
              <p>
                {job.status === "published"
                  ? "Published in Books and Question Bank."
                  : "Draft saved. Review content before publishing."}
              </p>
              <Link
                className="button button-secondary"
                to={`/admin/books/${job.book_id}`}
              >
                Manage book
              </Link>
              {job.status === "draft" && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmPublish}
                      disabled={busy}
                      onChange={(e) => setConfirmPublish(e.target.checked)}
                    />{" "}
                    I reviewed the content and authorize publication to
                    students.
                  </label>
                  <button
                    className="button"
                    disabled={busy || !confirmPublish}
                    onClick={publish}
                  >
                    Publish validated book
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
function LocalImage({ bytes }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!bytes) return;
    const type =
      bytes[0] === 137
        ? "image/png"
        : bytes[0] === 255
          ? "image/jpeg"
          : "image/webp";
    const next = URL.createObjectURL(new Blob([bytes], { type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes]);
  return bytes ? (
    <img
      src={url || undefined}
      alt="Package content preview"
      loading="lazy"
      style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }}
    />
  ) : (
    <p className="form-error">Missing image</p>
  );
}
