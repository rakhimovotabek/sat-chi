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
export default function HomeworkForm({ onCreated, template, assignment }) {
  const initial = template?.data || assignment?.data || {};
  const [type, setType] = useState(template ? "daily" : "once"),
    [startDate, setStartDate] = useState(
      initial.startDate ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Tashkent",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
    ),
    [endDate, setEndDate] = useState(initial.endDate || ""),
    [timezone, setTimezone] = useState(initial.timezone || "Asia/Tashkent"),
    [active, setActive] = useState(template?.state !== "paused"),
    [allowLate, setAllowLate] = useState(initial.allowLate ?? true),
    [allowRepeat, setAllowRepeat] = useState(initial.allowRepeat ?? false);
  const daily = type === "daily";
  const [title, setTitle] = useState(initial.title || ""),
    [instructions, setInstructions] = useState(initial.instructions || ""),
    [due, setDue] = useState(
      initial.dueAt
        ? new Date(
            new Date(initial.dueAt).getTime() -
              new Date(initial.dueAt).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [timed, setTimed] = useState(initial.timed ?? !!initial.timeLimit),
    [minutes, setMinutes] = useState(
      initial.timeLimit ? initial.timeLimit / 60 : 60,
    ),
    [all, setAll] = useState(initial.allStudents || false),
    [chosenGroups, setChosenGroups] = useState(initial.groups || []),
    [chosenStudents, setChosenStudents] = useState(initial.students || []),
    [search, setSearch] = useState(""),
    [sections, setSections] = useState(
      initial.sections?.map((s) => ({
        ...newSection(),
        ...s,
        key: s.id,
        mode: "specific",
      })) || [
        {
          ...newSection(),
          title: template ? "Daily questions" : "",
          count: initial.count || 5,
          filters: initial.filters || {},
          mode: initial.questionIds?.length ? "specific" : "random",
          questionIds: initial.questionIds || [],
        },
      ],
    );
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
      const common = {
        title,
        instructions,
        timeLimit: timed ? Number(minutes) * 60 : null,
        allStudents: all,
        groups: chosenGroups,
        students: chosenStudents,
      };
      if (daily) {
        const section = sections[0];
        await api.saveDailyHomework(
          {
            ...common,
            startDate,
            endDate: endDate || null,
            timezone,
            active,
            allowLate,
            allowRepeat,
            count:
              section.mode === "specific"
                ? section.questionIds.length
                : Number(section.count),
            selection: initial.selection || "new",
            filters: section.filters,
            questionIds: section.mode === "specific" ? section.questionIds : [],
          },
          template?.id,
        );
      } else {
        const data = {
          title,
          instructions,
          dueAt: new Date(due).toISOString(),
          timed,
          timeLimit: timed ? Number(minutes) * 60 : null,
          allStudents: all,
          groups: chosenGroups,
          students: chosenStudents,
          sections: sections.map((s) => ({
            ...(s.id ? { id: s.id } : {}),
            title: s.title,
            count:
              s.mode === "specific" ? s.questionIds.length : Number(s.count),
            filters: s.filters,
            ...(s.mode === "specific" ? { questionIds: s.questionIds } : {}),
          })),
        };
        if (assignment) await api.updateHomework(assignment.id, data);
        else await api.createHomework(data);
      }
      setTitle("");
      setSections([newSection()]);
      onCreated();
    });
  }
  return (
    <form className="card learning-panel learning-form" onSubmit={submit}>
      <h2>
        {template
          ? "Edit recurring homework"
          : assignment
            ? "Edit homework"
            : "Create homework"}
      </h2>
      <label>
        Homework type
        <select
          disabled={!!template || !!assignment}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="once">One-time</option>
          <option value="daily">Daily recurring</option>
        </select>
      </label>
      {daily && (
        <>
          <div className="filter-grid">
            <label>
              Start date
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              End date (optional)
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <label>
              Timezone
              <input
                required
                disabled={!!template}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Tashkent"
              />
            </label>
            {!template && (
              <label>
                Initial status
                <select
                  value={String(active)}
                  onChange={(e) => setActive(e.target.value === "true")}
                >
                  <option value="true">Active</option>
                  <option value="false">Paused</option>
                </select>
              </label>
            )}
          </div>
          <p className="empty-copy">
            Due by midnight in {timezone}.{" "}
            {template
              ? "Edits and recipient changes take effect tomorrow; today and history stay intact."
              : "New assignments begin no earlier than today."}
          </p>
        </>
      )}
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
        {!daily && (
          <label>
            Due date and time
            <input
              type="datetime-local"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
        )}
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
      {(daily ? sections.slice(0, 1) : sections).map((s, index) => (
        <fieldset className="homework-builder-section" key={s.key}>
          <legend>
            {daily ? "Daily question rules" : `Section ${index + 1}`}
          </legend>
          <div className="filter-grid">
            {!daily && (
              <label>
                Section title
                <input
                  required
                  value={s.title}
                  onChange={(e) => change(s.key, { title: e.target.value })}
                />
              </label>
            )}
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
            {(daily || s.mode === "random") && (
              <label>
                {daily ? "Questions per day" : "Question count"}
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
          {!daily && sections.length > 1 && (
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
      {daily && (
        <fieldset className="assignment-targets">
          <legend>Completion and question reuse</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={allowLate}
              onChange={(e) => setAllowLate(e.target.checked)}
            />
            Allow late completion
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={allowRepeat}
              onChange={(e) => setAllowRepeat(e.target.checked)}
            />
            Allow previously assigned questions after pool exhaustion
          </label>
          <p className="empty-copy">
            Unseen questions are preferred. Without reuse, an exhausted pool
            requires the teacher to expand the question rules.
          </p>
        </fieldset>
      )}
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
      <div className="button-row">
        {!daily && (
          <button
            type="button"
            className="button button-secondary"
            disabled={sections.length >= 20}
            onClick={() => setSections((s) => [...s, newSection()])}
          >
            Add section
          </button>
        )}
        <button
          className="button"
          disabled={
            action.busy ||
            (!all && !chosenGroups.length && !chosenStudents.length) ||
            (daily ? sections.slice(0, 1) : sections).some(
              (s) =>
                s.mode === "specific" &&
                (!s.questionIds.length ||
                  (daily && s.questionIds.length < Number(s.count))),
            )
          }
        >
          {action.busy
            ? "Saving…"
            : template
              ? "Save recurring homework"
              : assignment
                ? "Save homework"
                : "Create and assign homework"}
        </button>
      </div>
      <p className="empty-copy">
        Each section is validated and frozen together. If there are too few
        questions, nothing is created.
      </p>
    </form>
  );
}
