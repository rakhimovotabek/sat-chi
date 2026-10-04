import { useState } from "react";
import { useNavigate, Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import DailyHomeworkStudent from "./DailyHomeworkStudent.jsx";
import DailyHomeworkAdmin from "./DailyHomeworkAdmin.jsx";
import HomeworkForm from "./HomeworkForm.jsx";
import useAction from "./useAction.js";
import { homework, startHomework } from "./api.js";
import { homeworkStatus, formatTime } from "./homework-model.js";
export default function Homework({ admin = false }) {
  const state = useContent(homework),
    action = useAction(),
    navigate = useNavigate(),
    [creating, setCreating] = useState(false),
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
      {admin && <h2>One-time homework</h2>}
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
      {state.loading || state.error ? (
        <ContentState {...state} onRetry={state.reload} />
      ) : !state.data.length ? (
        <section className="card empty-state">
          <h2>No homework assigned</h2>
          <p>
            {admin
              ? "Create a homework assignment when published questions and active students are available."
              : "Your assigned homework will appear here."}
          </p>
        </section>
      ) : admin ? (
        <section className="card learning-panel">
          <div className="table-scroll">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Homework</th>
                  <th>Student</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((row) => (
                  <tr key={row.assignment_id}>
                    <td>{row.title}</td>
                    <td>
                      <Link to={`/admin/students/${row.student_id}`}>
                        {row.display_name || "Student"}
                      </Link>
                    </td>
                    <td>{new Date(row.due_at).toLocaleString()}</td>
                    <td>
                      {row.submitted_at
                        ? "Completed"
                        : row.session_id
                          ? "In Progress"
                          : new Date(row.due_at) < new Date()
                            ? "Overdue"
                            : "Not Started"}
                    </td>
                    <td>{formatTime(row.elapsed_seconds)}</td>
                    <td>
                      {row.session_id ? (
                        <Link
                          className="primary-link"
                          to={`/admin/sessions/${row.session_id}`}
                        >
                          View attempt
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="empty-copy">Latest 200 assignment records.</p>
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
      )}
    </>
  );
}
