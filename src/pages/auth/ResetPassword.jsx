import { useEffect, useState } from "react";
import { Link } from "react-router";
import AuthFrame from "../../components/AuthFrame.jsx";
import { supabase } from "../../lib/supabase.js";
import {
  clearRecovery,
  passwordError,
  recoveryCallback,
  restoreRecovery,
} from "../../auth/password-recovery.js";
import usePageTitle from "../../hooks/usePageTitle.js";

export default function ResetPassword() {
  const [callback] = useState(() => recoveryCallback(window.location));
  const [status, setStatus] = useState("checking"),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  usePageTitle("Reset password");
  useEffect(() => {
    let live = true;
    // Remove one-use codes/provider details before rendering or navigation.
    window.history.replaceState(window.history.state, "", "/reset-password");
    restoreRecovery(supabase, callback, window.sessionStorage)
      .then(() => {
        if (live) setStatus("ready");
      })
      .catch(() => {
        if (live) setStatus("invalid");
      });
    return () => {
      live = false;
    };
  }, [callback]);
  async function submit(event) {
    event.preventDefault();
    const validation = passwordError(password, confirmation);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await restoreRecovery(supabase, {}, window.sessionStorage);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(
          error.code === "weak_password"
            ? "Choose a stronger password with a mix of letters, numbers and symbols."
            : "Could not update the password. Request a new recovery link if this session expired.",
        );
        return;
      }
      clearRecovery(window.sessionStorage);
      setPassword("");
      setConfirmation("");
      await supabase.auth.signOut({ scope: "local" });
      setStatus("done");
    } catch {
      setStatus("invalid");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      protectedForm
      title="Choose a new password"
      description="Your password is updated securely through Supabase Auth."
    >
      {status === "checking" && <p role="status">Checking recovery link…</p>}
      {status === "invalid" && (
        <p className="form-error" role="alert">
          This recovery link is invalid, expired, or was opened in another
          browser.{" "}
          <Link to="/forgot-password">Request a new recovery email</Link>.
        </p>
      )}
      {status === "done" && (
        <p className="form-notice" role="status">
          Password updated.{" "}
          <Link to="/login">Sign in with your new password</Link>.
        </p>
      )}
      {status === "ready" && (
        <form className="auth-form" onSubmit={submit}>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={200}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={200}
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <p className="empty-copy">Use at least 10 characters.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
