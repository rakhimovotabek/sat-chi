import { useState } from "react";
import { Link } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import PageHeader from "../../components/PageHeader.jsx";
import ContentState from "../books/ContentState.jsx";
import useContent from "../books/useContent.js";
import { supabase } from "../../lib/supabase.js";
import {
  readLearningSettings,
  saveLearningSettings,
} from "./learning-settings.js";
import SatDateSelect from "../../components/SatDateSelect.jsx";
function AccountForm({ preferences, admin }) {
  const { profile, session, refreshProfile } = useAuth(),
    [testDate, setTestDate] = useState(profile.target_test_date || ""),
    [name, setName] = useState(profile.display_name || ""),
    [minutes, setMinutes] = useState(preferences?.minutes_per_day || 30),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <section className="card learning-panel">
      <h2>Account</h2>
      <form
        className="learning-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            const { error } = await supabase.rpc("save_account_settings", {
              p_display_name: name,
              p_daily_minutes: admin ? null : Number(minutes),
              p_timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            });
            if (error) throw new Error(error.message);
            if (!admin) {
              const { error: dateError } = await supabase.rpc("save_sat_date", {
                p_date: testDate || null,
              });
              if (dateError)
                throw new Error("Could not update the SAT date. Please retry.");
            }
            await refreshProfile();
            setSaved(true);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            required
            maxLength={120}
          />
        </label>
        <label>
          Email
          <input type="email" value={session.user.email || ""} readOnly />
        </label>
        {!admin && (
          <>
            <SatDateSelect
              value={testDate}
              onChange={(e) => {
                setTestDate(e.target.value);
                setSaved(false);
              }}
            />
            <label>
              Daily study goal (minutes)
              <input
                type="number"
                min="10"
                max="180"
                step="1"
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setSaved(false);
                }}
                required
              />
            </label>
            <p className="empty-copy">
              Sets the time budget for future Study Plan tasks. Completed work
              and today's tasks are preserved.
            </p>
            <Link to="/study-plan">
              Manage SAT goals, study days and rest days
            </Link>
            <Link to="/profile">Edit your student profile</Link>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="form-notice" role="status">
            Account settings saved.
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Saving…" : "Save account settings"}
        </button>
        <p className="empty-copy">
          Use Log out in the account bar to end this session.
        </p>
      </form>
    </section>
  );
}
function LearningPreferences() {
  const { profile } = useAuth(),
    [values, setValues] = useState(() => readLearningSettings(profile.id)),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const change = (k, v) => {
    setValues((s) => ({ ...s, [k]: v }));
    setSaved(false);
  };
  return (
    <section className="card learning-panel">
      <h2>Vocabulary preferences</h2>
      <p>
        Saved for your account on this browser. Applied when you open a new
        vocabulary study session.
      </p>
      <form
        className="learning-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            setValues(saveLearningSettings(profile.id, values));
            setSaved(true);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <label>
          Default vocabulary test size
          <select
            value={values.vocabularyCount}
            onChange={(e) => change("vocabularyCount", Number(e.target.value))}
          >
            {[10, 20, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>
        <label>
          Default vocabulary test type
          <select
            value={values.vocabularyTestType}
            onChange={(e) => change("vocabularyTestType", e.target.value)}
          >
            <option value="mixed">Mixed definitions and word selection</option>
            <option value="meaning">Definitions</option>
            <option value="reverse">Word selection</option>
            <option value="typed">Typed recall</option>
            <option value="source">Supplied context exercises</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={values.shuffleVocabulary}
            onChange={(e) => change("shuffleVocabulary", e.target.checked)}
          />
          Shuffle vocabulary study words
        </label>
        <p className="empty-copy">
          You can change the order, size and type within each session.
        </p>
        {saved && (
          <p className="form-notice" role="status">
            Vocabulary preferences saved.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary">
          Save vocabulary preferences
        </button>
      </form>
    </section>
  );
}
export default function Settings() {
  const { profile } = useAuth(),
    admin = profile.role === "admin",
    state = useContent(async () => {
      if (admin) return null;
      const { data, error } = await supabase
        .from("study_preferences")
        .select("minutes_per_day")
        .eq("student_id", profile.id)
        .maybeSingle();
      if (error) throw new Error("Could not load your saved study goal.");
      return data;
    }, [profile.id, admin]);
  return (
    <>
      <PageHeader
        title="Settings"
        eyebrow="Your account"
        description="Manage your account and useful learning preferences."
      />
      <ContentState {...state} onRetry={state.reload} />
      {!state.loading && !state.error && (
        <>
          <AccountForm preferences={state.data} admin={admin} />
          {!admin ? (
            <LearningPreferences />
          ) : (
            <section className="card learning-panel">
              <h2>Content administration</h2>
              <Link
                className="button button-secondary"
                to="/admin/content-review"
              >
                Open Content Review
              </Link>
            </section>
          )}
        </>
      )}
    </>
  );
}
