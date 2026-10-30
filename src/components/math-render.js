import katex from "katex";
export function renderMath(expression, display = false) {
  if (expression.length > 4000) return null;
  try {
    return katex.renderToString(expression, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: "warn",
      maxExpand: 300,
      maxSize: 10,
      macros: {},
      output: "htmlAndMathml",
    });
  } catch {
    return null;
  }
}
