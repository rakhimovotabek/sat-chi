import { Link } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { supabase } from "../../lib/supabase.js";
import { checked, homework } from "./api.js";
export default function DashboardWork() {
  const { session } = useAuth(),
    state = useContent(
      async () => ({
        homework: await homework(),
        sessions: await checked(
          supabase
            .from("book_practice_sessions")
            .select("id,title,kind,started_at,current_position")
            .eq("student_id", session.user.id)
            .is("submitted_at", null)
            .order("started_at", { ascending: false })
            .limit(10),
        ),
      }),
      [session.user.id],
    );
  const today =
    state.data?.homework.filter(
      (h) =>
        !h.submitted_at &&
        new Date(h.due_at).toDateString() === new Date().toDateString(),
    ) || [];
  return (
    <>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
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
      )}
    </>
  );
}
