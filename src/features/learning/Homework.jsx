import HomeworkManagement from "./HomeworkManagement.jsx";
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import Modal from "../../components/Modal.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import DailyHomeworkStudent from "./DailyHomeworkStudent.jsx";
import DailyHomeworkAdmin from "./DailyHomeworkAdmin.jsx";
import HomeworkForm from "./HomeworkForm.jsx";
import useAction from "./useAction.js";
import { homework, startHomework, editHomework } from "./api.js";
import { homeworkStatus } from "./homework-model.js";
export default function Homework({ admin = false }) {
  const state = useContent(
      () => (admin ? Promise.resolve([]) : homework()),
      [admin],
    ),
    action = useAction(),
    navigate = useNavigate(),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(null),
    [revision, setRevision] = useState(0);
  return (
    <>
      <PageHeader
        eyebrow={admin ? "Assignments & completion" : "Your practice plan"}
        title="Homework"
        description={
          admin
            ? "Create section-based homework and follow student completion."
            : "Start an assignment or continue exactly where you left off."
        }
      />
      {admin && (
        <button className="button" onClick={() => setCreating((v) => !v)}>
          {creating ? "Close assignment form" : "New homework"}
        </button>
      )}
      {creating && (
        <HomeworkForm
          onCreated={() => {
            setCreating(false);
            setRevision((v) => v + 1);
            state.reload();
          }}
        />
      )}
      {admin && <DailyHomeworkAdmin key={revision} />}
      {admin && editing && (
        <Modal title="Edit one-time homework" onClose={() => setEditing(null)}>
          <HomeworkForm
            assignment={editing}
            onCreated={() => {
              setEditing(null);
              setRevision((v) => v + 1);
              state.reload();
            }}
          />
        </Modal>
      )}
      {admin && (
        <HomeworkManagement
          revision={revision}
          onChanged={() => state.reload()}
          onEdit={(id) =>
            action.run(async () => setEditing(await editHomework(id)))
          }
        />
      )}
      {!admin && (
        <>
          <DailyHomeworkStudent />
          <h2>Other homework</h2>
        </>
      )}
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      {!admin &&
        (state.loading || state.error ? (
          <ContentState {...state} onRetry={state.reload} />
        ) : !state.data.length ? (
          <section className="card empty-state">
            <h2>No one-time homework assigned</h2>
            <p>Your assigned homework will appear here.</p>
          </section>
        ) : (
          ["Today", "Upcoming", "In Progress", "Overdue", "Completed"].map(
            (status) => {
              const rows = state.data.filter(
                (row) => homeworkStatus(row) === status,
              );
              return (
                <section className="dashboard-section" key={status}>
                  <div className="section-heading">
                    <h2>{status}</h2>
                    <span>{rows.length}</span>
                  </div>
                  {!rows.length ? (
                    <p className="empty-copy">
                      No {status.toLowerCase()} homework.
                    </p>
                  ) : (
                    <div className="card-grid">
                      {rows.map((row) => (
                        <article
                          className="card learning-panel"
                          key={row.assignment_id}
                        >
                          <span className="subtle-badge">
                            {row.timed ? "Timed" : "Untimed"}
                          </span>
                          <h3>{row.title}</h3>
                          <p className="page-description">{row.instructions}</p>
                          <small>
                            Due {new Date(row.due_at).toLocaleString()}
                          </small>
                          <ul className="section-list">
                            {row.sections?.map((s, i) => (
                              <li key={i}>
                                {s.title}
                                <strong>{s.count} questions</strong>
                              </li>
                            ))}
                          </ul>
                          <button
                            className="button"
                            disabled={action.busy}
                            onClick={() =>
                              action.run(async () =>
                                navigate(
                                  `/practice/${await startHomework(row.assignment_id)}`,
                                ),
                              )
                            }
                          >
                            {row.submitted_at
                              ? "View results"
                              : row.session_id
                                ? "Resume homework"
                                : "Start homework"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            },
          )
        ))}
    </>
  );
}
