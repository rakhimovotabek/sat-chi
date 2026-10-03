import { Link, Navigate } from "react-router";
import useAuth from "../hooks/useAuth.js";
import { AuthLoading, profileHome } from "../auth/RequireAuth.jsx";
import AccountUnavailable from "../pages/auth/AccountUnavailable.jsx";
export default function AuthFrame({
  title,
  description,
  children,
  wide = false,
  protectedForm = false,
}) {
  const { loading, session, profile } = useAuth();
  if (loading) return <AuthLoading />;
  if (!protectedForm && session)
    return profile ? (
      <Navigate to={profileHome(profile)} replace />
    ) : (
      <AccountUnavailable />
    );
  return (
    <main className="auth-screen">
      <section className={`auth-card ${wide ? "auth-card-wide" : ""}`}>
        <Link to="/" className="auth-brand">
          SAT<span>’</span>chi
        </Link>
        <p className="eyebrow">Your next chapter starts here</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
