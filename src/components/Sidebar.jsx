import { useState } from "react";
import { Link, NavLink } from "react-router";
import Icon from "./Icon.jsx";
import useAuth from "../hooks/useAuth.js";

export default function Sidebar({ workspace, navigation, open, onNavigate }) {
  const isAdmin = workspace === "admin";
  const { profile, signOut } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      if (await signOut()) setError("Could not log out. Try again.");
    } catch {
      setError("Could not log out. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      id="workspace-sidebar"
      className={`sidebar ${open ? "sidebar-open" : ""}`}
    >
      <Link
        className="brand"
        to={isAdmin ? "/admin/dashboard" : "/dashboard"}
        onClick={onNavigate}
        aria-label="SAT'chi dashboard"
      >
        <span className="brand-mark">
          S<span>′</span>
        </span>
        <span>
          SAT<span className="brand-accent">’</span>chi
          {isAdmin && <span className="admin-wordmark"> Admin</span>}
          <span className="brand-caption">
            {isAdmin ? "Admin Control Panel" : "Student Application"}
          </span>
        </span>
      </Link>
      <div className="sidebar-section-label">
        {isAdmin ? "Management" : "Your workspace"}
      </div>
      <nav
        className="sidebar-nav"
        aria-label={`${isAdmin ? "Admin" : "Student"} navigation`}
      >
        {navigation
          .filter((item) => isAdmin || item.slug !== "profile")
          .map((item) => (
            <NavLink
              key={item.slug}
              to={isAdmin ? `/admin/${item.slug}` : `/${item.slug}`}
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
              onClick={onNavigate}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
      </nav>
      <div className="sidebar-footer">
        <Link
          to={isAdmin ? "/admin/settings" : "/profile"}
          className="sidebar-account"
          onClick={onNavigate}
        >
          <span className="avatar">
            {(profile.display_name || profile.username || "S")
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span>
            <strong>
              {profile.display_name || profile.username || "Account"}
            </strong>
            <small>{isAdmin ? "Admin settings" : "Your profile & goals"}</small>
          </span>
        </Link>
        <button
          className="button button-secondary sidebar-logout"
          onClick={logout}
          disabled={busy}
        >
          {busy ? "Logging out…" : "Log out"}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
