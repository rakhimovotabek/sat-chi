import { useEffect, useRef, useState } from "react";
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
export default function Calculator({ saved }) {
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
      calculator,
      observer;
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
        observer = new ResizeObserver(() => {
          if (element.current?.clientWidth && element.current?.clientHeight)
            calculator.resize?.();
        });
        observer.observe(element.current);
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
      observer?.disconnect();
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
        <div
          ref={element}
          className="calculator-sdk"
          style={{ height: "100%" }}
        />
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
