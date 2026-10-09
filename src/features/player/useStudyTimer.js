import { useEffect, useMemo, useState } from "react";
import { heartbeat } from "../learning/api.js";
import { CLIENT_VERSION } from "../../lib/client-version.js";
import { createStudyTimeQueue } from "./study-time-batch.js";
import useAuth from "../../hooks/useAuth.js";
export default function useStudyTimer(id, position, session, active) {
  const { session: auth } = useAuth();
  const { latest, pending, enqueue } = useMemo(() => {
    const pending = { current: new Map() };
    return {
      latest: { current: {} },
      pending,
      enqueue: createStudyTimeQueue(pending.current),
    };
  }, [id, auth?.user?.id]);
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
    const send = async () => {
      try {
        await enqueue(position, async (p, seconds) => {
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
                  "x-satchi-client-version": CLIENT_VERSION,
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
        });
      } catch {
        setWarning("Study time could not sync. Retry before leaving.");
        throw new Error("Study time could not sync. Retry before leaving.");
      }
      setWarning("");
    };
    return send();
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
  }, [id, latest, pending]);
  useEffect(() => {
    if (active && !session?.submitted_at) flush().catch(() => {});
  }, [id, position, active, session?.submitted_at]);
  return { elapsed, warning, flush, now };
}
