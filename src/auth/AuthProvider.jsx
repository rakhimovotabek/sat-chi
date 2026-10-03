import { useEffect, useRef, useState } from "react";
import { createAuthLifecycle } from "./auth-lifecycle.js";
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

  const lifecycle = useRef(null);
  useEffect(() => {
    if (!supabase) return undefined;
    const controller = createAuthLifecycle(supabase, setState);
    lifecycle.current = controller;
    return () => {
      controller.dispose();
      lifecycle.current = null;
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
    if (!lifecycle.current) throw new Error("Please sign in again.");
    await lifecycle.current.refreshProfile();
  };
  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
