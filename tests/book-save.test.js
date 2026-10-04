import test from "node:test";
import assert from "node:assert/strict";
import {
  bookSavePayload,
  bookSaveError,
} from "../src/features/books/book-save.js";
test("book save keeps generated covers out of external URLs and supports publish/edit/fallback/replace/remove payloads", () => {
  const values = {
    title: " Test book ",
    description: "",
    category: "Math",
    published: true,
    cover_url: null,
    cover_image_url: "https://private.example/sign/expired?token=private",
  };
  assert.deepEqual(bookSavePayload(values), {
    title: "Test book",
    description: "",
    category: "Math",
    cover_url: null,
    published: true,
  });
  assert.equal(
    bookSavePayload({ ...values, cover_url: "https://example.test/cover.webp" })
      .cover_url,
    "https://example.test/cover.webp",
  );
  assert.deepEqual(
    bookSavePayload({ ...values, published: false, cover_path: null })
      .cover_metadata,
    {},
  );
  assert.throws(
    () => bookSavePayload({ ...values, cover_url: "javascript:alert(1)" }),
    /HTTPS/,
  );
  assert.equal(
    bookSavePayload({ ...values, title: "Edited published book" }).published,
    true,
  );
});
test("publication review failures explain the actual blocker without blaming the cover or leaking database details", () => {
  assert.match(
    bookSaveError({
      code: "P0001",
      message: "Review imported catalog items before publishing",
    }),
    /Content Review/,
  );
  assert.doesNotMatch(
    bookSaveError({
      code: "P0001",
      message: "Review imported catalog items before publishing",
    }),
    /cover/,
  );
  assert.doesNotMatch(
    bookSaveError({ message: "secret internal schema SQL token" }),
    /secret|schema|SQL|token/,
  );
});
