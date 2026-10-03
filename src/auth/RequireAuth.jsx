import { Navigate, Outlet } from "react-router";
import useAuth from "../hooks/useAuth.js";
import AccountUnavailable from "../pages/auth/AccountUnavailable.jsx";
import { needsOnboarding } from "./profile-fields.js";
export function AuthLoading() {
  return (
    <main className="auth-screen">
      <div className="loading-state" role="status">
        Checking your account…
      </div>
    </main>
  );
}
export function homeForRole(role) {
  return role === "admin" ? "/admin/dashboard" : "/dashboard";
}
export function profileHome(profile) {
  return needsOnboarding(profile) ? "/onboarding" : homeForRole(profile?.role);
}
export default function RequireAuth({
  roles,
  allowIncompleteOnboarding = false,
}) {
  const { session, profile, loading, error } = useAuth();
  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (error || !profile) return <AccountUnavailable />;
  if (roles && !roles.includes(profile.role))
    return <Navigate to={homeForRole(profile.role)} replace />;
  if (!allowIncompleteOnboarding && needsOnboarding(profile))
    return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
export function RoleHome() {
  const { profile } = useAuth();
  return <Navigate to={profileHome(profile)} replace />;
}
