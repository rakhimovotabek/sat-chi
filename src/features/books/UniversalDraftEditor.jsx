import QuestionImage from "../../components/QuestionImage.jsx";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
export default function UniversalDraftEditor({ bookId, published, onSaved }) {
  const [data, setData] = useState(null),
    [index, setIndex] = useState(0),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [target, setTarget] = useState("B"),
    [preview, setPreview] = useState(null);
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
  async function invoke(body, headers) {
    const { data: result, error } = await supabase.functions.invoke(
      "import-book",
      { body, headers },
    );
    if (error || result?.error) {
      let detail;
      try {
        detail = await error?.context?.json();
      } catch {
        /* transport failure */
      }
      throw new Error(detail?.error || result?.error || error.message);
    }
    return result;
  }
  async function replaceImage(file) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const record = JSON.parse(text);
      if (
        target !== "stem" &&
        (!Array.isArray(record.options) || record.options.length !== 4)
      )
        throw new Error(
          "Select a multiple-choice record to replace an option image.",
        );
      if (file.size > 8 * 1024 * 1024) throw new Error("Image exceeds 8 MiB.");
      const result = await invoke(file, {
        "Content-Type": file.type,
        "x-satchi-job": data.job,
      });
      if (target === "stem") record.image = result.path;
      else record.options["ABCD".indexOf(target)].image = result.path;
      setText(JSON.stringify(record, null, 2));
      setPreview(result.imageUrl);
      setMessage(
        "Image uploaded and verified. Review the record, then save the validated correction to apply it. Original assets are retained.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const correction = JSON.parse(text);
      await invoke({ jobId: data.job, correction });
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
          aria-label="Question"
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            setIndex(i);
            setPreview(null);
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
      <fieldset disabled={busy || published}>
        <legend>Replace a stem or option image</legend>
        <label>
          Replace image for
          <select
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              setPreview(null);
            }}
          >
            <option value="stem">Question stem</option>
            {[..."ABCD"].map((label) => (
              <option value={label} key={label}>
                Option {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Replacement PNG, JPEG or WebP
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              replaceImage(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p>
          Up to 8 MiB. Uploading stages the image; save the reviewed record to
          apply it. Existing option text stays editable below.
        </p>
        {preview && (
          <QuestionImage src={preview} alt="Replacement image preview" />
        )}
      </fieldset>
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
