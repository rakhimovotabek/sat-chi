import { useEffect, useRef, useState } from "react";
import { heartbeat } from "../learning/api.js";
import useAuth from "../../hooks/useAuth.js";
export default function useStudyTimer(id, position, session, active) {
  const { session: auth } = useAuth();
  const latest = useRef({}),
    pending = useRef(new Map()),
    queue = useRef(Promise.resolve());
  const [elapsed, setElapsed] = useState(0),
    [warning, setWarning] = useState(""),
    [now, setNow] = useState(Date.now());
  latest.current = {
    id,
    position,
    auth,
    active,
    submitted: Boolean(session?.submitted_at),
  };
  function flush(keepalive = false) {
    const { id, position, auth } = latest.current;
    if (!id || !auth) return Promise.resolve();
    const entries = [...pending.current.entries()];
    pending.current.clear();
    entries.push([position, 0]);
    const send = async () => {
      for (const [p, seconds] of entries) {
        try {
          if (keepalive) {
            await fetch(
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
                  p_position: p,
                  p_seconds: seconds,
                }),
              },
            ).then((r) => {
              if (!r.ok) throw new Error("Sync failed");
            });
          } else await heartbeat(id, p, seconds);
        } catch {
          pending.current.set(p, (pending.current.get(p) || 0) + seconds);
          setWarning("Study time could not sync. Retry before leaving.");
          throw new Error("Study time could not sync. Retry before leaving.");
        }
      }
      setWarning("");
    };
    const request = queue.current.catch(() => {}).then(send);
    queue.current = request;
    return request;
  }
  useEffect(() => {
    if (session) setElapsed(session.elapsed_seconds || 0);
  }, [session?.id, session?.submitted_at]);
  useEffect(() => {
    let lastActivity = Date.now(),
      ticks = 0,
      lastTick = Date.now();
    const activity = () => {
      lastActivity = Date.now();
    };
    const hide = () => {
      lastActivity = 0;
      flush(true).catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") hide();
      else activity();
    };
    const timer = setInterval(() => {
      const time = Date.now(),
        delta = time - lastTick;
      lastTick = time;
      setNow(time);
      const current = latest.current;
      if (
        current.active &&
        !current.submitted &&
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        time - lastActivity < 120000 &&
        delta < 2000
      ) {
        pending.current.set(
          current.position,
          (pending.current.get(current.position) || 0) + 1,
        );
        setElapsed((t) => t + 1);
      }
      if (++ticks % 15 === 0 && !current.submitted) flush().catch(() => {});
    }, 1000);
    for (const event of [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "focus",
    ])
      window.addEventListener(event, activity, { passive: true });
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      if (pending.current.size) flush(true).catch(() => {});
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
      for (const event of [
        "pointerdown",
        "keydown",
        "wheel",
        "touchstart",
        "focus",
      ])
        window.removeEventListener(event, activity);
    };
  }, [id]);
  useEffect(() => {
    if (active && !session?.submitted_at) flush().catch(() => {});
  }, [id, position, active, session?.submitted_at]);
  return { elapsed, warning, flush, now };
}
