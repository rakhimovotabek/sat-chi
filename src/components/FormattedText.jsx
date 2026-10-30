import React, { lazy, Suspense } from "react";
import { splitMathText } from "./math-text.js";
const MathExpression = lazy(() => import("./MathExpression.jsx"));
import { parseFormattedText } from "./formatted-text.js";

// Build React elements, never HTML. No source attributes or URLs are accepted.
export default function FormattedText({ children }) {
  const render = (nodes) =>
    nodes.map((node, i) =>
      typeof node === "string"
        ? splitMathText(node).map((part, j) =>
            part.math != null ? (
              <Suspense key={`${i}/${j}`} fallback={part.raw}>
                <MathExpression expression={part.math} display={part.display} />
              </Suspense>
            ) : (
              part.text
            ),
          )
        : React.createElement(
            node.tag,
            { key: i },
            node.tag === "br" ? undefined : render(node.children),
          ),
    );
  return render(parseFormattedText(children));
}
