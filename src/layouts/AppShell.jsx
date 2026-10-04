import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import usePageTitle from "../hooks/usePageTitle.js";

export default function AppShell({ workspace, navigation }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("satchi.sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  function toggleCollapse() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("satchi.sidebar-collapsed", String(next));
      } catch {
        /* Storage may be unavailable; the current page still works. */
      }
      return next;
    });
  }
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menuOpen]);
  const { pathname } = useLocation();
  const page = navigation.find(
    (item) =>
      pathname.replace(/\/$/, "") ===
      (workspace === "admin" ? `/admin/${item.slug}` : `/${item.slug}`),
  );
  const prefix = workspace === "admin" ? "/admin/" : "/";
  const nestedPage = navigation.find((item) =>
    pathname.startsWith(`${prefix}${item.slug}/`),
  );
  const title =
    page?.label ||
    nestedPage?.label ||
    (pathname.startsWith("/practice/")
      ? "Book practice"
      : pathname === "/mistakes"
        ? "Review Mistakes"
        : "Page not found");
  usePageTitle(title);

  return (
    <div
      className={`app-shell workspace-${workspace} ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        workspace={workspace}
        navigation={navigation}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Dismiss navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <TopBar
        workspace={workspace}
        title={title}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
      />
      <main
        id="main-content"
        className="main-content"
        tabIndex={-1}
        inert={menuOpen ? true : undefined}
      >
        <div className="content-container">
          <Outlet />
        </div>
        <footer className="content-footer">
          <span>SAT’chi</span>
          <span>Built for focused learning.</span>
        </footer>
      </main>
    </div>
  );
}
