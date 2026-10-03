import { useState } from "react";
import { useNavigate, Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import Filters from "./Filters.jsx";
import useAction from "./useAction.js";
import { bank, startBank } from "./api.js";
export default function QuestionBank({ admin = false }) {
  const [draft, setDraft] = useState({}),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(0),
    [count, setCount] = useState("20"),
    [timed, setTimed] = useState(false);
  const navigate = useNavigate(),
    action = useAction();
  const state = useContent(
    () => bank(filters, page),
    [JSON.stringify(filters), page],
  );
  return (
    <>
      <PageHeader
        eyebrow="Focused SAT practice"
        title="Question Bank"
        description="Build a practice session from the published library. Questions are filtered on the server."
      />
      <form
        className="card learning-panel"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setFilters(draft);
        }}
      >
        <Filters value={draft} onChange={setDraft} />
        <div className="button-row">
          <button className="button">Apply filters</button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setDraft({});
              setFilters({});
              setPage(0);
            }}
          >
            Reset filters
          </button>
        </div>
      </form>
      {state.loading || state.error ? (
        <ContentState {...state} onRetry={state.reload} />
      ) : (
        <>
          <section className="card learning-panel">
            <div className="section-heading">
              <h2>{state.data.count} questions match</h2>
            </div>
            <div className="button-row">
              <label>
                Question count
                <select
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                >
                  {[10, 20, 30, 40, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                  <option value="all">All (up to 500)</option>
                </select>
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
              <button
                className="button"
                disabled={action.busy || !state.data.count}
                onClick={() =>
                  action.run(async () =>
                    navigate(
                      `${admin ? "/admin" : ""}/practice/${await startBank(filters, Math.min(state.data.count, count === "all" ? 500 : Number(count)), timed)}`,
                    ),
                  )
                }
              >
                Start practice
              </button>
            </div>
            {action.error && (
              <p className="form-error" role="alert">
                {action.error}
              </p>
            )}
            <p className="empty-copy">
              The session freezes question order and answer keys. Timed practice
              allows 90 seconds per question.
            </p>
          </section>
          {!state.data.count ? (
            <section className="empty-state card">
              <h2>No matching questions</h2>
              <p>
                Try broader filters or ask your administrator to publish
                learning material.
              </p>
            </section>
          ) : (
            <section className="card learning-panel">
              <div className="table-scroll">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Domain / skill</th>
                      <th>Source</th>
                      <th>Difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.rows.map((q) => (
                      <tr key={q.id}>
                        <td>{q.question_text}</td>
                        <td>
                          {q.domain}
                          <small>{q.skill}</small>
                        </td>
                        <td>
                          {q.book_title}
                          <small>{q.topic_title}</small>
                        </td>
                        <td>
                          <span className="subtle-badge">{q.difficulty}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>
                  Page {page + 1} · {state.data.count} questions
                </span>
                <div className="button-row">
                  <button
                    className="button button-secondary"
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous page
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={(page + 1) * 25 >= state.data.count}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next page
                  </button>
                </div>
              </div>
            </section>
          )}
          {admin && (
            <Link className="button button-secondary" to="/admin/questions">
              Manage questions
            </Link>
          )}
        </>
      )}
    </>
  );
}
