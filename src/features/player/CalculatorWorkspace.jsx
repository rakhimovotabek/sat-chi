import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Calculator from "./DesmosCalculator.jsx";
import MathReference from "./MathReference.jsx";
import {
  canDock,
  dockBounds,
  dockWidth,
  fitFloating,
  moveFloating,
  resizeFloating,
  readCalculatorLayout,
  writeCalculatorLayout,
} from "./calculator-layout.js";
const corners = ["top-left", "top-right", "bottom-left", "bottom-right"];
const viewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});
export default function CalculatorWorkspace({
  workspace,
  toolbar,
  sessionId,
  enabled,
}) {
  const [layout, setLayout] = useState(() => {
    const rect = workspace.getBoundingClientRect();
    const initial = { x: rect.left + 16, y: rect.top, width: 620, height: 560 };
    try {
      return readCalculatorLayout(window.sessionStorage, sessionId, initial);
    } catch {
      return readCalculatorLayout(null, sessionId, initial);
    }
  });
  const [available, setAvailable] = useState(() => workspace.clientWidth),
    [view, setView] = useState(viewport);
  const [open, setOpen] = useState(""),
    [mounted, setMounted] = useState(false),
    [interacting, setInteracting] = useState(false);
  const saved = useRef(null),
    gesture = useRef(null),
    trigger = useRef(null),
    closeButton = useRef(null);
  const dockable = canDock(available, view.width),
    mode =
      view.width <= 760
        ? "stacked"
        : layout.mode === "docked" && dockable
          ? "docked"
          : layout.mode === "docked"
            ? "stacked"
            : "floating";
  const box = fitFloating(layout.floating, view),
    width = dockWidth(available, layout.ratio),
    shown = open === "Calculator" && enabled;
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      setAvailable(workspace.clientWidth),
    );
    observer.observe(workspace);
    const resize = () => setView(viewport());
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [workspace]);
  useEffect(() => {
    try {
      writeCalculatorLayout(window.sessionStorage, sessionId, layout);
    } catch {
      /* Browser storage may be denied. */
    }
  }, [layout, sessionId]);
  useEffect(() => {
    workspace.style.setProperty("--calculator-dock-width", `${width}px`);
    return () => workspace.style.removeProperty("--calculator-dock-width");
  }, [workspace, width]);
  useEffect(() => {
    if (shown) closeButton.current?.focus({ preventScroll: true });
  }, [shown]);
  function close() {
    setOpen("");
    trigger.current?.focus({ preventScroll: true });
  }
  function begin(e, kind, corner) {
    if (
      e.button !== 0 ||
      (kind === "move" && (mode !== "floating" || e.target.closest("button")))
    )
      return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box,
      ratio: layout.ratio,
      kind,
      corner,
    };
    setInteracting(true);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    setLayout((l) =>
      g.kind === "divider"
        ? {
            ...l,
            ratio: dockWidth(available, g.ratio + dx / available) / available,
          }
        : {
            ...l,
            floating:
              g.kind === "move"
                ? moveFloating(g.box, dx, dy, view)
                : resizeFloating(g.box, g.corner, dx, dy, view),
          },
    );
  }
  function end() {
    gesture.current = null;
    setInteracting(false);
  }
  function keyResize(e, corner) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    const step = e.shiftKey ? 32 : 16;
    const dx =
        e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
      dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    setLayout((l) => ({
      ...l,
      floating: corner
        ? resizeFloating(box, corner, dx, dy, view)
        : moveFloating(box, dx, dy, view),
    }));
  }
  return (
    <>
      {toolbar &&
        createPortal(
          <>
            <button
              ref={trigger}
              className="button button-secondary button-compact"
              aria-expanded={shown}
              aria-controls="practice-calculator"
              onClick={() => {
                setMounted(true);
                setOpen("Calculator");
              }}
            >
              Calculator
            </button>
            <button
              className="button button-secondary button-compact"
              onClick={() => setOpen("Reference sheet")}
            >
              Reference sheet
            </button>
          </>,
          toolbar,
        )}
      {mounted && (
        <section
          id="practice-calculator"
          className={`calculator-workspace-window ${interacting ? "calculator-interacting" : ""}`}
          data-mode={mode}
          role="dialog"
          aria-modal={mode === "mobile" ? true : undefined}
          aria-label="Calculator"
          hidden={!shown}
          style={
            mode === "floating"
              ? {
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                }
              : undefined
          }
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
            if (mode === "mobile" && e.key === "Tab") {
              const focusable = [
                ...e.currentTarget.querySelectorAll(
                  "button:not([disabled]), iframe",
                ),
              ];
              const first = focusable[0],
                last = focusable.at(-1);
              if (e.shiftKey && e.target === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && e.target === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <header
            className="calculator-workspace-header"
            tabIndex={mode === "floating" ? 0 : undefined}
            aria-label={
              mode === "floating"
                ? "Move calculator with arrow keys"
                : undefined
            }
            onPointerDown={(e) => begin(e, "move")}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && mode === "floating")
                keyResize(e);
            }}
          >
            <h2>Graphing calculator</h2>
            <div className="calculator-window-controls">
              <button
                className="button button-secondary button-compact"
                disabled={mode !== "docked" && !dockable}
                aria-label={
                  mode === "docked" ? "Float calculator" : "Dock calculator"
                }
                title={
                  mode === "docked"
                    ? "Switch to floating window"
                    : dockable
                      ? "Dock beside question"
                      : "Docking needs a wider workspace"
                }
                onClick={() =>
                  setLayout((l) => ({
                    ...l,
                    mode: mode === "docked" ? "floating" : "docked",
                  }))
                }
              >
                {mode === "docked" ? "Float" : "Dock"}
              </button>
              <button
                ref={closeButton}
                className="button button-secondary button-compact"
                aria-label="Close Calculator"
                onClick={close}
              >
                Close
              </button>
            </div>
          </header>
          <Calculator saved={saved} />
          {mode === "floating" &&
            corners.map((c) => (
              <button
                key={c}
                className={`calculator-resize-handle ${c}`}
                aria-label={`Resize calculator ${c}`}
                title="Drag to resize; arrow keys also resize"
                onPointerDown={(e) => begin(e, "resize", c)}
                onKeyDown={(e) => keyResize(e, c)}
              />
            ))}
        </section>
      )}
      <div
        className="calculator-divider"
        hidden={!shown || mode !== "docked"}
        role="separator"
        aria-label="Calculator width"
        aria-orientation="vertical"
        aria-valuemin={Math.round(dockBounds(available).min)}
        aria-valuemax={Math.round(dockBounds(available).max)}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={(e) => begin(e, "divider")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const bounds = dockBounds(available);
          const next =
            e.key === "Home"
              ? bounds.min
              : e.key === "End"
                ? bounds.max
                : width +
                  (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 32 : 16);
          setLayout((l) => ({
            ...l,
            ratio: dockWidth(available, next / available) / available,
          }));
        }}
      />
      {open === "Reference sheet" && enabled && (
        <section
          className="player-tool-window reference-window"
          role="dialog"
          aria-label="Reference sheet"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <header>
            <h2>Reference sheet</h2>
            <button
              className="button button-secondary button-compact"
              aria-label="Close Reference sheet"
              onClick={close}
            >
              Close
            </button>
          </header>
          <MathReference />
        </section>
      )}
    </>
  );
}
