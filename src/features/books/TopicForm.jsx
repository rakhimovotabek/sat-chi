import { useState } from "react";
import { saveTopic } from "./api.js";
export default function TopicForm({
  bookId,
  topics,
  topic,
  onSaved,
  onCancel,
}) {
  const [title, setTitle] = useState(topic?.title || "");
  const [parent, setParent] = useState(topic?.parent_id || "");
  const [position, setPosition] = useState(topic?.position ?? topics.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const excluded = new Set(topic ? [topic.id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of topics)
      if (excluded.has(t.parent_id) && !excluded.has(t.id)) {
        excluded.add(t.id);
        changed = true;
      }
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveTopic(
        {
          book_id: bookId,
          title: title.trim(),
          parent_id: parent || null,
          position: Number(position),
        },
        topic?.id,
      );
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card content-form" onSubmit={submit}>
      <h2>{topic ? "Edit topic" : "Create topic"}</h2>
      <label>
        Topic title
        <input
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Parent topic
        <select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Top-level topic</option>
          {topics
            .filter((t) => !excluded.has(t.id))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Order
        <input
          type="number"
          min={0}
          required
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save topic"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
