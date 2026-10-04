const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const EDGE = 8;
export function dockBounds(width) {
  return {
    min: Math.max(420, width * 0.3),
    max: Math.min(width * 0.6, width - 452),
  };
}
export const canDock = (width, viewportWidth) =>
  viewportWidth > 760 && width >= 900;
export function dockWidth(width, ratio) {
  const { min, max } = dockBounds(width);
  return clamp(width * ratio, min, Math.max(min, max));
}
export function fitFloating(box, viewport) {
  const width = clamp(
    box.width,
    Math.min(420, viewport.width - EDGE * 2),
    viewport.width - EDGE * 2,
  );
  const height = clamp(
    box.height,
    Math.min(360, viewport.height - EDGE * 2),
    viewport.height - EDGE * 2,
  );
  return {
    width,
    height,
    x: clamp(box.x, EDGE, viewport.width - width - EDGE),
    y: clamp(box.y, EDGE, viewport.height - height - EDGE),
  };
}
export function moveFloating(box, dx, dy, viewport) {
  return fitFloating({ ...box, x: box.x + dx, y: box.y + dy }, viewport);
}
export function resizeFloating(box, corner, dx, dy, viewport) {
  const minWidth = Math.min(420, viewport.width - EDGE * 2),
    minHeight = Math.min(360, viewport.height - EDGE * 2);
  const west = corner.endsWith("left"),
    north = corner.startsWith("top");
  let left = box.x,
    top = box.y,
    right = box.x + box.width,
    bottom = box.y + box.height;
  if (west) left = clamp(left + dx, EDGE, right - minWidth);
  else right = clamp(right + dx, left + minWidth, viewport.width - EDGE);
  if (north) top = clamp(top + dy, EDGE, bottom - minHeight);
  else bottom = clamp(bottom + dy, top + minHeight, viewport.height - EDGE);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function readCalculatorLayout(storage, sessionId, initialFloating) {
  const fallback = {
    mode: "docked",
    ratio: 0.45,
    floating: initialFloating || { x: 40, y: 120, width: 620, height: 560 },
  };
  try {
    const value = JSON.parse(storage.getItem(`satchi:calculator:${sessionId}`));
    if (
      !value ||
      !["docked", "floating"].includes(value.mode) ||
      !Number.isFinite(value.ratio) ||
      !["x", "y", "width", "height"].every((k) =>
        Number.isFinite(value.floating?.[k]),
      )
    )
      return fallback;
    return {
      mode: value.mode,
      ratio: clamp(value.ratio, 0.3, 0.6),
      floating: value.floating,
    };
  } catch {
    return fallback;
  }
}
export function writeCalculatorLayout(storage, sessionId, layout) {
  try {
    storage.setItem(`satchi:calculator:${sessionId}`, JSON.stringify(layout));
  } catch {
    /* Storage is optional in private browsing. */
  }
}
