import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import usePageTitle from "../hooks/usePageTitle.js";

export default function AppShell({ workspace, navigation }) {
  const [menuOpen, setMenuOpen] = useState(false);
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
    (pathname.startsWith("/practice/") ? "Book practice" : "Page not found");
  usePageTitle(title);

  return (
    <div className={`app-shell workspace-${workspace}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        workspace={workspace}
        navigation={navigation}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />
      <TopBar
        workspace={workspace}
        title={title}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
      />
      <main id="main-content" className="main-content" tabIndex={-1}>
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
