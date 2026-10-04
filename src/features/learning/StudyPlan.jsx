import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { supabase } from "../../lib/supabase.js";
import useAuth from "../../hooks/useAuth.js";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";
import { rpc, checked } from "./api.js";
import { planDays } from "./study-plan-model.js";
import SatDateSelect from "../../components/SatDateSelect.jsx";
import { satDateLabel, satCountdown } from "../../data/sat-dates.js";
export default function StudyPlan() {
  const [params] = useSearchParams();
  const options = useContent(() =>
    checked(
      supabase
        .from("vocabulary_sets")
        .select("id,title,vocabulary_books(title)")
        .order("book_id")
        .order("position")
        .limit(100),
    ),
  );
  const [selectedSets, setSelectedSets] = useState(
    (params.get("sets") || "").split(",").filter(Boolean),
  );
  const { profile, refreshProfile } = useAuth(),
    state = useContent(() => rpc("refresh_study_plan")),
    action = useAction(),
    navigate = useNavigate(),
    [editing, setEditing] = useState(!!params.get("sets")),
    [days, setDays] = useState([1, 2, 3, 4, 5]);
  const pref = state.data?.preferences,
    today = state.data?.today,
    groups = planDays(state.data?.tasks || [], today);
  async function start(task) {
    await action.run(async () => {
      const result = await rpc("start_study_task", { p_task: task.id });
      if (result.completed) {
        state.reload();
        return;
      }
      if (result.session_id) navigate(`/practice/${result.session_id}`);
      else navigate(`/vocabulary/study?task=${task.id}&mode=${result.mode}`);
    });
  }
  return (
    <>
      <PageHeader
        title="Study Plan"
        eyebrow="Your next useful step"
        description="A practical plan from homework, recent performance, question mistakes and vocabulary reviews."
      />
      <div className="button-row">
        <button
          className="button button-secondary"
          onClick={() => {
            setDays(pref?.preferred_days || [1, 2, 3, 4, 5]);
            setSelectedSets(pref?.vocabulary_sets || []);
            setEditing((v) => !v);
          }}
        >
          Study preferences
        </button>
        <button
          className="button button-secondary"
          onClick={state.reload}
          disabled={state.loading}
        >
          Refresh progress
        </button>
        <Link className="primary-link" to="/mistakes">
          Review mistakes →
        </Link>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
      {state.data && (!pref || editing) && (
        <section className="card learning-panel">
          <h2>Make a plan that fits your week</h2>
          <form
            className="learning-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              action.run(async () => {
                await rpc("save_study_preferences", {
                  p_minutes: Number(data.get("minutes")),
                  p_days: days,
                  p_timezone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                  p_test_date: data.get("date") || null,
                  p_current: data.get("current")
                    ? Number(data.get("current"))
                    : null,
                  p_target: Number(data.get("target")),
                  p_sets: selectedSets,
                });
                await refreshProfile();
                setEditing(false);
                state.reload();
              });
            }}
          >
            <div className="learning-columns">
              <SatDateSelect
                name="date"
                defaultValue={profile.target_test_date || ""}
              />
              <label>
                Current SAT score (optional)
                <input
                  name="current"
                  type="number"
                  min="400"
                  max="1600"
                  step="10"
                  defaultValue={profile.current_sat_score || ""}
                />
              </label>
              <label>
                Target SAT score
                <input
                  name="target"
                  type="number"
                  min="400"
                  max="1600"
                  step="10"
                  required
                  defaultValue={profile.target_sat_score || 1400}
                />
              </label>
              <label>
                Available minutes per study day
                <input
                  name="minutes"
                  type="number"
                  min="10"
                  max="180"
                  step="5"
                  required
                  defaultValue={pref?.minutes_per_day || 45}
                />
              </label>
            </div>
            <fieldset>
              <legend>Preferred days · unchecked days are rest days</legend>
              <div className="button-row">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (label, day) => (
                    <label key={day} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={days.includes(day)}
                        onChange={(e) =>
                          setDays((v) =>
                            e.target.checked
                              ? [...v, day].sort()
                              : v.filter((d) => d !== day),
                          )
                        }
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>
                Vocabulary sets · leave empty for the whole published library
              </legend>
              {options.data?.map((set) => (
                <label className="checkbox-row" key={set.id}>
                  <input
                    type="checkbox"
                    checked={selectedSets.includes(set.id)}
                    onChange={(e) =>
                      setSelectedSets((v) =>
                        e.target.checked
                          ? [...v, set.id]
                          : v.filter((id) => id !== set.id),
                      )
                    }
                  />
                  {set.vocabulary_books?.title
                    ? `${set.vocabulary_books.title} · `
                    : ""}
                  {set.title}
                </label>
              ))}
            </fieldset>
            <button className="button" disabled={action.busy || !days.length}>
              Save study preferences
            </button>
          </form>
        </section>
      )}
      {pref && (
        <>
          <p className="page-description">
            {pref.minutes_per_day} min per study day ·{" "}
            {pref.preferred_days.length} days per week · Goal{" "}
            {profile.target_sat_score}
            {profile.target_test_date
              ? ` · SAT ${satDateLabel(profile.target_test_date)} · ${satCountdown(profile.target_test_date)} days remaining`
              : ""}
            . Missed work is reprioritized within your normal daily limit.
          </p>
          {!groups.some((g) => g.date === today) && (
            <section className="card empty-state">
              <h2>
                {pref.preferred_days.includes(
                  new Date(`${today}T12:00:00`).getDay(),
                )
                  ? "No available tasks today"
                  : "Rest day"}
              </h2>
              <p>
                {pref.preferred_days.includes(
                  new Date(`${today}T12:00:00`).getDay(),
                )
                  ? "Published material and assigned work determine available tasks. Your plan will fill as content becomes available."
                  : "Your next scheduled study day is listed below."}
              </p>
            </section>
          )}
          {groups.map((day) => (
            <section
              key={day.date}
              className={`card learning-panel study-day ${day.date === today ? "study-day-today" : ""}`}
            >
              <div className="section-heading">
                <h2>
                  {day.date === today
                    ? "Today"
                    : new Date(`${day.date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" },
                      )}
                </h2>
                <small>
                  {day.minutes} min · {day.completed}/{day.tasks.length}{" "}
                  completed
                </small>
              </div>
              <div className="item-list">
                {day.tasks.map((task) => (
                  <article className="study-task" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        {task.target_count}{" "}
                        {task.kind.startsWith("vocabulary")
                          ? "words"
                          : "questions"}{" "}
                        · {task.minutes} min
                      </small>
                    </div>
                    {task.completed_at ? (
                      <span className="subtle-badge">Completed</span>
                    ) : day.missed ? (
                      <span className="subtle-badge">Missed</span>
                    ) : (
                      <button
                        className="button button-secondary"
                        disabled={action.busy || day.date !== today}
                        onClick={() => start(task)}
                      >
                        {task.started_at
                          ? "Continue"
                          : task.kind.startsWith("vocabulary")
                            ? "Study"
                            : "Start"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
