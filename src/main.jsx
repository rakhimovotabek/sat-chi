import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import AuthProvider from "./auth/AuthProvider.jsx";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/pages.css";
import "./styles/auth.css";
import "./styles/public.css";
import "./styles/books.css";
import "./styles/learning.css";
import "./styles/review.css";
import "./styles/study-workspace.css";
import "./styles/testing-workspace.css";
import "./styles/design-system.css";
import { applyTheme, readTheme } from "./lib/theme.js";
try {
  applyTheme(
    readTheme(localStorage),
    document.documentElement,
    undefined,
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
} catch {
  document.documentElement.dataset.theme = "light";
}

import { readNightLightLevel, applyNightLight } from "./lib/night-light.js";
try {
  applyNightLight(
    readNightLightLevel(localStorage),
    document.documentElement,
    localStorage,
  );
} catch {
  /* Storage may be unavailable. */
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);

import "./styles/premium.css";
