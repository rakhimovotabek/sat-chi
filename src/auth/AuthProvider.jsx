import { useEffect, useState } from "react";
import { AuthContext } from "./AuthContext.js";
import { supabase } from "../lib/supabase.js";

const initialState = {
  session: null,
  profile: null,
  loading: Boolean(supabase),
  error: null,
};

export default function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!supabase) return undefined;
    let live = true;
    let sequence = 0;
    const timers = new Set();

    const queueSession = (session) => {
      const request = ++sequence;
      if (!live) return;
      setState({
        session,
        profile: null,
        loading: Boolean(session),
        error: null,
      });
      if (!session) return;
      // Do not await Supabase calls inside onAuthStateChange: its auth lock is held.
      const timer = setTimeout(async () => {
        timers.delete(timer);
        if (!live || sequence !== request) return;
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          if (!live || sequence !== request) return;
          let message = null;
          if (error)
            message =
              "Could not load your account. Check your connection and try again.";
          else if (!data)
            message =
              "Your account profile is missing. Contact your administrator.";
          else if (!["admin", "student"].includes(data.role))
            message =
              "Your account role is not supported. Contact your administrator.";
          else if (!data.active)
            message = "Your account is inactive. Contact your administrator.";
          setState({
            session,
            profile: message ? null : data,
            loading: false,
            error: message,
          });
        } catch {
          if (live && sequence === request) {
            setState({
              session,
              profile: null,
              loading: false,
              error: "Could not load your account. Try again.",
            });
          }
        }
      }, 0);
      timers.add(timer);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      queueSession(session),
    );
    const initialSequence = sequence;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!live || sequence !== initialSequence) return;
        if (error)
          setState({
            session: null,
            profile: null,
            loading: false,
            error: "Could not restore your session. Please sign in again.",
          });
        else queueSession(data.session);
      })
      .catch(() => {
        if (live && sequence === initialSequence)
          setState({
            session: null,
            profile: null,
            loading: false,
            error: "Could not restore your session.",
          });
      });
    return () => {
      live = false;
      sequence++;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: "Supabase is not configured." } };
    return supabase.auth.signInWithPassword({ email: email.trim(), password });
  };

  const signOut = async () => {
    if (!supabase) return null;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return error;
  };

  const refreshProfile = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", state.session.user.id)
      .single();
    if (error)
      throw new Error("Could not refresh your profile. Please reload.");
    setState((previous) => ({ ...previous, profile: data }));
  };
  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
