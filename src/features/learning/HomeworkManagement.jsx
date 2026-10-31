import { useState } from "react";
import { Link } from "react-router";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import HomeworkActions from "./HomeworkActions.jsx";

export default function HomeworkManagement({ onEdit, revision, onChanged }) {
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(null);
  const state = useContent(
    () =>
      rpc("homework_management_directory", { p_page: page, p_search: search }),
    [page, search, revision],
  );
  return (
    <section
      className="card learning-panel"
      aria-label="One-time homework management"
    >
      <div className="section-heading">
        <h2>One-time homework</h2>
        <span>{state.data?.total ?? "…"} assignments</span>
      </div>
      <label className="learning-field">
        Search assignments
        <input
          type="search"
          value={search}
          maxLength={160}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <ContentState {...state} onRetry={state.reload} />
      {notice && (
        <p role="status">
          {notice.mode === "retained"
            ? "Homework deleted. Saved student answers and grades are retained."
            : "Unused homework permanently deleted."}
          {notice.mode === "retained" && (
            <>
              {" "}
              <Link to={`/admin/homework/${notice.id}`}>
                View retained history
              </Link>
            </>
          )}
        </p>
      )}
      {state.data && (
        <>
          {state.data.rows.length ? (
            <div className="table-scroll">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Homework</th>
                    <th>Assigned</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Submissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.assigned} students</td>
                      <td>{new Date(row.due_at).toLocaleString()}</td>
                      <td>{row.state}</td>
                      <td>{row.submissions}</td>
                      <td>
                        <Link
                          className="primary-link"
                          to={`/admin/homework/${row.id}`}
                        >
                          View results
                        </Link>
                        <HomeworkActions
                          assignment={row}
                          onEdit={() => onEdit(row.id)}
                          onChanged={() => {
                            state.reload();
                            onChanged();
                          }}
                          onDeleted={(result) => {
                            setNotice(result);
                            state.reload();
                            onChanged();
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-copy">
              {search
                ? "No assignments match this search."
                : "No one-time homework. Create an assignment to get started."}
            </p>
          )}
          {state.data.total > 25 && (
            <div className="button-row">
              <button
                className="button button-secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous assignments
              </button>
              <span>
                Page {page + 1} of {Math.ceil(state.data.total / 25)}
              </span>
              <button
                className="button button-secondary"
                disabled={(page + 1) * 25 >= state.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next assignments
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
