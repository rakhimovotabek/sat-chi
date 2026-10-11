export const nightLightKey = "satchi.night-light";
export const nightLightLevels = ["off", "warm", "extra-warm"];
export function readNightLightLevel(storage) {
  try {
    const value = storage.getItem(nightLightKey);
    return value === "true"
      ? "warm"
      : nightLightLevels.includes(value)
        ? value
        : "off";
  } catch {
    return "off";
  }
}
// Preserve the existing boolean helpers for callers and older preferences.
export const readNightLight = (storage) =>
  readNightLightLevel(storage) !== "off";
export function applyNightLight(value, root, storage) {
  const level =
    value === true
      ? "warm"
      : value === false
        ? "off"
        : nightLightLevels.includes(value)
          ? value
          : "off";
  root.classList.toggle("night-light", level !== "off");
  root.dataset.nightLight = level;
  try {
    storage.setItem(nightLightKey, level);
  } catch {
    /* Optional storage. */
  }
}
