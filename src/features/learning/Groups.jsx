import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";
import * as api from "./api.js";
export default function Groups() {
  const state = useContent(api.groups),
    [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [search, setSearch] = useState("");
  const memberState = useContent(
    () => (selected ? api.members(selected) : Promise.resolve([])),
    [selected, state.data],
  );
  const summary = useContent(
    () =>
      selected
        ? api.rpc("group_summary", { p_group: selected })
        : Promise.resolve(null),
    [selected, memberState.data],
  );
  const students = useContent(() => api.searchStudents(search), [search]);
  const action = useAction();
  const selectedGroup = state.data?.find((g) => g.id === selected);
  async function save(e) {
    e.preventDefault();
    await action.run(async () => {
      await api.saveGroup(name.trim(), selected || undefined);
      setName("");
      setSelected("");
      state.reload();
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="Classes & cohorts"
        title="Groups"
        description="Organize students and assign practice to the right learning group."
      />
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      <div className="learning-columns">
        <section className="card learning-panel">
          <h2>{selected ? "Rename group" : "Create group"}</h2>
          <form onSubmit={save} className="learning-form">
            <label>
              Group name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button" disabled={action.busy}>
              {selected ? "Save name" : "Create group"}
            </button>
          </form>
          {state.loading || state.error ? (
            <ContentState {...state} onRetry={state.reload} />
          ) : !state.data.length ? (
            <p className="empty-copy">
              No groups yet. Create your first class above.
            </p>
          ) : (
            <div className="item-list">
              {state.data.map((g) => (
                <button
                  key={g.id}
                  className={`list-button ${selected === g.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelected(g.id);
                    setName(g.name);
                  }}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="button-row">
              <button
                className="button button-secondary"
                onClick={() => {
                  setSelected("");
                  setName("");
                }}
              >
                New group
              </button>
              <button
                className="button button-danger"
                disabled={action.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this group and its memberships? Existing homework assignments remain.",
                    )
                  )
                    action.run(async () => {
                      await api.removeGroup(selected);
                      setSelected("");
                      setName("");
                      state.reload();
                    });
                }}
              >
                Delete group
              </button>
            </div>
          )}
        </section>
        <section className="card learning-panel">
          <h2>{selectedGroup?.name || "Group members"}</h2>
          {summary.data && (
            <p className="empty-copy">
              {summary.data.questions} questions answered ·{" "}
              {Math.floor(summary.data.study_seconds / 60)} minutes studied ·{" "}
              {summary.data.completed} homework completions
            </p>
          )}
          {!selected ? (
            <p className="empty-copy">Select a group to manage its members.</p>
          ) : (
            <>
              {memberState.loading || memberState.error ? (
                <ContentState {...memberState} onRetry={memberState.reload} />
              ) : (
                <>
                  <p className="page-description">
                    {memberState.data.length} members
                  </p>
                  <div className="item-list">
                    {memberState.data.map((m) => (
                      <div className="list-row" key={m.id}>
                        <span>
                          {m.profiles?.display_name ||
                            m.profiles?.username ||
                            "Student"}
                        </span>
                        <button
                          className="button button-secondary button-compact"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(async () => {
                              await api.removeMember(m.id);
                              memberState.reload();
                            })
                          }
                        >
                          Remove student
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <label className="learning-field">
                Search students
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                />
              </label>
              {students.error && <p role="alert">{students.error}</p>}
              <div className="item-list">
                {students.data
                  ?.filter(
                    (s) =>
                      !memberState.data?.some((m) => m.student_id === s.id),
                  )
                  .map((s) => (
                    <div className="list-row" key={s.id}>
                      <span>{s.display_name || "Student"}</span>
                      <button
                        className="button button-secondary button-compact"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(async () => {
                            await api.addMember(selected, s.id);
                            memberState.reload();
                          })
                        }
                      >
                        Add student
                      </button>
                    </div>
                  ))}
              </div>
              <p className="empty-copy">
                Showing up to 50 matching students. Refine your search for
                larger classes.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
