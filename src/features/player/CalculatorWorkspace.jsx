import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon.jsx";
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
const corners = ["bottom-right"];
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
  const [calculatorOpen, setCalculatorOpen] = useState(false),
    [referenceOpen, setReferenceOpen] = useState(false),
    [mounted, setMounted] = useState(false),
    [interacting, setInteracting] = useState(false);
  const saved = useRef(null),
    gesture = useRef(null),
    trigger = useRef(null),
    closeButton = useRef(null);
  const dockable = canDock(available, view.width),
    mode =
      layout.mode === "floating" ? "floating" : dockable ? "docked" : "stacked";
  const box = fitFloating(layout.floating, view),
    width = dockWidth(available, layout.ratio),
    shown = calculatorOpen && enabled;
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
    setCalculatorOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function begin(e, kind, corner) {
    if (e.button !== 0 || (kind === "move" && e.target.closest("button")))
      return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget
      .closest(".calculator-workspace-window")
      ?.getBoundingClientRect();
    const startBox =
      kind === "move" && mode !== "floating"
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : box;
    if (kind === "move" && mode !== "floating")
      setLayout((l) => ({ ...l, mode: "floating", floating: startBox }));
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: startBox,
      ratio: layout.ratio,
      height: layout.floating.height,
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
      g.kind === "resize" && mode !== "floating"
        ? {
            ...l,
            ratio: dockWidth(available, g.ratio + dx / available) / available,
            floating: {
              ...l.floating,
              height: Math.max(
                360,
                Math.min(g.height + dy, Math.max(360, view.height - 100)),
              ),
            },
          }
        : g.kind === "divider"
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
    if (corner && mode !== "floating") {
      setLayout((l) => ({
        ...l,
        ratio: dockWidth(available, l.ratio + dx / available) / available,
        floating: {
          ...l.floating,
          height: Math.max(
            360,
            Math.min(l.floating.height + dy, Math.max(360, view.height - 100)),
          ),
        },
      }));
      return;
    }
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
              type="button"
              aria-label="Calculator"
              title="Graphing Calculator"
              aria-expanded={shown}
              aria-controls="practice-calculator"
              onClick={() => {
                setMounted(true);
                setCalculatorOpen((v) => !v);
              }}
            >
              <Icon name="calculator" />
              Calculator
            </button>
            <button
              className="button button-secondary button-compact"
              type="button"
              aria-label="Reference sheet"
              title="Reference sheet"
              aria-expanded={referenceOpen}
              onClick={() => setReferenceOpen((v) => !v)}
            >
              <Icon name="reference" />
            </button>
          </>,
          toolbar,
        )}
      {mounted && (
        <section
          id="practice-calculator"
          className={`calculator-workspace-window ${interacting ? "calculator-interacting" : ""}`}
          data-mode={mode}
          data-reserve={dockable ? "true" : undefined}
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
              : {
                  height: Math.max(
                    360,
                    Math.min(
                      layout.floating.height,
                      Math.max(360, view.height - 100),
                    ),
                  ),
                }
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
            tabIndex={0}
            aria-label="Move calculator with arrow keys"
            onPointerDown={(e) => begin(e, "move")}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && mode === "floating")
                keyResize(e);
            }}
          >
            <h2>Graphing Calculator</h2>
            <div className="calculator-window-controls">
              <button
                ref={closeButton}
                className="button button-secondary button-compact"
                type="button"
                title="Close Calculator"
                aria-label="Close Calculator"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>
          <Calculator saved={saved} />
          {corners.map((c) => (
            <button
              key={c}
              type="button"
              className={`calculator-resize-handle ${c}`}
              aria-label={`Resize calculator ${c}`}
              title="Drag to resize; arrow keys also resize"
              onPointerDown={(e) => begin(e, "resize", c)}
              onKeyDown={(e) => keyResize(e, c)}
            />
          ))}
        </section>
      )}
      {shown && dockable && mode === "floating" && (
        <div className="calculator-reserved-space" aria-hidden="true" />
      )}
      <div
        className="calculator-divider"
        hidden={!shown || !dockable}
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
      {referenceOpen && enabled && (
        <section
          className="player-tool-window reference-window"
          role="dialog"
          aria-label="Reference sheet"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setReferenceOpen(false);
            }
          }}
        >
          <header>
            <h2>Reference sheet</h2>
            <button
              className="button button-secondary button-compact"
              type="button"
              aria-label="Close Reference sheet"
              onClick={() => setReferenceOpen(false)}
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
