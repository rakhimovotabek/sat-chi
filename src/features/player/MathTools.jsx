import { useRef, useState } from "react";
import MathReference from "./MathReference.jsx";
import Calculator from "./DesmosCalculator.jsx";
import CalculatorWorkspace from "./CalculatorWorkspace.jsx";
function LegacyMathTools() {
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

export default function MathTools(props) {
  return props.workspace ? (
    <CalculatorWorkspace {...props} />
  ) : (
    <LegacyMathTools />
  );
}
