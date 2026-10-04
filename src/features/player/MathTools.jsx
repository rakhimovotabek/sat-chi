import { useEffect, useRef, useState } from "react";
import MathReference from "./MathReference.jsx";
export const DESMOS_TESTING_URL =
  "https://www.desmos.com/testing/collegeboard/graphing";
let loading;
function loadDesmos(key) {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let timeout;
      const fail = () => {
        clearTimeout(timeout);
        loading = null;
        script.remove();
        reject(new Error("Calculator could not load."));
      };
      script.src = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${encodeURIComponent(key)}`;
      script.onload = () => {
        clearTimeout(timeout);
        if (window.Desmos) resolve(window.Desmos);
        else fail();
      };
      script.onerror = fail;
      timeout = setTimeout(fail, 15000);
      document.head.append(script);
    });
  return loading;
}
function Calculator({ saved }) {
  const element = useRef(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [fallback, setFallback] = useState(
      !import.meta.env.VITE_DESMOS_API_KEY && !window.Desmos,
    );
  const key = import.meta.env.VITE_DESMOS_API_KEY;
  useEffect(() => {
    if (fallback || (!key && !window.Desmos)) return;
    let live = true,
      calculator;
    loadDesmos(key)
      .then((Desmos) => {
        if (!live) return;
        calculator = Desmos.GraphingCalculator(element.current, {
          expressions: true,
          zoomButtons: true,
          settingsMenu: true,
          keypad: true,
          images: false,
          folders: false,
          notes: false,
          actions: false,
          calculus: false,
          border: false,
        });
        if (saved.current) calculator.setState(saved.current);
      })
      .catch(() => {
        if (live) {
          setError(
            "Using the official testing calculator while the configured integration is unavailable.",
          );
          setFallback(true);
        }
      });
    return () => {
      live = false;
      if (calculator) {
        saved.current = calculator.getState();
        calculator.destroy();
      }
    };
  }, [key, fallback, retry, saved]);
  return (
    <div className="calculator-container">
      {error && (
        <p className="calculator-load-error" role="status">
          {error}
        </p>
      )}
      {fallback ? (
        <iframe
          key={retry}
          className="calculator-frame"
          src={DESMOS_TESTING_URL}
          title="Desmos graphing calculator"
          allow="clipboard-write"
          onError={() =>
            setError("Calculator connection failed. Retry when online.")
          }
        />
      ) : (
        <div ref={element} style={{ height: "100%" }} />
      )}
      <button
        className="quiet-button calculator-retry"
        onClick={() => {
          setError("");
          setFallback(!key && !window.Desmos);
          setRetry((v) => v + 1);
        }}
      >
        Reload calculator
      </button>
    </div>
  );
}
export default function MathTools() {
  const [open, setOpen] = useState(""),
    [calculatorMounted, setCalculatorMounted] = useState(false),
    saved = useRef(null);
  return (
    <>
      <button
        className="button button-secondary button-compact"
        onClick={() => {
          setCalculatorMounted(true);
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
      {calculatorMounted && (
        <section
          className="player-tool-window"
          role="dialog"
          aria-label="Calculator"
          hidden={open !== "Calculator"}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen("");
          }}
        >
          <header>
            <h2>Graphing calculator</h2>
            <button
              className="button button-secondary button-compact"
              aria-label="Close Calculator"
              onClick={() => setOpen("")}
            >
              Close
            </button>
          </header>
          <Calculator saved={saved} />
        </section>
      )}
      {open === "Reference sheet" && (
        <section
          className="player-tool-window reference-window"
          role="dialog"
          aria-label="Reference sheet"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen("");
          }}
        >
          <header>
            <h2>Reference sheet</h2>
            <button
              className="button button-secondary button-compact"
              aria-label="Close Reference sheet"
              onClick={() => setOpen("")}
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
