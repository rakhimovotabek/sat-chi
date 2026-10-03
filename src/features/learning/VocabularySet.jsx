import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import useAuth from "../../hooks/useAuth.js";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import useAction from "./useAction.js";

import * as api from "./api.js";
import VocabTestsEditor from "./VocabTestsEditor.jsx";
import VocabEditor from "./VocabEditor.jsx";
export default function VocabularySet({ admin = false }) {
  const { setId } = useParams(),
    { session } = useAuth(),
    state = useContent(() => api.vocabSet(setId), [setId]),
    [mode, setMode] = useState("words"),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [selectedWord, setSelectedWord] = useState(null),
    action = useAction(),
    navigate = useNavigate();
  const words = state.data?.words || [],
    word = words[index],
    [statuses, setStatuses] = useState({});
  async function mark(status) {
    await action.run(async () => {
      await api.saveVocabProgress(session.user.id, word.id, status);
      setStatuses((v) => ({ ...v, [word.id]: status }));
      if (index < words.length - 1) {
        setIndex((i) => i + 1);
        setFlipped(false);
      }
    });
  }
  return (
    <>
      <PageHeader
        title={state.data?.set.title || "Vocabulary set"}
        eyebrow="Vocabulary learning"
        description="Learn the words, revisit difficult ones, and read the supplied passage."
      />
      <ContentState {...state} onRetry={state.reload} />
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      {state.data && (
        <>
          <div className="learning-tabs">
            {[
              ["words", "Word list"],
              ["cards", "Flashcards"],
              ["context", "Read in Context"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`button ${mode === key ? "" : "button-secondary"}`}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
            <button
              className="button button-secondary"
              disabled={action.busy || words.length < 4}
              onClick={() =>
                action.run(async () =>
                  navigate(
                    `/practice/${await api.startVocab(setId, "meanings")}`,
                  ),
                )
              }
            >
              Multiple Choice
            </button>
            <button
              className="button button-secondary"
              disabled={action.busy}
              onClick={() =>
                action.run(async () =>
                  navigate(`/practice/${await api.startVocab(setId, "test")}`),
                )
              }
            >
              Test
            </button>
          </div>
          {mode === "words" && (
            <section className="card learning-panel">
              <div className="item-list">
                {words.map((w, i) => (
                  <article key={w.id} className="vocab-word">
                    <div className="section-heading">
                      <h2>{w.word}</h2>
                      <span className="subtle-badge">
                        {statuses[w.id] ||
                          state.data.progress.find((p) => p.word_id === w.id)
                            ?.status ||
                          "New"}
                      </span>
                    </div>
                    <p>{w.definition}</p>
                    {w.example && (
                      <p className="page-description">{w.example}</p>
                    )}
                    {w.synonym && <small>Synonym: {w.synonym}</small>}
                    {w.translation && <small>{w.translation}</small>}
                    <div className="button-row">
                      {["known", "review"].map((status) => (
                        <button
                          key={status}
                          className="button button-secondary button-compact"
                          disabled={action.busy}
                          aria-label={`${status === "known" ? "Know" : "Need Review"} ${w.word}`}
                          onClick={() =>
                            action.run(async () => {
                              await api.saveVocabProgress(
                                session.user.id,
                                w.id,
                                status,
                              );
                              setStatuses((v) => ({ ...v, [w.id]: status }));
                            })
                          }
                        >
                          {status === "known" ? "Know" : "Need Review"}
                        </button>
                      ))}
                    </div>
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => {
                        setIndex(i);
                        setFlipped(false);
                        setMode("cards");
                      }}
                    >
                      Review word
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {mode === "cards" && word && (
            <section className="card learning-panel flashcard-panel">
              <small>
                Word {index + 1} of {words.length}
              </small>
              <button
                className="flashcard"
                onClick={() => setFlipped((v) => !v)}
                aria-label="Flip flashcard"
              >
                <h2>{flipped ? word.definition : word.word}</h2>
                {flipped && <p>{word.example}</p>}
                <small>
                  {flipped ? "Click to show word" : "Click to reveal meaning"}
                </small>
              </button>
              <div className="button-row">
                <button
                  className="button"
                  disabled={action.busy}
                  onClick={() => mark("known")}
                >
                  Know
                </button>
                <button
                  className="button button-secondary"
                  disabled={action.busy}
                  onClick={() => mark("review")}
                >
                  Need Review
                </button>
              </div>
              <div className="button-row">
                <button
                  className="button button-secondary"
                  disabled={!index}
                  onClick={() => {
                    setIndex((i) => i - 1);
                    setFlipped(false);
                  }}
                >
                  Previous word
                </button>
                <button
                  className="button button-secondary"
                  disabled={index >= words.length - 1}
                  onClick={() => {
                    setIndex((i) => i + 1);
                    setFlipped(false);
                  }}
                >
                  Next word
                </button>
              </div>
            </section>
          )}
          {mode === "context" && (
            <section className="card learning-panel">
              {!state.data.passages.length ? (
                <p className="empty-copy">
                  No passage was supplied for this set.
                </p>
              ) : (
                state.data.passages.map((p) => (
                  <article key={p.id}>
                    <h2>{p.title}</h2>
                    <ContextPassage
                      passage={p.passage}
                      setId={setId}
                      words={words}
                      onWord={setSelectedWord}
                    />
                  </article>
                ))
              )}
              {selectedWord && (
                <aside className="word-definition">
                  <strong>{selectedWord.word}</strong>
                  <p>{selectedWord.definition}</p>
                </aside>
              )}
            </section>
          )}
          {admin && <VocabTestsEditor setId={setId} />}
          {admin && (
            <VocabEditor
              setId={setId}
              words={words}
              passages={state.data.passages}
              reload={state.reload}
            />
          )}
        </>
      )}
    </>
  );
}
function ContextPassage({ passage, words, onWord }) {
  const lookup = new Map(words.map((w) => [w.word.toLowerCase(), w]));
  return (
    <p className="reading-text context-passage">
      {passage.split(/(\b[\p{L}][\p{L}'’-]*\b)/u).map((part, i) =>
        lookup.has(part.toLowerCase()) ? (
          <button
            className="vocab-highlight"
            key={i}
            onClick={() => onWord(lookup.get(part.toLowerCase()))}
          >
            {part}
          </button>
        ) : (
          part
        ),
      )}
    </p>
  );
}
