import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
export default function UniversalDraftEditor({ bookId, published, onSaved }) {
  const [data, setData] = useState(null),
    [index, setIndex] = useState(0),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    supabase
      .rpc("universal_draft_records", { p_book: bookId })
      .then(({ data, error }) => {
        if (active && !error && data) {
          setData(data);
          setText(JSON.stringify(data.records[0]?.record, null, 2));
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);
  if (!data) return null;
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const correction = JSON.parse(text);
      const { data: result, error } = await supabase.functions.invoke(
        "import-book",
        { body: { jobId: data.job, correction } },
      );
      if (error || result?.error)
        throw new Error(result?.error || error.message);
      setData((d) => ({
        ...d,
        records: d.records.map((r, i) =>
          i === index ? { ...r, record: correction } : r,
        ),
      }));
      setMessage(
        "Correction saved. Validate and publish when every question is approved.",
      );
      onSaved?.();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card">
      <summary>Review and correct imported questions</summary>
      <p>
        Edit text, original choice content, answer, explanation, classification
        and reviewStatus. Preserve source IDs. Hide published books before
        correcting. Image references must belong to the uploaded package.
      </p>
      <label>
        Question
        <select
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            setIndex(i);
            setText(JSON.stringify(data.records[i].record, null, 2));
          }}
        >
          {data.records.map((r, i) => (
            <option key={r.questionId} value={i}>
              {r.record.id} · {r.record.reviewStatus}
            </option>
          ))}
        </select>
      </label>
      <label>
        Question record
        <textarea
          aria-label="Question record"
          rows={16}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy || published}
        />
      </label>
      <button className="button" disabled={busy || published} onClick={save}>
        Save validated correction
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
