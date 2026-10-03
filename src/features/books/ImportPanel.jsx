import ImportPreview from "./ImportPreview.jsx";
import { useState } from "react";
import { validateImport } from "./import-validation.js";
import { importContent } from "./api.js";
export default function ImportPanel({ topicId = null, onImported }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  function change(value) {
    setText(value);
    setPreview(null);
    setError("");
    setNotice("");
  }
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4000000) {
      setError("Choose a JSON file smaller than 4 MB.");
      return;
    }
    change(await file.text());
  }
  function inspect() {
    setNotice("");
    try {
      const payload = JSON.parse(text),
        validation = validateImport(payload, topicId ? "topic" : "book");
      setPreview({ payload, ...validation });
      setError("");
    } catch {
      setError("Enter valid JSON before previewing.");
      setPreview(null);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await importContent(preview.payload, topicId);
      setNotice(`Imported ${result.question_count} questions successfully.`);
      setPreview(null);
      setText("");
      onImported(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card import-panel">
      <h2>
        {topicId
          ? "Import questions into this topic"
          : "Import a complete book"}
      </h2>
      <p className="page-description">
        Paste or upload JSON, then validate before importing. Correct-answer
        indexes start at 0. Full books are drafts unless published is true.
      </p>
      <label>
        Upload JSON
        <input
          type="file"
          accept=".json,application/json"
          onChange={upload}
          disabled={busy}
        />
      </label>
      <label>
        JSON content
        <textarea
          rows={8}
          value={text}
          onChange={(e) => change(e.target.value)}
          disabled={busy}
          placeholder={
            topicId
              ? '{"questions": [...]}'
              : '{"book": {"title": "..."}, "topics": [...]}'
          }
        />
      </label>
      <button
        className="button button-secondary"
        onClick={inspect}
        disabled={busy || !text.trim()}
      >
        Preview and validate
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {preview && (
        <div className="import-preview">
          <h3>Import preview</h3>
          <p>
            {preview.title || "Existing topic"} · {preview.topics} topics ·{" "}
            {preview.questions} questions
          </p>
          {preview.errors.length ? (
            <ul className="form-error" role="alert">
              {preview.errors.slice(0, 50).map((v, i) => (
                <li key={i}>{v}</li>
              ))}
              {preview.errors.length > 50 && (
                <li>Additional errors omitted. Correct these first.</li>
              )}
            </ul>
          ) : (
            <>
              <ImportPreview payload={preview.payload} />
              <p className="form-notice">
                Validation passed. All content will be imported together.
              </p>
              <button className="button" disabled={busy} onClick={submit}>
                {busy ? "Importing…" : "Import validated content"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
