import { useEffect, useRef, useState } from "react";
import { heartbeat } from "../learning/api.js";
import useAuth from "../../hooks/useAuth.js";
export default function useStudyTimer(id, position, session, active) {
  const { session: auth } = useAuth();
  const latest = useRef({}),
    pending = useRef(0),
    queue = useRef(Promise.resolve()),
    [elapsed, setElapsed] = useState(0),
    [warning, setWarning] = useState(""),
    [now, setNow] = useState(Date.now());
  latest.current = { id, position, auth };
  const submitted = Boolean(session?.submitted_at);
  function flush(keepalive = false) {
    const seconds = pending.current;
    pending.current = 0;
    const { id, position, auth } = latest.current;
    if (!id || !auth) return Promise.resolve();
    if (keepalive) {
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/practice_heartbeat`,
        {
          method: "POST",
          keepalive: true,
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${auth.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_session: id,
            p_position: position,
            p_seconds: seconds,
          }),
        },
      ).catch(() => {});
      return Promise.resolve();
    }
    const request = queue.current
      .catch(() => {})
      .then(() => heartbeat(id, position, seconds));
    queue.current = request;
    return request.then(
      () => setWarning(""),
      () => {
        pending.current += seconds;
        setWarning(
          "Study time could not sync. Your answers are saved separately.",
        );
      },
    );
  }
  useEffect(() => {
    if (session) setElapsed(session.elapsed_seconds || 0);
  }, [session?.id, session?.submitted_at]);
  useEffect(() => {
    if (!active || submitted) return;
    let lastActivity = Date.now(),
      ticks = 0;
    const activity = () => {
      lastActivity = Date.now();
    };
    const hide = () => flush(true);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        Date.now() - lastActivity < 120000
      ) {
        pending.current++;
        setElapsed((t) => t + 1);
      }
      if (++ticks % 15 === 0) flush();
    }, 1000);
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.addEventListener(event, activity, { passive: true });
    window.addEventListener("pagehide", hide);
    return () => {
      clearInterval(timer);
      if (pending.current > 0) flush(true);
      window.removeEventListener("pagehide", hide);
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
        window.removeEventListener(event, activity);
    };
  }, [id, active, submitted]);
  useEffect(() => {
    if (active && !submitted) flush();
  }, [id, position, active, submitted]);
  return { elapsed, warning, flush, now };
}
