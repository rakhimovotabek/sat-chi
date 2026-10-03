import { useState } from "react";
import { supabase, googleSignInAvailable } from "../lib/supabase.js";
export default function GoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      if (!(await googleSignInAvailable())) {
        setError(
          "Google sign-in is not enabled yet. Please use email for now.",
        );
        setBusy(false);
        return;
      }
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL("/auth/callback", window.location.origin).href,
        },
      });
      if (result.error) {
        setError(
          "Google sign-in is unavailable. Use email, or try again later.",
        );
        setBusy(false);
      }
    } catch {
      setError("Could not connect to Google sign-in. Please try again.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button button-secondary google-button"
        disabled={busy || !supabase}
        onClick={start}
      >
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
