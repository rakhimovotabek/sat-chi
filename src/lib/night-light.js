export const nightLightKey = "satchi.night-light";
export function readNightLight(storage) {
  try {
    return storage.getItem(nightLightKey) === "true";
  } catch {
    return false;
  }
}
export function applyNightLight(enabled, root, storage) {
  root.classList.toggle("night-light", enabled);
  try {
    storage.setItem(nightLightKey, String(enabled));
  } catch {
    /* Preference still works for this page. */
  }
}
