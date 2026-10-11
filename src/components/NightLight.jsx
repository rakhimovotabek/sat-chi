import { useState } from "react";
import Icon from "./Icon.jsx";
import { applyNightLight, nightLightLevels } from "../lib/night-light.js";
export default function NightLight() {
  const [level, setLevel] = useState(
    () => document.documentElement.dataset.nightLight || "off",
  );
  const label =
    level === "extra-warm" ? "Extra Warm" : level === "warm" ? "Warm" : "Off";
  function toggle() {
    const next =
      nightLightLevels[
        (nightLightLevels.indexOf(level) + 1) % nightLightLevels.length
      ];
    let storage;
    try {
      storage = localStorage;
    } catch {
      /* Disabled storage must not disable the switch. */
    }
    applyNightLight(next, document.documentElement, storage);
    setLevel(next);
  }
  return (
    <button
      type="button"
      className="button button-secondary button-compact"
      aria-label="Night Light"
      title={`Night Light: ${label}. Click to cycle Off, Warm, Extra Warm.`}
      aria-pressed={level !== "off"}
      data-level={level}
      onClick={toggle}
    >
      <Icon name="night" />
      <span className="night-light-level">{label}</span>
    </button>
  );
}
