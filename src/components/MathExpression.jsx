import { useMemo } from "react";
import { renderMath } from "./math-render.js";
import "katex/dist/katex.min.css";
export default function MathExpression({ expression, display }) {
  const html = useMemo(
    () => renderMath(expression, display),
    [expression, display],
  );
  // Only KaTeX output enters this sink. Source HTML and trusted TeX commands are disabled.
  return html ? (
    <span
      className={display ? "math-expression math-display" : "math-expression"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <code>{expression}</code>
  );
}
