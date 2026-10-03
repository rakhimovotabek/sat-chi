import { useEffect, useRef, useState } from "react";
import Modal from "../../components/Modal.jsx";
let desmosLoading;
function loadDesmos(key) {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (!desmosLoading)
    desmosLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.desmos.com/api/v1.12/calculator.js?api_key=${encodeURIComponent(key)}`;
      script.onload = () => resolve(window.Desmos);
      script.onerror = () => {
        desmosLoading = null;
        script.remove();
        reject(new Error("Calculator could not load. Check your connection."));
      };
      document.head.append(script);
    });
  return desmosLoading;
}
function Calculator({ saved }) {
  const element = useRef(null),
    [error, setError] = useState("");
  const key = import.meta.env.VITE_DESMOS_API_KEY;
  useEffect(() => {
    if (!key) return;
    let live = true,
      calculator;
    loadDesmos(key)
      .then((Desmos) => {
        if (!live) return;
        calculator = Desmos.GraphingCalculator(element.current, {
          expressions: true,
        });
        if (saved.current) calculator.setState(saved.current);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      if (calculator) {
        saved.current = calculator.getState();
        calculator.destroy();
      }
    };
  }, [key]);
  return (
    <>
      {key ? (
        <div ref={element} className="calculator-container" />
      ) : (
        <p className="empty-copy">
          The embedded calculator will be available when your administrator
          configures Desmos. You can use the official calculator in a separate
          tab.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <a
        className="button button-secondary"
        href="https://www.desmos.com/calculator"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open official Desmos calculator
      </a>
    </>
  );
}
export default function MathTools() {
  const [open, setOpen] = useState(""),
    saved = useRef(null);
  return (
    <>
      <button
        className="button button-secondary button-compact"
        onClick={() => setOpen("Reference sheet")}
      >
        Reference sheet
      </button>
      <button
        className="button button-secondary button-compact"
        onClick={() => setOpen("Calculator")}
      >
        Calculator
      </button>
      {open && (
        <Modal title={open} onClose={() => setOpen("")}>
          {open === "Calculator" ? (
            <Calculator saved={saved} />
          ) : (
            <div className="formula-grid">
              <article>
                <h3>Circles</h3>
                <p>Area: A = πr²</p>
                <p>Circumference: C = 2πr</p>
                <p>Full circle: 360° or 2π radians</p>
              </article>
              <article>
                <h3>Triangles</h3>
                <p>Area: A = ½bh</p>
                <p>Right triangle: a² + b² = c²</p>
                <p>Angles add to 180°</p>
              </article>
              <article>
                <h3>Special right triangles</h3>
                <p>45–45–90: x, x, x√2</p>
                <p>30–60–90: x, x√3, 2x</p>
              </article>
              <article>
                <h3>Rectangles & solids</h3>
                <p>Rectangle: A = lw</p>
                <p>Rectangular prism: V = lwh</p>
                <p>Cylinder: V = πr²h</p>
                <p>Sphere: V = ⁴⁄₃πr³</p>
                <p>Cone: V = ⅓πr²h</p>
                <p>Pyramid: V = ⅓lwh</p>
              </article>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
