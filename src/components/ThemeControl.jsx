import { useEffect, useState } from "react";
import { applyTheme, themeKey } from "../lib/theme.js";
export default function ThemeControl() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.themePreference || "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let storage;
      try {
        storage = localStorage;
      } catch {
        /* Private storage can be unavailable. */
      }
      applyTheme(theme, document.documentElement, storage, media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    const sync = (event) => {
      if (event.key === themeKey)
        setTheme(
          ["light", "dark", "system"].includes(event.newValue)
            ? event.newValue
            : "light",
        );
    };
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", sync);
    };
  }, [theme]);
  return (
    <label className="theme-control">
      <span className="visually-hidden">Color theme</span>
      <select
        aria-label="Color theme"
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
