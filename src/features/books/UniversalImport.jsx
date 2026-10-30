import { useState, useEffect } from "react";
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
  async function inspect(selected) {
    if (!selected) return;
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
  async function run() {
    setBusy(true);
    setError("");
    setStage("Import");
    try {
      let current = await invoke(file, { "Content-Type": "application/zip" });
      setJob(current);
      while (current.status === "importing") {
        current = await invoke({ jobId: current.id });
        setJob(current);
      }
      setStage("Publish");
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
    }
    setBusy(false);
  }
  const q = pkg?.questions[index];
  return (
    <section
      className="card import-panel universal-import"
      aria-label="Import Book"
    >
      <h2>Import Book</h2>
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
            {file.name} · {(file.size / 1048576).toFixed(2)} MB
          </strong>
        )}
      </div>
      {busy && (
        <p role="status">
          {stage === "Validate"
            ? "Checking archive and content…"
            : `Importing verified content: ${job?.question_cursor || 0} / ${pkg?.questions.length || 0} questions`}
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
          {!job || job.status === "importing" ? (
            <button className="button" disabled={busy} onClick={run}>
              Import as draft
            </button>
          ) : (
            <>
              <p role="status">
                {job.status === "published"
                  ? "Published in Books and Question Bank."
                  : "Draft saved. Review content before publishing."}
              </p>
              <div className="button-row">
                <Link
                  className="button button-secondary"
                  to={`/admin/books/${job.book_id}`}
                >
                  Manage draft
                </Link>
                {job.status === "draft" && (
                  <button className="button" disabled={busy} onClick={publish}>
                    Publish validated book
                  </button>
                )}
              </div>
            </>
          )}
        </>
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
