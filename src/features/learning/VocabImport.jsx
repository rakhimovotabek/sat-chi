import { useState } from "react";
import useAction from "./useAction.js";
import { validateVocabulary } from "./vocabulary-validation.js";
import * as api from "./api.js";
export default function VocabImport({ reload }) {
  const [text, setText] = useState(""),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    action = useAction();
  function inspect() {
    try {
      const payload = JSON.parse(text),
        errors = validateVocabulary(payload);
      setPreview({ payload, errors });
      setError("");
    } catch {
      setError("Enter valid JSON.");
    }
  }
  return (
    <section className="card learning-panel learning-form">
      <h2>Import vocabulary book</h2>
      <p className="page-description">
        Use title, source, published, and sets. Each set contains title, words,
        optional passage, and optional questions. Words have word, definition,
        example, synonym and translation. Question answers use zero-based
        indexes.
      </p>
      <label>
        Upload vocabulary JSON
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const f = e.target.files[0];
            if (f?.size > 4000000) {
              setError("Choose a file under 4 MB.");
              return;
            }
            if (f) {
              setText(await f.text());
              setPreview(null);
            }
          }}
        />
      </label>
      <label>
        Vocabulary JSON
        <textarea
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
      </label>
      <button className="button button-secondary" onClick={inspect}>
        Preview vocabulary
      </button>
      {preview && (
        <>
          <p>
            {preview.payload.title} · {preview.payload.sets?.length || 0} sets
          </p>
          {preview.errors.length ? (
            <ul role="alert">
              {preview.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <>
              <div className="item-list">
                {preview.payload.sets.map((s, i) => (
                  <details key={i}>
                    <summary>
                      {s.title} · {s.words.length} words
                    </summary>
                    {s.words.map((w, j) => (
                      <p key={j}>
                        <strong>{w.word}</strong> — {w.definition}
                      </p>
                    ))}
                    {s.passage && <p className="reading-text">{s.passage}</p>}
                  </details>
                ))}
              </div>
              <button
                className="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api.importVocab(preview.payload);
                    setPreview(null);
                    setText("");
                    reload();
                  })
                }
              >
                Import validated vocabulary
              </button>
            </>
          )}
        </>
      )}
      {(error || action.error) && (
        <p role="alert" className="form-error">
          {error || action.error}
        </p>
      )}
    </section>
  );
}
