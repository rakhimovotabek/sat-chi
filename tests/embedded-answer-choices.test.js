import test from "node:test";
import assert from "node:assert/strict";
import { allAnswerChoicesEmbedded } from "../src/features/player/model.js";
const embedded = {
  question_type: "mcq",
  image_url: "source.png",
  import_metadata: { questionImageIncludesOptions: true },
  options: ["", "", "", ""],
};
test("all embedded blanks and recognized placeholders use compact letter choices", () => {
  assert.equal(allAnswerChoicesEmbedded(embedded), true);
  assert.equal(
    allAnswerChoicesEmbedded({
      ...embedded,
      options: [
        "A. Choice in question image.",
        "Choice B in the source image",
        "Choice in the question image",
        " ",
      ],
    }),
    true,
  );
});
test("real text, mixed content, separate images and unmarked questions retain their content", () => {
  for (const q of [
    { ...embedded, options: ["", "Real answer text", "", ""] },
    {
      ...embedded,
      options: ["Choice in question image explains the graph", "", "", ""],
    },
    { ...embedded, option_image_urls: [null, "choice.png", null, null] },
    { ...embedded, import_metadata: {} },
    { ...embedded, image_url: null },
    { ...embedded, question_type: "open" },
    { ...embedded, options: ["", "", ""] },
  ])
    assert.equal(allAnswerChoicesEmbedded(q), false);
});
