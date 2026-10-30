import test from "node:test";
import assert from "node:assert/strict";
import { splitMathText } from "../src/components/math-text.js";
import { renderMath } from "../src/components/math-render.js";
test("math delimiters preserve surrounding text and distinguish inline and display expressions", () => {
  const parts = splitMathText(
    String.raw`Solve $x^2$ then \(\frac{1}{2}\). $$y=2$$`,
  );
  assert.deepEqual(
    parts.filter((p) => p.math).map((p) => [p.math, p.display]),
    [
      ["x^2", false],
      [String.raw`\frac{1}{2}`, false],
      ["y=2", true],
    ],
  );
  assert.deepEqual(splitMathText("A cost of $5."), [{ text: "A cost of $5." }]);
});
test("KaTeX produces accessible math while blocking trusted URL/HTML commands and bounding expansion", () => {
  assert.match(renderMath(String.raw`\frac{1}{2}`), /<math/);
  assert.match(renderMath("x^2"), /<msup>/);
  assert.doesNotMatch(
    renderMath(String.raw`\href{javascript:alert(1)}{bad}`),
    /href="javascript:/,
  );
  assert.doesNotMatch(
    renderMath(String.raw`\htmlClass{injected}{x}`),
    /class="injected"/,
  );
  assert.equal(renderMath("x".repeat(4001)), null);
});
