import { useState } from "react";
import { Link, useNavigate } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";
import { rpc } from "./api.js";
import VocabularyStudy from "./VocabularyStudy.jsx";
export default function Mistakes() {
  const [tab, setTab] = useState("questions"),
    [draft, setDraft] = useState({}),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(0),
    state = useContent(
      () => rpc("question_mistakes", { p_filters: filters, p_page: page }),
      [filters, page],
    ),
    action = useAction(),
    navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Review Mistakes"
        eyebrow="Turn missed answers into progress"
        description="Revisit your own submitted SAT questions and the vocabulary that needs another recall."
      />
      <div className="learning-tabs">
        <button
          className={`button ${tab === "questions" ? "" : "button-secondary"}`}
          onClick={() => setTab("questions")}
        >
          Questions
        </button>
        <button
          className={`button ${tab === "vocabulary" ? "" : "button-secondary"}`}
          onClick={() => setTab("vocabulary")}
        >
          Vocabulary
        </button>
      </div>
      {tab === "vocabulary" ? (
        <VocabularyStudy embedded filterOverride="weak" />
      ) : (
        <>
          <form
            className="vocabulary-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
              setPage(0);
            }}
          >
            {[
              ["domain", "Domain"],
              ["skill", "Skill"],
              ["source", "Book / source"],
              ["since", "From date"],
              ["until", "Through date"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type={["since", "until"].includes(key) ? "date" : "text"}
                  value={draft[key] || ""}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button className="button button-secondary">Apply filters</button>
          </form>
          <ContentState {...state} onRetry={state.reload} />
          {action.error && (
            <p className="form-error" role="alert">
              {action.error}
            </p>
          )}
          {state.data && (
            <>
              <p>{state.data.total} distinct questions answered incorrectly</p>
              <div className="item-list">
                {state.data.items.map((i) => (
                  <article className="card learning-panel" key={i.item_id}>
                    <div className="section-heading">
                      <small>
                        {i.question.section || "SAT question"} ·{" "}
                        {i.question.domain || "Unclassified"} ·{" "}
                        {new Date(i.submitted_at).toLocaleDateString()}
                      </small>
                      <span className="subtle-badge">
                        {i.question.source || "Practice"}
                      </span>
                    </div>
                    <p className="reading-text">{i.question.question_text}</p>
                    <small>{i.question.skill || ""}</small>
                    <div className="button-row">
                      <button
                        className="button button-secondary"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(async () =>
                            navigate(
                              `/practice/${await rpc("practice_mistake", { p_item: i.item_id })}`,
                            ),
                          )
                        }
                      >
                        Practice Again
                      </button>
                      <Link
                        className="primary-link"
                        to={`/practice/${i.session_id}`}
                      >
                        Review original attempt →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              {!state.data.total && (
                <section className="card empty-state">
                  <h2>No question mistakes match</h2>
                  <p>
                    Submitted incorrect answers appear here. Try different
                    filters or start a new practice session.
                  </p>
                  <Link className="button button-secondary" to="/question-bank">
                    Question Bank
                  </Link>
                </section>
              )}
              <div className="button-row">
                <button
                  className="button button-secondary"
                  disabled={!page}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="button button-secondary"
                  disabled={(page + 1) * 25 >= state.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
