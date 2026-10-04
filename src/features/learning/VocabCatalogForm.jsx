import Modal from "../../components/Modal.jsx";
import useAction from "./useAction.js";
import { checked } from "./api.js";
import { supabase } from "../../lib/supabase.js";
export default function VocabCatalogForm({
  bookId,
  values = {},
  onClose,
  onSaved,
}) {
  const action = useAction();
  return (
    <Modal
      title={`${values.id ? "Edit" : "Create"} vocabulary ${bookId ? "set" : "book"}`}
      onClose={onClose}
    >
      <form
        className="learning-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget),
            data = bookId
              ? {
                  title: form.get("title"),
                  position: Number(form.get("position")),
                  book_id: bookId,
                }
              : {
                  title: form.get("title"),
                  description: form.get("description"),
                  source: form.get("source"),
                  cover_url:
                    form.get("removeCover") === "on"
                      ? null
                      : form.get("cover_url") || null,
                  ...(form.get("removeCover") === "on"
                    ? { cover_path: null, cover_metadata: {} }
                    : {}),
                };
          action.run(async () => {
            const table = bookId ? "vocabulary_sets" : "vocabulary_books";
            await checked(
              values.id
                ? supabase.from(table).update(data).eq("id", values.id)
                : supabase.from(table).insert(data),
            );
            onSaved();
          });
        }}
      >
        <label>
          {bookId ? "Set title" : "Vocabulary book title"}
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={values.title || ""}
          />
        </label>
        {bookId ? (
          <label>
            Set order
            <input
              type="number"
              name="position"
              min="0"
              defaultValue={values.position || 0}
            />
          </label>
        ) : (
          <>
            <label>
              Description
              <textarea
                name="description"
                maxLength={10000}
                defaultValue={values.description || ""}
              />
            </label>
            <label>
              Cover image URL
              <input
                type="url"
                name="cover_url"
                pattern="https://.*"
                maxLength={1000}
                defaultValue={values.cover_url || ""}
                placeholder="https://…"
              />
            </label>
            {(values.cover_path || values.cover_url) && (
              <label className="checkbox-row">
                <input type="checkbox" name="removeCover" />
                Remove current cover and use fallback
              </label>
            )}
            <label>
              Source attribution
              <input
                name="source"
                maxLength={500}
                defaultValue={values.source || ""}
              />
            </label>
          </>
        )}
        {action.error && (
          <p className="form-error" role="alert">
            {action.error}
          </p>
        )}
        <div className="button-row">
          <button className="button" disabled={action.busy}>
            Save vocabulary {bookId ? "set" : "book"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
