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
      if (values.cover_url && new URL(values.cover_url).protocol !== "https:")
        throw new Error("Use an HTTPS cover URL.");
      const result = await saveBook(
        {
          ...values,
          title: values.title.trim(),
          cover_url: values.cover_url || null,
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
        <input type="url" placeholder="https://…" {...field("cover_url")} />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) =>
            setValues((v) => ({ ...v, published: e.target.checked }))
          }
        />
        Published — visible to students
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
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
