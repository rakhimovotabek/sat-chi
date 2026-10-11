import { useState } from "react";
import Icon from "./Icon.jsx";
import { applyNightLight } from "../lib/night-light.js";
export default function NightLight() {
  const [enabled, setEnabled] = useState(() =>
    document.documentElement.classList.contains("night-light"),
  );
  function toggle() {
    const next = !enabled;
    let storage;
    try {
      storage = localStorage;
    } catch {
      /* Disabled storage must not disable the switch. */
    }
    applyNightLight(next, document.documentElement, storage);
    setEnabled(next);
  }
  return (
    <button
      type="button"
      className="button button-secondary button-compact"
      aria-label="Night Light"
      title="Night Light: warm display"
      aria-pressed={enabled}
      onClick={toggle}
    >
      <Icon name="night" />
      <span className="visually-hidden">Night Light</span>
    </button>
  );
}
