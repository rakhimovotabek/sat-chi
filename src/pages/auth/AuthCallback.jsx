import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase.js";
import AuthFrame from "../../components/AuthFrame.jsx";
import usePageTitle from "../../hooks/usePageTitle.js";
const exchanges = new Map();
export default function AuthCallback() {
  const [error, setError] = useState("");
  usePageTitle("Completing sign-in");
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (params.has("error") || !code || !supabase) {
      setError(
        "This sign-in link is invalid or expired. Please sign in again.",
      );
      return;
    }
    if (!exchanges.has(code))
      exchanges.set(code, supabase.auth.exchangeCodeForSession(code));
    const exchange = exchanges.get(code);
    exchange
      .then(({ error }) => {
        if (live && error)
          setError(
            "Could not complete sign-in. Open the link in the browser where you started, or sign in with your email.",
          );
      })
      .catch(() => {
        if (live) setError("Could not connect. Please try signing in again.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <AuthFrame
      title="Completing sign-in"
      description="We're securely checking your session."
    >
      {error ? (
        <p className="form-error" role="alert">
          {error} <Link to="/login">Sign In</Link>
        </p>
      ) : (
        <p className="form-notice" role="status">
          Please wait…
        </p>
      )}
    </AuthFrame>
  );
}
