import test from "node:test";
import assert from "node:assert/strict";
import { parseFormattedText } from "../src/components/formatted-text.js";

test("source blanks, underline, emphasis, paragraphs and symbols survive parsing", () => {
  assert.deepEqual(
    parseFormattedText(
      "Text _____ <u>word and phrase</u>.<br><em>Title</em> &amp; x &lt; 5",
    ),
    [
      "Text _____ ",
      { tag: "u", children: ["word and phrase"] },
      ".",
      { tag: "br", children: [] },
      { tag: "em", children: ["Title"] },
      " & x < 5",
    ],
  );
  assert.deepEqual(parseFormattedText("Math: 2 < 5, x_1 + _____ = π"), [
    "Math: 2 < 5, x_1 + _____ = π",
  ]);
});
test("untrusted source cannot inject attributes, URLs, executable tags or decoded HTML", () => {
  const nodes = parseFormattedText(
    '<u onclick="evil()">word</u><script>alert(1)</script><img src=x onerror=evil()><a href="javascript:evil()">safe</a>&lt;img onerror=evil()&gt;',
  );
  assert.deepEqual(nodes, [
    { tag: "u", children: ["word"] },
    "safe",
    "<img onerror=evil()>",
  ]);
  assert.deepEqual(parseFormattedText("<u>one <em>two</u> three"), [
    { tag: "u", children: ["one ", { tag: "em", children: ["two"] }] },
    " three",
  ]);
});

test("plain math inequalities are not mistaken for HTML tags", () => {
  assert.deepEqual(parseFormattedText("x<y and y>0; a < b > c"), [
    "x",
    "<y and y>",
    "0; a < b > c",
  ]);
});
