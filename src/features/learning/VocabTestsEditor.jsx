import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { validateQuestion } from "../books/import-validation.js";
import { checked } from "./api.js";
import useAction from "./useAction.js";
export default function VocabTestsEditor({ setId }) {
  const state = useContent(
      () =>
        checked(
          supabase
            .from("vocabulary_questions")
            .select("*")
            .eq("set_id", setId)
            .order("id")
            .limit(100),
        ),
      [setId],
    ),
    [text, setText] = useState(""),
    [editing, setEditing] = useState(null),
    [errors, setErrors] = useState([]),
    action = useAction();
  return (
    <section className="card learning-panel learning-form">
      <h2>Vocabulary test questions</h2>
      <p className="page-description">
        Add definition selection, sentence completion or word-in-context prompts
        with four options. Correct-answer indexes start at 0.
      </p>
      <ContentState {...state} onRetry={state.reload} />
      <div className="item-list">
        {state.data?.map((q) => (
          <div className="list-row" key={q.id}>
            <span>{q.payload.question}</span>
            <button
              className="button button-secondary button-compact"
              onClick={() => {
                setEditing(q.id);
                setText(JSON.stringify(q.payload, null, 2));
                setErrors([]);
              }}
            >
              Edit test question
            </button>
          </div>
        ))}
      </div>
      <label>
        Test question JSON
        <textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {errors.length > 0 && (
        <ul className="form-error" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      <div className="button-row">
        <button
          className="button"
          disabled={action.busy}
          onClick={() => {
            let payload;
            try {
              payload = JSON.parse(text);
            } catch {
              setErrors(["Enter valid JSON."]);
              return;
            }
            const validation = validateQuestion(payload);
            setErrors(validation);
            if (validation.length) return;
            action.run(async () => {
              await checked(
                editing
                  ? supabase
                      .from("vocabulary_questions")
                      .update({ payload })
                      .eq("id", editing)
                  : supabase
                      .from("vocabulary_questions")
                      .insert({ set_id: setId, payload }),
              );
              setEditing(null);
              setText("");
              state.reload();
            });
          }}
        >
          {editing ? "Save test question" : "Add test question"}
        </button>
        {editing && (
          <button
            className="button button-secondary"
            onClick={() => {
              setEditing(null);
              setText("");
            }}
          >
            New question
          </button>
        )}
      </div>
    </section>
  );
}
