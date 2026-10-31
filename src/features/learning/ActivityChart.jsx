import { useEffect, useRef } from "react";

// Browser-owned transforms: no per-frame React updates or animation dependency.
export default function ActivityChart({
  label,
  children,
  className = "progress-chart",
  role = "img",
}) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !window.IntersectionObserver || !node.animate) {
      node.dataset.motion = "complete";
      return;
    }
    let inside = false,
      started = false,
      complete = false,
      disposed = false;
    let animations = [];
    node.dataset.motion = "waiting";
    const update = () => {
      if (disposed || complete) return;
      if (preference.matches) {
        complete = true;
        animations.forEach((animation) => animation.cancel());
        node.dataset.motion = "complete";
        return;
      }
      if (!inside || document.hidden) {
        animations.forEach((animation) => animation.pause());
        if (started) node.dataset.motion = "paused";
        return;
      }
      if (!started) {
        started = true;
        animations = [
          ...node.querySelectorAll(
            ".progress-column > span, [data-chart-rise]",
          ),
        ].map((bar) =>
          bar.animate(
            [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
            { duration: 750, easing: "cubic-bezier(.16,1,.3,1)" },
          ),
        );
        animations.push(
          ...[...node.querySelectorAll("[data-chart-draw]")].map((path) =>
            path.animate(
              [
                { clipPath: "inset(0 100% 0 0)" },
                { clipPath: "inset(0 0% 0 0)" },
              ],
              { duration: 750, easing: "cubic-bezier(.16,1,.3,1)" },
            ),
          ),
        );
        Promise.all(animations.map((animation) => animation.finished))
          .then(() => {
            if (!disposed) {
              complete = true;
              node.dataset.motion = "complete";
              observer.disconnect();
            }
          })
          .catch(() => {
            /* Cancellation on reduced motion or unmount is expected. */
          });
      } else animations.forEach((animation) => animation.play());
      node.dataset.motion = "running";
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inside = entry.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    preference.addEventListener("change", update);
    return () => {
      disposed = true;
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      document.removeEventListener("visibilitychange", update);
      preference.removeEventListener("change", update);
    };
  }, []);
  return (
    <div ref={ref} className={className} role={role} aria-label={label}>
      {children}
    </div>
  );
}
