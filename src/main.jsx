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
