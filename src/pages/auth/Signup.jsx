import { useState } from "react";
import { Link } from "react-router";
import AuthFrame from "../../components/AuthFrame.jsx";
import GoogleSignIn from "../../components/GoogleSignIn.jsx";
import ProfileFields from "../../auth/ProfileFields.jsx";
import {
  profileValues,
  validateProfile,
  profilePayload,
} from "../../auth/profile-fields.js";
import { supabase } from "../../lib/supabase.js";
import usePageTitle from "../../hooks/usePageTitle.js";
export default function Signup() {
  const [values, setValues] = useState(() => profileValues());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  usePageTitle("Create your account");
  async function submit(e) {
    e.preventDefault();
    setError("");
    const invalid = validateProfile(values, false);
    if (invalid || password !== confirm || password.length < 12) {
      setError(
        invalid ||
          (password !== confirm
            ? "Passwords do not match."
            : "Use a password with at least 12 characters."),
      );
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            display_name: values.display_name.trim(),
            onboarding: profilePayload(values),
          },
        },
      });
      if (error)
        setError(
          error.code === "user_already_exists"
            ? "An account already exists for this email. Please sign in."
            : "Could not create your account. Check your details or try signing in if you already have an account.",
        );
      else {
        if (data.user?.identities?.length === 0) {
          setError("This email may already have an account. Try signing in.");
          return;
        }
        setSent(true);
        setPassword("");
        setConfirm("");
      }
    } catch {
      setError(
        "Could not reach registration. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Make your goal a plan."
      description="Create your student account. Your SAT journey, in one place."
      wide
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {sent ? (
        <div className="form-notice" role="status">
          Check your email for a confirmation link, then return to finish
          onboarding. <Link to="/login">Sign in</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <ProfileFields
            values={values}
            onChange={(key, value) =>
              setValues((v) => ({ ...v, [key]: value }))
            }
            showGoal={false}
          />
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="profile-fields">
            <label>
              Password
              <input
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="field-hint">At least 12 characters.</span>
            </label>
            <label>
              Confirm password
              <input
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </div>
          <button className="button" disabled={busy || !supabase}>
            {busy ? "Creating account…" : "Sign Up"}
          </button>
        </form>
      )}
      <div className="auth-divider">or</div>
      <GoogleSignIn />
      <p className="auth-footnote">
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </AuthFrame>
  );
}
