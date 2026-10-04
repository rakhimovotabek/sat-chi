import { Link } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { supabase } from "../../lib/supabase.js";
import { checked, homework, rpc } from "./api.js";
import { satDateLabel, satCountdown } from "../../data/sat-dates.js";
export default function DashboardWork() {
  const { session, profile } = useAuth(),
    state = useContent(async () => {
      const [assignments, sessions, plan] = await Promise.all([
        homework(),
        checked(
          supabase
            .from("book_practice_sessions")
            .select("id,title,kind,started_at,current_position")
            .eq("student_id", session.user.id)
            .is("submitted_at", null)
            .order("started_at", { ascending: false })
            .limit(10),
        ),
        rpc("refresh_study_plan"),
      ]);
      return { homework: assignments, sessions, plan };
    }, [session.user.id]);
  const today =
    state.data?.homework.filter(
      (h) =>
        !h.submitted_at &&
        new Date(h.due_at).toDateString() === new Date().toDateString(),
    ) || [];
  return (
    <>
      {profile.target_test_date && (
        <p className="sat-countdown">
          SAT · {satDateLabel(profile.target_test_date)}{" "}
          <strong>
            {satCountdown(profile.target_test_date)} days remaining
          </strong>
        </p>
      )}
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <section className="card learning-panel">
            <h2>Your reminders</h2>
            <div className="button-row">
              <Link className="primary-link" to="/homework">
                Homework: {today.length} due today
              </Link>
              <Link className="primary-link" to="/study-plan">
                {state.data.plan.preferences
                  ? `Study Plan: ${state.data.plan.tasks.filter((t) => t.study_date === state.data.plan.today && !t.completed_at).length} tasks today`
                  : "Set up your Study Plan"}
              </Link>
              <Link className="primary-link" to="/mistakes">
                Review Mistakes
              </Link>
            </div>
          </section>
          <div className="learning-columns">
            <section className="card learning-panel">
              <div className="section-heading">
                <h2>Today's homework</h2>
                <Link className="primary-link" to="/homework">
                  View all
                </Link>
              </div>
              {today.length ? (
                <div className="item-list">
                  {today.slice(0, 5).map((h) => (
                    <Link
                      className="list-button"
                      to="/homework"
                      key={h.assignment_id}
                    >
                      <strong>{h.title}</strong>
                      <small>
                        Due{" "}
                        {new Date(h.due_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">No unfinished homework due today.</p>
              )}
            </section>
            <section className="card learning-panel">
              <h2>Continue practice</h2>
              {state.data.sessions?.length ? (
                <div className="item-list">
                  {state.data.sessions.map((s) => (
                    <Link
                      className="list-button"
                      key={s.id}
                      to={`/practice/${s.id}`}
                    >
                      <strong>{s.title}</strong>
                      <small>
                        {s.kind} · Resume at question{" "}
                        {(s.current_position || 0) + 1}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">
                  Your unfinished practice sessions will appear here.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
