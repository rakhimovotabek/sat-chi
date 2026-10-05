import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import QuestionImage from "../../components/QuestionImage.jsx";
import Icon from "../../components/Icon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import BookSelect from "../books/BookSelect.jsx";
import useAuth from "../../hooks/useAuth.js";
import { DOMAINS } from "./Filters.jsx";
import { toggleDomain, toggleSkill } from "./bank-selection.js";
import useAction from "./useAction.js";
import { bank, bankFacets, startBank } from "./api.js";
function readConfiguration(key) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key));
    return v && typeof v.filters === "object" && v.filters !== null ? v : {};
  } catch {
    return {};
  }
}
export default function QuestionBank({ admin = false }) {
  const { profile } = useAuth(),
    key = `satchi.bank.${profile.id}`;
  const [saved] = useState(() => readConfiguration(key));
  const [filters, setFilters] = useState({
      ...saved.filters,
      section: saved.filters?.section || "Math",
    }),
    [page, setPage] = useState(0),
    [expanded, setExpanded] = useState([]),
    [count, setCount] = useState(saved.count || "20"),
    [timed, setTimed] = useState(saved.timed === true);
  const navigate = useNavigate(),
    action = useAction();
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ filters, count, timed }));
    } catch {
      /* Browser storage can be unavailable. */
    }
  }, [key, filters, count, timed]);
  const change = (next) => {
    setPage(0);
    setFilters(next);
  };
  const field = (name, value) => change({ ...filters, [name]: value });
  const state = useContent(
    () => bank(filters, page),
    [JSON.stringify(filters), page],
  );
  const facetFilters = { ...filters };
  delete facetFilters.domains;
  delete facetFilters.skills;
  const facets = useContent(
    () => bankFacets(facetFilters),
    [JSON.stringify(facetFilters)],
  );
  const rows = facets.data || [];
  const standards = filters.section
    ? DOMAINS[filters.section] || []
    : Object.values(DOMAINS).flat();
  const domains = [...new Set([...standards, ...rows.map((r) => r.domain)])];
  const matching = state.data?.count ?? 0;
  return (
    <>
      <PageHeader
        title="Question Bank"
        description="Choose what to work on. Build a session around your goals."
      />
      <section className="bank-workspace" aria-label="Practice configuration">
        <div className="bank-columns">
          <section className="bank-domains" aria-label="Domain selection">
            <div className="bank-section-heading">
              <h2>Select domains</h2>
              <span
                className="count-badge"
                aria-label="Matching question count"
                aria-busy={state.loading}
              >
                {state.loading ? "…" : matching}
              </span>
            </div>
            <div
              className="segmented-control"
              role="group"
              aria-label="Section"
            >
              {[
                ["Reading & Writing", "Reading & Writing"],
                ["Math", "Math"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={(filters.section || "") === value}
                  onClick={() =>
                    change({
                      ...filters,
                      section: value,
                      domains: [],
                      skills: [],
                      domain: "",
                      skill: "",
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="bank-hint">
              Choose domains or expand them to select individual skills.
            </p>
            <label className="bank-all">
              <input
                type="checkbox"
                checked={!(filters.domains?.length || filters.skills?.length)}
                onChange={() => change({ ...filters, domains: [], skills: [] })}
              />
              Entire {filters.section || "question bank"}
            </label>
            <div aria-busy={facets.loading}>
              {domains.map((domain, index) => {
                const items = rows.filter((r) => r.domain === domain);
                const total = items.reduce((n, r) => n + r.count, 0);
                const skills = [
                  ...new Set(items.map((r) => r.skill).filter(Boolean)),
                ];
                const whole = (filters.domains || []).includes(domain);
                const partial = (filters.skills || []).some(
                  (s) => s.domain === domain,
                );
                const open = expanded.includes(domain),
                  id = `bank-skills-${index}`;
                return (
                  <div
                    key={domain}
                    className={`bank-domain ${whole || partial ? "is-selected" : ""}`}
                  >
                    <div className="bank-domain-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={whole}
                          ref={(el) => {
                            if (el) el.indeterminate = !whole && partial;
                          }}
                          onChange={() => change(toggleDomain(filters, domain))}
                        />
                        <span>{domain || "Unclassified domain"}</span>
                        <span className="bank-count">
                          {facets.loading ? "…" : total}
                        </span>
                      </label>
                      <button
                        className="bank-disclosure"
                        aria-label={`${open ? "Collapse" : "Expand"} ${domain || "unclassified domain"} skills`}
                        aria-expanded={open}
                        aria-controls={id}
                        onClick={() =>
                          setExpanded((v) =>
                            open
                              ? v.filter((d) => d !== domain)
                              : [...v, domain],
                          )
                        }
                      >
                        <Icon name="chevron" />
                      </button>
                    </div>
                    <div id={id} hidden={!open} className="bank-skills">
                      {skills.length ? (
                        skills.map((skill) => (
                          <label key={skill} className="bank-skill">
                            <input
                              type="checkbox"
                              checked={
                                whole ||
                                (filters.skills || []).some(
                                  (s) =>
                                    s.domain === domain && s.skill === skill,
                                )
                              }
                              onChange={() =>
                                change(
                                  toggleSkill(filters, domain, skill, skills),
                                )
                              }
                            />
                            <span>{skill}</span>
                            <span className="bank-count">
                              {facets.loading
                                ? "…"
                                : items
                                    .filter((s) => s.skill === skill)
                                    .reduce((n, s) => n + s.count, 0)}
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="bank-hint">
                          {facets.loading
                            ? "Loading skills…"
                            : "No classified skills match these filters."}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {facets.error && (
              <ContentState {...facets} onRetry={facets.reload} />
            )}
          </section>
          <section className="bank-advanced" aria-label="Advanced filters">
            <div className="bank-section-heading">
              <h2>Advanced filters</h2>
              <button
                className="quiet-button"
                onClick={() => change({ section: filters.section })}
              >
                Reset filters
              </button>
            </div>
            <label>
              Difficulty
              <select
                aria-label="Difficulty"
                value={filters.difficulty || ""}
                onChange={(e) => field("difficulty", e.target.value)}
              >
                <option value="">Any difficulty</option>
                {["easy", "medium", "hard", "unclassified"].map((v) => (
                  <option value={v} key={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <BookSelect
              label="Book / source"
              emptyLabel="All books"
              value={filters.book}
              onChange={(book) => change({ ...filters, book, topic: "" })}
            />
            <label>
              Previous practice
              <select
                aria-label="Previous practice"
                value={filters.status || ""}
                onChange={(e) => field("status", e.target.value)}
              >
                <option value="">All questions</option>
                <option value="unanswered">Unanswered</option>
                <option value="correct">Previously correct</option>
                <option value="incorrect">Previously incorrect</option>
              </select>
            </label>
            <label>
              Marked for review
              <select
                aria-label="Marked for review"
                value={filters.marked || ""}
                onChange={(e) => field("marked", e.target.value)}
              >
                <option value="">All</option>
                <option value="yes">Marked</option>
                <option value="no">Not marked</option>
              </select>
            </label>
            <p className="bank-hint">
              History and review marks come from your own practice. Domain
              counts follow these filters.
            </p>
          </section>
        </div>
        <footer className="bank-action-bar">
          <div className="bank-volume">
            <span>Volume</span>
            <div
              className="segmented-control"
              role="group"
              aria-label="Question count"
            >
              {[10, 20, 30, 40, 50, "all"].map((n) => (
                <button
                  key={n}
                  aria-label={n === "all" ? "All questions" : `${n} questions`}
                  aria-pressed={String(count) === String(n)}
                  onClick={() => setCount(String(n))}
                >
                  {n === "all" ? "All" : n}
                </button>
              ))}
            </div>
          </div>
          <div className="bank-volume">
            <span>Mode</span>
            <div className="segmented-control" role="group" aria-label="Mode">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  aria-pressed={timed === v}
                  onClick={() => setTimed(v)}
                >
                  {v ? "Timed" : "Untimed"}
                </button>
              ))}
            </div>
          </div>
          <div className="bank-start">
            <h2 aria-live="polite">
              {state.loading
                ? "Updating matches…"
                : `${matching} questions match`}
            </h2>
            {count === "all" && matching > 500 && (
              <small>500 questions per session</small>
            )}
            <button
              className="button"
              disabled={
                action.busy || state.loading || !!state.error || !matching
              }
              onClick={() =>
                action.run(async () =>
                  navigate(
                    `${admin ? "/admin" : ""}/practice/${await startBank(filters, Math.min(matching, count === "all" ? 500 : Number(count)), timed)}`,
                  ),
                )
              }
            >
              Start Practice Session
            </button>
          </div>
        </footer>
      </section>
      {state.error && <ContentState {...state} onRetry={state.reload} />}
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
      <section className="bank-preview" aria-busy={state.loading}>
        <div className="bank-section-heading">
          <h2>Matching questions</h2>
          <span className="bank-hint">Preview · answers stay hidden</span>
        </div>
        {!state.loading && !state.error && !matching && (
          <div className="empty-state">
            <h3>No matching questions</h3>
            <p>Try broader filters or clear your domain selection.</p>
          </div>
        )}
        {!!matching && (
          <>
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
                  {state.data?.rows.map((q) => (
                    <tr key={q.id}>
                      <td className="bank-question-preview">
                        {q.question_text}
                        {!q.question_text?.trim() && q.image_url && (
                          <QuestionImage src={q.image_url} allowZoom={false} />
                        )}
                      </td>
                      <td>
                        {q.domain}
                        <small>{q.skill}</small>
                      </td>
                      <td>
                        {q.book_title}
                        <small>{q.topic_title}</small>
                      </td>
                      <td>{q.difficulty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Page {page + 1} · {matching} questions
              </span>
              <div className="button-row">
                <button
                  className="button button-secondary"
                  disabled={!page || state.loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous page
                </button>
                <button
                  className="button button-secondary"
                  disabled={state.loading || (page + 1) * 25 >= matching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next page
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {admin && (
        <Link className="primary-link" to="/admin/questions">
          Manage questions
        </Link>
      )}
    </>
  );
}
