import { useEffect, useRef } from "react";

export function displayValue(value, format = "number", suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Math.round(Number(value));
  if (format === "duration")
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  return `${n.toLocaleString()}${format === "percent" ? "%" : suffix}`;
}

// Update only this presentation node; no React renders on animation frames. The accessible
// value is always the saved result, never a succession of intermediate numbers.
export default function AnimatedValue({
  value,
  format = "number",
  suffix = "",
}) {
  const ref = useRef(null);
  const final = displayValue(value, format, suffix);
  useEffect(() => {
    const node = ref.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (
      value == null ||
      !Number.isFinite(Number(value)) ||
      preference.matches ||
      !window.IntersectionObserver
    ) {
      node.dataset.display = final;
      node.dataset.motion = "complete";
      return;
    }
    let frame = 0,
      elapsed = 0,
      last = null,
      inside = false,
      done = false;
    node.dataset.display = displayValue(0, format, suffix);
    node.dataset.motion = "waiting";
    function finish() {
      done = true;
      cancelAnimationFrame(frame);
      node.dataset.display = final;
      node.dataset.motion = "complete";
      observer.disconnect();
    }
    function tick(time) {
      if (last != null) elapsed += time - last;
      last = time;
      const progress = Math.min(1, elapsed / 750);
      node.dataset.display = displayValue(
        Number(value) * (1 - (1 - progress) ** 3),
        format,
        suffix,
      );
      if (progress === 1) finish();
      else frame = requestAnimationFrame(tick);
    }
    function update() {
      if (done) return;
      cancelAnimationFrame(frame);
      last = null;
      if (preference.matches) return finish();
      if (!inside || document.hidden) {
        node.dataset.motion = "paused";
        return;
      }
      node.dataset.motion = "running";
      frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        inside = entry.isIntersecting;
        update();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    preference.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      preference.removeEventListener("change", update);
    };
  }, [value, format, suffix, final]);
  return (
    <span className="animated-value">
      <span className="visually-hidden">{final}</span>
      <span ref={ref} aria-hidden="true" data-display={final} />
    </span>
  );
}
