import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import usePageTitle from "../../hooks/usePageTitle.js";
import AuthFrame from "../../components/AuthFrame.jsx";
import ProfileFields from "../../auth/ProfileFields.jsx";
import { profileValues, needsOnboarding } from "../../auth/profile-fields.js";
import { saveLearningProfile } from "../../lib/onboarding.js";
export default function Onboarding({ editing = false }) {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  usePageTitle(editing ? "Profile" : "Welcome to SAT’chi");
  const [values, setValues] = useState(() =>
    profileValues(profile, session.user.user_metadata),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await saveLearningProfile(values);
      await refreshProfile();
      setSaved(true);
      if (!editing) navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!editing && !needsOnboarding(profile))
    return <Navigate to="/dashboard" replace />;
  const form = (
    <>
      <form className="auth-form" onSubmit={submit}>
        <ProfileFields
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
        {saved && editing && (
          <p className="form-notice" role="status">
            Your learning profile has been saved.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save profile" : "Start learning"}
        </button>
      </form>
      {!editing && (
        <button
          className="button button-secondary"
          onClick={async () => {
            try {
              if (await signOut())
                setError("Could not log out. Please try again.");
            } catch {
              setError("Could not log out. Please try again.");
            }
          }}
        >
          Log out
        </button>
      )}
    </>
  );
  return editing ? (
    <section className="management-panel">
      <h1>Your learning profile</h1>
      {form}
    </section>
  ) : (
    <AuthFrame
      protectedForm
      wide
      title="Let's shape your SAT journey."
      description="Tell us where you're starting and where you want to go."
    >
      {form}
    </AuthFrame>
  );
}
