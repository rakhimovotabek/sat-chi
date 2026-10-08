import DailyHomeworkAnalytics from "./DailyHomeworkAnalytics.jsx";
import OpenResponseReview from "./OpenResponseReview.jsx";
import PracticeAnalytics from "./PracticeAnalytics.jsx";
import { useState } from "react";
import { Link, useParams } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { metrics, standings, overview, checked, vocabSummary } from "./api.js";
import { supabase } from "../../lib/supabase.js";
import { getPractice } from "../books/api.js";
import { formatTime, sectionResults } from "./homework-model.js";
import { practiceSummary } from "../player/model.js";
import DashboardWork from "./DashboardWork.jsx";
import SectionAccuracy from "./SectionAccuracy.jsx";
import VocabularyStats from "./VocabularyStats.jsx";
function VocabularyOverview() {
  const state = useContent(() => vocabSummary());
  return (
    <>
      <ContentState {...state} onRetry={state.reload} />
      <VocabularyStats data={state.data} />
    </>
  );
}
import { performanceAreas } from "./study-plan-model.js";
const percent = (correct, total) =>
  total ? `${Math.round((correct / total) * 100)}%` : "—";
export function MetricCards({ data }) {
  return (
    <div className="metrics-grid">
      {[
        ["Questions answered", data.attempted],
        ["Accuracy", percent(data.correct, data.attempted)],
        ["Total study time", formatTime(data.study_seconds)],
        [
          "One-time homework completed",
          `${data.homework_completed} / ${data.homework_total}`,
        ],
        ["Vocabulary mastered", data.vocabulary_known],
        ["Current streak", `${data.streak || 0} days`],
        ["Longest streak", `${data.longest_streak || 0} days`],
      ].map(([name, value]) => (
        <article className="card metric-card" key={name}>
          <small>{name}</small>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}
export function Activity({ rows = [] }) {
  return (
    <section className="card learning-panel">
      <h2>Recent activity</h2>
      {rows.length ? (
        <ol className="activity-list">
          {rows.map((a, i) => (
            <li key={a.id || i}>
              <span className="activity-dot" />
              <div>
                <strong>
                  {a.display_name ? `${a.display_name} · ` : ""}
                  {a.title}
                </strong>
                <small>
                  {a.kind} · {new Date(a.created_at).toLocaleString()}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-copy">
          Completed practice and homework will appear here.
        </p>
      )}
    </section>
  );
}
export function StudentDashboard() {
  const { profile } = useAuth(),
    state = useContent(() => metrics());
  return (
    <>
      <PageHeader
        title="Your SAT journey starts here."
        eyebrow="Make progress, every day"
        description={`Welcome back, ${profile.display_name || profile.username || "learner"}. Build your next focused study session.`}
      />
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="welcome-label">Your learning plan</span>
          <h2>
            Purposeful practice.
            <br />
            Visible progress.
          </h2>
          <p>
            {profile.target_sat_score
              ? `Your target: ${profile.target_sat_score}. `
              : ""}
            {state.data?.groups.map((g) => g.name).join(" · ") ||
              "A focused space for your SAT preparation."}
          </p>
          <div className="button-row">
            <Link className="button" to="/homework">
              My homework
            </Link>
            <Link className="button button-secondary" to="/question-bank">
              Start practice
            </Link>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>SAT</span>
          <small>LEARN · PRACTICE · GROW</small>
        </div>
      </section>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <MetricCards data={state.data} />
          <SectionAccuracy data={state.data} />
          <DashboardWork />
          <VocabularyOverview />
          <div className="learning-columns">
            <section className="card learning-panel">
              <h2>Today</h2>
              <p className="big-number">{state.data.today}</p>
              <p>Questions answered in completed practice today</p>
              <Link className="primary-link" to="/progress">
                See your progress →
              </Link>
            </section>
            <Activity rows={state.data.activity} />
          </div>
        </>
      )}
    </>
  );
}
export function Progress() {
  const state = useContent(() => metrics()),
    [group, setGroup] = useState("domain");
  const rows = new Map();
  for (const b of state.data?.breakdowns || []) {
    const key =
      group === "domain"
        ? `${b.section || "Practice"} · ${b.domain || "Unclassified"}`
        : b[group] || "Unclassified";
    const r = rows.get(key) || { label: key, attempted: 0, correct: 0 };
    r.attempted += Number(b.attempted);
    r.correct += Number(b.correct);
    rows.set(key, r);
  }
  return (
    <>
      <PageHeader
        title="Progress"
        eyebrow="Your learning record"
        description="See results from completed practice. Small samples describe your activity rather than predict an SAT score."
      />
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <MetricCards data={state.data} />
          <VocabularyOverview />
          <PracticeAnalytics />
          <div className="button-row">
            <Link className="button button-secondary" to="/mistakes">
              Review Mistakes
            </Link>
            <Link className="primary-link" to="/study-plan">
              Open Study Plan →
            </Link>
          </div>
          <div className="learning-columns">
            {[
              ["Strong Areas", "strong"],
              ["Needs Attention", "attention"],
            ].map(([label, key]) => (
              <section className="card learning-panel" key={key}>
                <h2>{label}</h2>
                {performanceAreas(state.data.attention)[key].length ? (
                  performanceAreas(state.data.attention)[key].map((row) => (
                    <p key={row.section + row.domain}>
                      <strong>{row.domain}</strong> ·{" "}
                      {percent(row.correct, row.attempted)} from {row.attempted}{" "}
                      answers in the last 30 days
                    </p>
                  ))
                ) : (
                  <p className="empty-copy">
                    At least 10 answers in an area are needed before it receives
                    a label.
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="card learning-panel">
            <h2>Recent performance</h2>
            <p>
              {state.data.recent_attempted || 0} SAT questions answered in the
              last 14 days ·{" "}
              {percent(state.data.recent_correct, state.data.recent_attempted)}{" "}
              accuracy
            </p>
          </section>
          <section className="card learning-panel">
            <div className="section-heading">
              <h2>Performance breakdown</h2>
              <label>
                Break down by
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  {["domain", "skill", "difficulty", "source"].map((g) => (
                    <option key={g} value={g}>
                      {g === "source" ? "Book / source" : g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!rows.size ? (
              <p className="empty-copy">
                Complete a practice session to see your results.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Answered</th>
                      <th>Correct</th>
                      <th>Incorrect</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows.values()]
                      .sort(
                        (a, b) =>
                          a.correct / a.attempted - b.correct / b.attempted,
                      )
                      .map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td>{r.attempted}</td>
                          <td>{r.correct}</td>
                          <td>{r.attempted - r.correct}</td>
                          <td>{percent(r.correct, r.attempted)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <Activity rows={state.data.activity} />
        </>
      )}
    </>
  );
}
export function Standings() {
  const [group, setGroup] = useState(true),
    state = useContent(() => standings(group), [group]);
  return (
    <>
      <PageHeader
        title="Standings"
        eyebrow="Learning together"
        description="Ranked by answered questions in completed sessions. Only names and learning totals are shared."
      />
      <div className="learning-tabs">
        <button
          className={`button ${group ? "" : "button-secondary"}`}
          onClick={() => setGroup(true)}
        >
          My Group
        </button>
        <button
          className={`button ${group ? "button-secondary" : ""}`}
          onClick={() => setGroup(false)}
        >
          Everyone
        </button>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.length ? (
        <section className="card learning-panel table-scroll">
          <table className="students-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Questions</th>
                <th>Accuracy</th>
                <th>Homework</th>
                <th>Study time</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.display_name || "Student"}</td>
                  <td>{r.questions}</td>
                  <td>{percent(r.correct, r.questions)}</td>
                  <td>{r.homework}</td>
                  <td>{formatTime(r.study_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="empty-copy">Showing the top 100 active students.</p>
        </section>
      ) : (
        !state.loading &&
        !state.error && (
          <section className="card empty-state">
            <h2>No standings yet</h2>
            <p>
              {group
                ? "Your group standing will appear after you join a class."
                : "Active students will appear here."}
            </p>
          </section>
        )
      )}
    </>
  );
}
export function AdminDashboard({ results = false }) {
  const state = useContent(overview);
  return (
    <>
      <PageHeader
        title={results ? "Results / Analytics" : "Admin Dashboard"}
        eyebrow="Admin Control Panel"
        description="Live student and assignment totals, calculated from actual learning records."
      />
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <div className="metrics-grid">
            {[
              ["Active students", state.data.students],
              ["Groups", state.data.groups],
              ["Assigned homework", state.data.assignments],
              ["Completed homework", state.data.completed],
              ["Questions answered", state.data.questions],
            ].map(([label, n]) => (
              <article className="card metric-card" key={label}>
                <small>{label}</small>
                <strong>{n}</strong>
              </article>
            ))}
          </div>
          <div className="learning-tabs">
            <Link className="button" to="/admin/homework">
              Manage homework
            </Link>
            <Link className="button button-secondary" to="/admin/groups">
              Manage groups
            </Link>
            <Link className="button button-secondary" to="/admin/imports">
              Import status
            </Link>
          </div>
          <Activity rows={state.data.activity} />
        </>
      )}
    </>
  );
}
export function StudentDetail() {
  const { studentId } = useParams(),
    state = useContent(
      async () => ({
        profile: await checked(
          supabase
            .from("profiles")
            .select(
              "id,display_name,username,current_sat_score,target_sat_score,active",
            )
            .eq("id", studentId)
            .eq("role", "student")
            .single(),
        ),
        metrics: await metrics(studentId),
      }),
      [studentId],
    );
  return (
    <>
      <PageHeader
        title={state.data?.profile.display_name || "Student detail"}
        eyebrow="Student monitoring"
        description="Profile, group membership and learning history."
      />
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <section className="card learning-panel">
            <h2>
              {state.data.profile.active
                ? "Active student"
                : "Inactive student"}
            </h2>
            <p>
              Current SAT score:{" "}
              {state.data.profile.current_sat_score || "Not supplied"} · Target:{" "}
              {state.data.profile.target_sat_score || "Not supplied"}
            </p>
            <p>
              Groups:{" "}
              {state.data.metrics.groups.map((g) => g.name).join(", ") ||
                "No groups"}
            </p>
          </section>
          <MetricCards data={state.data.metrics} />
          <PracticeAnalytics student={studentId} />
          <DailyHomeworkAnalytics student={studentId} />
          <Activity rows={state.data.metrics.activity} />
        </>
      )}
    </>
  );
}
export function AdminSession() {
  const { sessionId } = useParams(),
    state = useContent(() => getPractice(sessionId), [sessionId]);
  const result = state.data && practiceSummary(state.data.items);
  return (
    <>
      <PageHeader
        title={state.data?.session.title || "Practice attempt"}
        eyebrow="Student attempt review"
        description="Inspect saved answers and results. Review submitted open responses without changing the student's answer."
      />
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <section className="card learning-panel">
            <h2>
              {state.data.session.submitted_at ? "Completed" : "In Progress"}
            </h2>
            <p>
              {state.data.session.submitted_at
                ? `${result.correct} correct · ${result.incorrect} incorrect · ${result.unanswered} unanswered`
                : `${result.total - result.unanswered} / ${result.total} answered · Awaiting submission`}{" "}
              · {formatTime(state.data.session.elapsed_seconds)} study time
            </p>
            {state.data.session.submitted_at &&
              sectionResults(state.data.items).map((r) => (
                <p key={r.name}>
                  {r.name}: {r.correct}/{r.total}
                </p>
              ))}
          </section>
          <div className="item-list">
            {state.data.items.map((i, n) => (
              <article className="card learning-panel" key={i.id} id={i.id}>
                <h3>Question {n + 1}</h3>
                <p>
                  {formatTime(i.active_seconds || 0)} active time ·{" "}
                  {i.attempts?.length || 0} checks ·{" "}
                  {i.solved_at ? "Solved" : "Unresolved"}
                </p>
                {state.data.session.kind === "bank" && (
                  <p>
                    Time to first attempt:{" "}
                    {i.attempts?.length
                      ? formatTime(i.attempts[0].active_seconds)
                      : "No attempt"}{" "}
                    · Time until solved:{" "}
                    {i.solved_at
                      ? formatTime(
                          i.attempts?.find((a) => a.correct)?.active_seconds ||
                            0,
                        )
                      : "Not solved"}
                  </p>
                )}
                {i.attempts?.map((a) => (
                  <p key={a.id}>
                    Attempt {a.attempt_order} ·{" "}
                    {a.selected_response ??
                      String.fromCharCode(65 + a.selected_answer)}{" "}
                    · {a.correct ? "Correct" : "Incorrect"} ·{" "}
                    {formatTime(a.between_seconds)} since prior check ·{" "}
                    {formatTime(a.active_seconds)} cumulative
                  </p>
                ))}
                <p className="reading-text">{i.question.question_text}</p>
                <p>
                  Student answer:{" "}
                  {i.selected_answer == null
                    ? "Unanswered"
                    : i.question.question_type === "open"
                      ? i.selected_response
                      : i.question.options[i.selected_answer]}
                </p>
                {state.data.review.find((r) => r.item_id === i.id) && (
                  <p className="page-description">
                    {
                      state.data.review.find((r) => r.item_id === i.id)
                        .explanation
                    }
                  </p>
                )}
                {state.data.session.submitted_at &&
                  i.question.question_type === "open" && (
                    <OpenResponseReview
                      sessionId={sessionId}
                      item={i}
                      review={state.data.review.find((r) => r.item_id === i.id)}
                      disabled={state.loading}
                      onSaved={state.reload}
                    />
                  )}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
