import { useState } from "react";
import { validateQuestion } from "./import-validation.js";
import { saveQuestion } from "./api.js";
export default function QuestionForm({
  topicId,
  question,
  onSaved,
  onCancel,
  onSubmitPayload,
  requireAnswerSelection = false,
}) {
  const answer = question?.question_answers;
  const key = Array.isArray(answer) ? answer[0] : answer;
  const [values, setValues] = useState({
    type: "mcq",
    question: question?.question_text || "",
    passage: question?.passage || "",
    stimulus: question?.stimulus || "",
    options: question?.options || ["", "", "", ""],
    correctAnswer: key?.correct_answer ?? (requireAnswerSelection ? -1 : 0),
    explanation: key?.explanation || "",
    domain: question?.domain || "",
    skill: question?.skill || "",
    difficulty: question?.difficulty || "medium",
    source: question?.source || "",
    imageUrl: question?.image_url || "",
  });
  const [table, setTable] = useState(
    question?.stimulus_table
      ? JSON.stringify(question.stimulus_table, null, 2)
      : "",
  );
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const field = (k) => ({
    value: values[k],
    onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });
  async function submit(e) {
    e.preventDefault();
    let payload = { ...values };
    try {
      if (table.trim()) payload.table = JSON.parse(table);
    } catch {
      setErrors(["Stimulus table must be valid JSON."]);
      return;
    }
    const problems = validateQuestion(payload);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      if (onSubmitPayload) await onSubmitPayload(payload);
      else await saveQuestion(topicId, payload, question?.id);
      onSaved();
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card content-form" onSubmit={submit}>
      <h2>{question ? "Edit question" : "Create question"}</h2>
      <label>
        Question text
        <textarea
          aria-label="Question text"
          rows={4}
          required
          maxLength={20000}
          {...field("question")}
        />
      </label>
      <label>
        Passage
        <textarea rows={5} maxLength={60000} {...field("passage")} />
      </label>
      <label>
        Stimulus / reference text
        <textarea rows={3} maxLength={60000} {...field("stimulus")} />
      </label>
      <label>
        Image URL
        <input type="url" placeholder="https://…" {...field("imageUrl")} />
      </label>
      <label>
        Stimulus table JSON{" "}
        <span className="field-hint">Optional: columns and rows arrays.</span>
        <textarea
          rows={3}
          value={table}
          onChange={(e) => setTable(e.target.value)}
        />
      </label>
      <div className="profile-fields">
        {values.options.map((o, i) => (
          <label key={i}>
            Option {String.fromCharCode(65 + i)}
            <textarea
              required
              maxLength={4000}
              rows={2}
              value={o}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  options: v.options.map((value, j) =>
                    j === i ? e.target.value : value,
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>
      <label>
        Correct answer
        <select
          aria-label="Correct answer"
          value={values.correctAnswer}
          onChange={(e) =>
            setValues((v) => ({ ...v, correctAnswer: Number(e.target.value) }))
          }
        >
          {requireAnswerSelection && (
            <option value={-1}>Select verified answer</option>
          )}
          {values.options.map((_, i) => (
            <option value={i} key={i}>
              {String.fromCharCode(65 + i)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Explanation
        <textarea rows={4} maxLength={60000} {...field("explanation")} />
      </label>
      <div className="profile-fields">
        <label>
          Domain
          <input maxLength={200} {...field("domain")} />
        </label>
        <label>
          Skill
          <input maxLength={200} {...field("skill")} />
        </label>
        <label>
          Difficulty
          <select {...field("difficulty")}>
            {["easy", "medium", "hard", "unclassified"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Source
          <input maxLength={500} {...field("source")} />
        </label>
      </div>
      {errors.length > 0 && (
        <ul className="form-error" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save question"}
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
