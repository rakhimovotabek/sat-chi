import useAction from "./useAction.js";
import * as api from "./api.js";
export default function VocabEditor({ words, passages, reload, setId }) {
  const action = useAction();
  return (
    <section className="card learning-panel">
      <h2>Edit set content</h2>
      {action.error && <p role="alert">{action.error}</p>}
      <form
        className="learning-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = Object.fromEntries(new FormData(form));
          action.run(async () => {
            const { supabase } = await import("../../lib/supabase.js");
            await api.checked(
              supabase
                .from("vocabulary_words")
                .insert({ ...data, set_id: setId, position: words.length }),
            );
            form.reset();
            reload();
          });
        }}
      >
        <h3>Add word</h3>
        <label>
          New word
          <input name="word" required maxLength={100} />
        </label>
        <label>
          New definition
          <input name="definition" required maxLength={2000} />
        </label>
        <label>
          Example sentence
          <input name="example" maxLength={6000} />
        </label>
        <label>
          Synonym
          <input name="synonym" maxLength={6000} />
        </label>
        <label>
          Translation
          <input name="translation" maxLength={6000} />
        </label>
        {[
          ["part_of_speech", "Part of speech"],
          ["additional_definitions", "Additional meanings"],
          ["antonym", "Antonyms"],
          ["notes", "Notes"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              maxLength={name === "part_of_speech" ? 100 : 6000}
            />
          </label>
        ))}
        <button className="button" disabled={action.busy}>
          Add word
        </button>
      </form>
      {words.map((w) => (
        <form
          key={w.id}
          className="learning-form vocab-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            action.run(async () => {
              const { supabase } = await import("../../lib/supabase.js");
              await api.checked(
                supabase
                  .from("vocabulary_words")
                  .update(Object.fromEntries(data))
                  .eq("id", w.id),
              );
              reload();
            });
          }}
        >
          <strong>{w.word}</strong>
          {w.source_page && (
            <small>
              Source page {w.source_page} · Extraction:{" "}
              {w.extraction_confidence || "Unclassified"}
            </small>
          )}
          {[
            ["word", "Word"],
            ["definition", "Definition"],
            ["part_of_speech", "Part of speech"],
            ["additional_definitions", "Additional meanings"],
            ["example", "Example"],
            ["synonym", "Synonyms"],
            ["antonym", "Antonyms"],
            ["translation", "Translation"],
            ["notes", "Notes"],
          ].map(([name, label]) => (
            <label key={name}>
              {label} for {w.word}
              <input
                name={name}
                required={["word", "definition"].includes(name)}
                maxLength={
                  name === "word" || name === "part_of_speech"
                    ? 100
                    : name === "definition"
                      ? 2000
                      : 6000
                }
                defaultValue={w[name] || ""}
              />
            </label>
          ))}
          <button className="button button-secondary" disabled={action.busy}>
            Save word
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={action.busy}
            onClick={() => {
              if (
                window.confirm(`Delete ${w.word} and its vocabulary progress?`)
              )
                action.run(async () => {
                  const { supabase } = await import("../../lib/supabase.js");
                  await api.checked(
                    supabase.from("vocabulary_words").delete().eq("id", w.id),
                  );
                  reload();
                });
            }}
          >
            Delete word
          </button>
        </form>
      ))}
      <form
        className="learning-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = Object.fromEntries(new FormData(form));
          action.run(async () => {
            const { supabase } = await import("../../lib/supabase.js");
            await api.checked(
              supabase
                .from("vocabulary_passages")
                .insert({ ...data, set_id: setId }),
            );
            form.reset();
            reload();
          });
        }}
      >
        <label>
          Passage title
          <input name="title" required />
        </label>
        <label>
          Source passage
          <textarea name="passage" required maxLength={60000} />
        </label>
        <button className="button button-secondary" disabled={action.busy}>
          Add supplied passage
        </button>
      </form>
      {passages.map((p) => (
        <form
          key={p.id}
          className="learning-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            action.run(async () => {
              const { supabase } = await import("../../lib/supabase.js");
              await api.checked(
                supabase
                  .from("vocabulary_passages")
                  .update({ passage: data.get("passage") })
                  .eq("id", p.id),
              );
              reload();
            });
          }}
        >
          <label>
            Edit supplied passage
            <textarea name="passage" defaultValue={p.passage} />
          </label>
          <button className="button button-secondary">Save passage</button>
        </form>
      ))}
    </section>
  );
}
