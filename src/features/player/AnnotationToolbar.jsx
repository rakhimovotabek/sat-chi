import { useEffect } from "react";
import "./annotations.css";
export default function AnnotationToolbar({
  active,
  setActive,
  tool,
  setTool,
  onClear,
}) {
  useEffect(() => {
    if (!active) return;
    const escape = (e) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active, setActive]);
  return (
    <div className="annotation-tools" role="group" aria-label="Drawing tools">
      <button
        className="button button-secondary button-compact"
        aria-pressed={active && tool === "pen"}
        onClick={() => {
          setTool("pen");
          setActive(true);
        }}
      >
        Pen
      </button>
      {active && (
        <>
          <button
            className="button button-secondary button-compact"
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
          <button
            className="button button-secondary button-compact"
            onClick={onClear}
          >
            Clear annotations
          </button>
          <button
            className="button button-secondary button-compact"
            onClick={() => setActive(false)}
          >
            Exit drawing mode
          </button>
        </>
      )}
    </div>
  );
}
