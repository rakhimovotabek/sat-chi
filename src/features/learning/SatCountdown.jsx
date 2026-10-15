import { useEffect, useState } from "react";
import useAuth from "../../hooks/useAuth.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import { countdownParts } from "./countdown-model.js";

function CountdownDigits({ target }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const parts = countdownParts(target, now);
  if (!parts) return <p>No countdown available.</p>;
  return (
    <div>
      <dl
        className="countdown-digits"
        aria-label="Time until selected SAT date"
      >
        {["days", "hours", "minutes", "seconds"].map((unit) => (
          <div key={unit}>
            <dt>{unit}</dt>
            <dd>{String(parts[unit]).padStart(2, "0")}</dd>
          </div>
        ))}
      </dl>
      {parts.past && (
        <p className="empty-copy">
          Your selected exam date has arrived. Choose your next date when you
          are ready.
        </p>
      )}
    </div>
  );
}

export default function SatCountdown() {
  const state = useContent(() => rpc("exam_countdown_settings"));
  const { refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false),
    [date, setDate] = useState(""),
    [zone, setZone] = useState("UTC"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = () => {
    setDate(state.data?.date || "");
    setZone(
      state.data?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "UTC",
    );
    setEditing(true);
  };
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await rpc("save_exam_countdown", {
        p_date: date || null,
        p_timezone: zone,
      });
      await refreshProfile();
      state.reload({ background: true });
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sat-exam-panel" aria-labelledby="sat-exam-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your next milestone</p>
          <h2 id="sat-exam-title">SAT Exam Countdown</h2>
        </div>
        <button
          className="button button-secondary"
          onClick={open}
          disabled={state.loading}
        >
          {state.data?.date ? "Change exam date" : "Set exam date"}
        </button>
      </div>
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.date ? (
        <>
          <CountdownDigits target={state.data.target} />
          <p className="countdown-convention">
            {state.data.date} · {state.data.timezone}. Countdown to 00:00 at the
            start of that date, not your official exam start time.
          </p>
        </>
      ) : (
        !state.loading && (
          <p className="empty-copy">
            Choose your test date and exam location timezone to start your
            countdown.
          </p>
        )
      )}
      {editing && (
        <form className="countdown-form" onSubmit={save}>
          <label>
            SAT exam date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Exam timezone
            <input
              list="exam-timezones"
              required
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
          <datalist id="exam-timezones">
            {[
              "UTC",
              "Asia/Tashkent",
              "Asia/Samarkand",
              "Asia/Dubai",
              "Europe/London",
              "America/New_York",
              "America/Los_Angeles",
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((z) => (
                <option key={z} value={z} />
              ))}
          </datalist>
          <div className="button-row">
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save exam date"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
