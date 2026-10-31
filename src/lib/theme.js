export const themeKey = "satchi.color-theme";
export function readTheme(storage) {
  try {
    const value = storage?.getItem(themeKey);
    return ["light", "dark", "system"].includes(value) ? value : "light";
  } catch {
    return "light";
  }
}
export function applyTheme(preference, root, storage, systemDark = false) {
  const value = ["light", "dark", "system"].includes(preference)
    ? preference
    : "light";
  root.dataset.theme =
    value === "system" ? (systemDark ? "dark" : "light") : value;
  root.dataset.themePreference = value;
  try {
    storage?.setItem(themeKey, value);
  } catch {
    /* Device preference remains usable without storage. */
  }
}
