import { Link } from "react-router";
import { useState } from "react";
import { CATEGORIES } from "./import-validation.js";
import { saveBook } from "./api.js";
export default function BookForm({ book, onSaved, onCancel }) {
  const [values, setValues] = useState({
    title: book?.title || "",
    description: book?.description || "",
    category: book?.category || "Other",
    cover_url: book?.cover_url || "",
    published: book?.published || false,
  });
  const [removeCover, setRemoveCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (name) => ({
    value: values[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        !removeCover &&
        values.cover_url &&
        new URL(values.cover_url.trim()).protocol !== "https:"
      )
        throw new Error("Use an HTTPS cover URL.");
      const result = await saveBook(
        {
          ...values,
          title: values.title.trim(),
          cover_url: removeCover ? null : values.cover_url || null,
          ...(removeCover ? { cover_path: null, cover_metadata: {} } : {}),
        },
        book?.id,
      );
      onSaved(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card content-form" onSubmit={submit}>
      <h2>{book ? "Edit book" : "Create book"}</h2>
      <label>
        Book title
        <input required maxLength={160} {...field("title")} />
      </label>
      <label>
        Description
        <textarea maxLength={10000} rows={3} {...field("description")} />
      </label>
      <label>
        Category
        <select {...field("category")}>
          {CATEGORIES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Cover image URL
        <input
          type="url"
          disabled={removeCover}
          maxLength={2048}
          placeholder="https://…"
          {...field("cover_url")}
        />
      </label>
      {(book?.cover_path || book?.cover_url) && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={removeCover}
            onChange={(e) => setRemoveCover(e.target.checked)}
          />
          Remove current cover and use fallback
        </label>
      )}
      <p className="book-save-status">
        {book?.published
          ? "Currently published — visible to students"
          : "Currently draft — visible to administrators"}
      </p>
      {book?.cover_path && !values.cover_url && !removeCover && (
        <p className="empty-copy">
          The generated first-page cover will be kept. A cover is optional.
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) =>
            setValues((v) => ({ ...v, published: e.target.checked }))
          }
        />
        Publish this book after saving
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
          {error.includes("Content Review") && (
            <Link to="/admin/content-review">Review imported content</Link>
          )}
        </p>
      )}
      <div className="button-row">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save book"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
