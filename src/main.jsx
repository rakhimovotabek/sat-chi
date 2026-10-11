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

import { readNightLight } from "./lib/night-light.js";
try {
  document.documentElement.classList.toggle(
    "night-light",
    readNightLight(localStorage),
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
