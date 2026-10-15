import { useState } from "react";
import { Link } from "react-router";
import AuthFrame from "../../components/AuthFrame.jsx";
import { supabase } from "../../lib/supabase.js";
import usePageTitle from "../../hooks/usePageTitle.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  usePageTitle("Recover password");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: new URL("/reset-password", window.location.origin).href },
      );
      // Auth/account-specific errors must not identify whether an address exists.
      if (error && !error.status)
        throw new Error("Recovery service unavailable");
      setSent(true);
    } catch {
      setError(
        "Could not reach the email recovery service. Try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      protectedForm
      title="Forgot password?"
      description="Request a secure link to choose a new password."
    >
      {sent ? (
        <p className="form-notice" role="status">
          If an account exists for that address, a recovery email will arrive
          shortly. Check your inbox and spam folder, and open the link in this
          browser.
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy || !supabase}>
            {busy ? "Sending…" : "Send recovery email"}
          </button>
        </form>
      )}
      <p className="auth-footnote">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthFrame>
  );
}
