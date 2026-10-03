import { useState } from "react";
import useContent from "../books/useContent.js";
import Filters from "./Filters.jsx";
import QuestionPicker from "./QuestionPicker.jsx";
import useAction from "./useAction.js";
import * as api from "./api.js";
const newSection = () => ({
  key: crypto.randomUUID(),
  title: "",
  count: 5,
  filters: {},
  mode: "random",
  questionIds: [],
});
export default function HomeworkForm({ onCreated }) {
  const [title, setTitle] = useState(""),
    [instructions, setInstructions] = useState(""),
    [due, setDue] = useState(""),
    [timed, setTimed] = useState(false),
    [minutes, setMinutes] = useState(60),
    [all, setAll] = useState(false),
    [chosenGroups, setChosenGroups] = useState([]),
    [chosenStudents, setChosenStudents] = useState([]),
    [search, setSearch] = useState(""),
    [sections, setSections] = useState([newSection()]);
  const groupState = useContent(api.groups),
    studentState = useContent(() => api.searchStudents(search), [search]),
    action = useAction();
  const change = (key, patch) =>
    setSections((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  const toggle = (set, value, id) =>
    set(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  async function submit(e) {
    e.preventDefault();
    await action.run(async () => {
      await api.createHomework({
        title,
        instructions,
        dueAt: new Date(due).toISOString(),
        timed,
        timeLimit: timed ? Number(minutes) * 60 : null,
        allStudents: all,
        groups: chosenGroups,
        students: chosenStudents,
        sections: sections.map((s) => ({
          title: s.title,
          count: s.mode === "specific" ? s.questionIds.length : Number(s.count),
          filters: s.filters,
          ...(s.mode === "specific" ? { questionIds: s.questionIds } : {}),
        })),
      });
      setTitle("");
      setSections([newSection()]);
      onCreated();
    });
  }
  return (
    <form className="card learning-panel learning-form" onSubmit={submit}>
      <h2>Create homework</h2>
      <div className="filter-grid">
        <label>
          Homework title
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Due date and time
          <input
            type="datetime-local"
            required
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <label>
          Mode
          <select
            value={String(timed)}
            onChange={(e) => setTimed(e.target.value === "true")}
          >
            <option value="false">Untimed</option>
            <option value="true">Timed</option>
          </select>
        </label>
        {timed && (
          <label>
            Time limit (minutes)
            <input
              type="number"
              min="1"
              max="360"
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        )}
      </div>
      <label>
        Instructions
        <textarea
          value={instructions}
          maxLength={10000}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <fieldset className="assignment-targets">
        <legend>Assign to</legend>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          All active students
        </label>
        {!all && (
          <>
            <div className="filter-grid">
              {groupState.data?.map((g) => (
                <label key={g.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={chosenGroups.includes(g.id)}
                    onChange={() => toggle(setChosenGroups, chosenGroups, g.id)}
                  />
                  {g.name}
                </label>
              ))}
            </div>
            <label>
              Search students
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="recipient-list">
              {studentState.data?.map((s) => (
                <label key={s.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={chosenStudents.includes(s.id)}
                    onChange={() =>
                      toggle(setChosenStudents, chosenStudents, s.id)
                    }
                  />
                  {s.display_name || "Student"}
                </label>
              ))}
            </div>
            <p>
              {chosenStudents.length} students and {chosenGroups.length} groups
              selected
            </p>
          </>
        )}
        {(groupState.error || studentState.error) && (
          <p role="alert">{groupState.error || studentState.error}</p>
        )}
      </fieldset>
      {sections.map((s, index) => (
        <fieldset className="homework-builder-section" key={s.key}>
          <legend>Section {index + 1}</legend>
          <div className="filter-grid">
            <label>
              Section title
              <input
                required
                value={s.title}
                onChange={(e) => change(s.key, { title: e.target.value })}
              />
            </label>
            <label>
              Question selection
              <select
                value={s.mode}
                onChange={(e) => change(s.key, { mode: e.target.value })}
              >
                <option value="random">Random by filters</option>
                <option value="specific">Specific questions</option>
              </select>
            </label>
            {s.mode === "random" && (
              <label>
                Question count
                <input
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={s.count}
                  onChange={(e) => change(s.key, { count: e.target.value })}
                />
              </label>
            )}
          </div>
          <Filters
            status={false}
            value={s.filters}
            onChange={(filters) => change(s.key, { filters, questionIds: [] })}
          />
          {s.mode === "specific" && (
            <QuestionPicker
              filters={s.filters}
              value={s.questionIds}
              onChange={(questionIds) => change(s.key, { questionIds })}
            />
          )}
          {sections.length > 1 && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                setSections((list) => list.filter((v) => v.key !== s.key))
              }
            >
              Remove section
            </button>
          )}
        </fieldset>
      ))}
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button-secondary"
          disabled={sections.length >= 20}
          onClick={() => setSections((s) => [...s, newSection()])}
        >
          Add section
        </button>
        <button
          className="button"
          disabled={
            action.busy ||
            (!all && !chosenGroups.length && !chosenStudents.length) ||
            sections.some((s) => s.mode === "specific" && !s.questionIds.length)
          }
        >
          {action.busy ? "Assigning…" : "Create and assign homework"}
        </button>
      </div>
      <p className="empty-copy">
        Each section is validated and frozen together. If there are too few
        questions, nothing is created.
      </p>
    </form>
  );
}
