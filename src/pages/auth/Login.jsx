import { useState } from "react";
import { Link } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import usePageTitle from "../../hooks/usePageTitle.js";
import { supabase } from "../../lib/supabase.js";
import AuthFrame from "../../components/AuthFrame.jsx";
import GoogleSignIn from "../../components/GoogleSignIn.jsx";
export default function Login() {
  const { signIn, error: authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  usePageTitle("Sign in");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn(email, password);
      if (result.error)
        setError(
          result.error.code === "email_not_confirmed"
            ? "Confirm your email before signing in. Check your inbox."
            : "Unable to sign in. Check your email and password and try again.",
        );
    } catch {
      setError("Could not reach the sign-in service. Check your connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Welcome back."
      description="Sign in and keep moving toward your SAT goal."
    >
      {!supabase && (
        <p className="form-notice">
          Sign-in is not configured yet. Contact the administrator.
        </p>
      )}
      {(error || authError) && (
        <p role="alert" className="form-error">
          {error || authError}
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="button" disabled={busy || !supabase}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <div className="auth-divider">or</div>
      <GoogleSignIn />
      <p className="auth-footnote">
        New to SAT’chi? <Link to="/signup">Sign Up</Link>
      </p>
    </AuthFrame>
  );
}
