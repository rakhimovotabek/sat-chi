import { CATEGORIES } from "./import-validation.js";
export function bookSavePayload(values) {
  const title = String(values.title || "").trim(),
    description = String(values.description || ""),
    cover = String(values.cover_url || "").trim();
  if (!title || title.length > 160)
    throw new Error("Enter a book title of 1–160 characters.");
  if (description.length > 10000)
    throw new Error("Shorten the description to 10,000 characters.");
  if (!CATEGORIES.includes(values.category))
    throw new Error("Choose a supported book category.");
  if (cover) {
    try {
      if (new URL(cover).protocol !== "https:" || cover.length > 2048)
        throw new Error();
    } catch {
      throw new Error(
        "Use a valid HTTPS cover URL of at most 2,048 characters, or remove the cover.",
      );
    }
  }
  return {
    title,
    description,
    category: values.category,
    cover_url: cover || null,
    published: values.published === true,
    ...(values.cover_path === null
      ? { cover_path: null, cover_metadata: {} }
      : {}),
  };
}
export function bookSaveError(error) {
  if (
    /Review imported catalog items before publishing/i.test(
      error?.message || "",
    )
  )
    return "Approve this book’s imported content in Content Review before publishing. You can save it as a draft now.";
  if (error?.code === "42501")
    return "Your administrator session cannot save this book. Sign in again and retry.";
  if (error?.code === "23514")
    return "Check the title, category, and HTTPS cover URL. You can leave the cover empty to use a fallback.";
  if (error?.code === "PGRST116")
    return "This book is no longer available. Refresh the Books library.";
  return "Could not save the book. Check your connection and retry; your changes are still in the form.";
}
