import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { reviewVocab, starVocab, startVocabPool, rpc } from "./api.js";
import useAction from "./useAction.js";
import { contextParts, normalizeRecall } from "./vocabulary-model.js";
import useAuth from "../../hooks/useAuth.js";
import { readLearningSettings } from "../settings/learning-settings.js";
export function ContextPassage({ passage, words, onWord }) {
  return (
    <div className="reading-text context-passage">
      {contextParts(passage, words).map((part, i) =>
        part.word ? (
          <button
            className="vocab-highlight"
            key={i}
            onClick={() => onWord(part.word)}
          >
            {part.text}
          </button>
        ) : (
          part.text
        ),
      )}
    </div>
  );
}
export function WordDetails({ word, progress }) {
  return (
    <>
      <p>{word.definition}</p>
      {[
        ["Part of speech", word.part_of_speech],
        ["Additional meanings", word.additional_definitions],
        ["Example", word.example],
        ["Synonyms", word.synonym],
        ["Antonyms", word.antonym],
        ["Translation", word.translation],
        ["Notes", word.notes],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) => (
          <p key={label}>
            <strong>{label}: </strong>
            {value}
          </p>
        ))}
      {progress?.review_count > 0 && (
        <small>
          {progress.successful_recalls} successful recalls ·{" "}
          {progress.failed_recalls} missed · Next review:{" "}
          {progress.next_review
            ? new Date(progress.next_review).toLocaleString()
            : "Not scheduled"}
        </small>
      )}
    </>
  );
}
export default function VocabularyLearning({
  words,
  progress = [],
  passages = [],
  setIds,
  initialMode = "words",
  initialTestType,
  admin = false,
  total = words.length,
  hasMore = false,
  nextPage,
  onRefresh,
  scopeFilter = "all",
}) {
  const { profile } = useAuth();
  const [defaults] = useState(() => readLearningSettings(profile.id));
  const [mode, setMode] = useState(
      ["words", "learn", "cards", "context", "typed", "test"].includes(
        initialMode,
      )
        ? initialMode
        : "words",
    ),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [updates, setUpdates] = useState({}),
    [selectedWord, setSelectedWord] = useState(null),
    [typed, setTyped] = useState(""),
    [feedback, setFeedback] = useState(null),
    [count, setCount] = useState(defaults.vocabularyCount),
    [testType, setTestType] = useState(
      ["meaning", "reverse", "mixed", "source", "typed"].includes(
        initialTestType,
      )
        ? initialTestType
        : defaults.vocabularyTestType,
    ),
    [shuffled, setShuffled] = useState(defaults.shuffleVocabulary),
    action = useAction(),
    navigate = useNavigate();
  const stored = Object.fromEntries(progress.map((p) => [p.word_id, p]));
  const status = (w) => updates[w.id] || w.progress || stored[w.id] || {};
  const pool = words.filter((w) => {
    const p = status(w);
    return (
      (!search ||
        normalizeRecall(w.word + " " + w.definition).includes(
          normalizeRecall(search),
        )) &&
      (filter === "all" ||
        (filter === "starred" && p.starred) ||
        (filter === "weak" &&
          p.failed_recalls >= 2 &&
          p.mastery_state !== "mastered") ||
        (filter === "due" &&
          p.next_review &&
          new Date(p.next_review) <= new Date()) ||
        p.mastery_state === filter ||
        (filter === "new" && !p.mastery_state))
    );
  });
  const sequence = useMemo(() => {
      const rows = [...pool];
      if (shuffled)
        for (let i = rows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rows[i], rows[j]] = [rows[j], rows[i]];
        }
      return rows;
    }, [words, filter, search, shuffled, mode]),
    word = sequence[index];
  const clock = useRef({ start: Date.now(), seconds: 0, active: true }),
    pending = useRef(null);
  useEffect(() => {
    setIndex(0);
    setFeedback(null);
    setFlipped(false);
  }, [words, filter, search]);
  useEffect(() => {
    clock.current = { start: Date.now(), seconds: 0, active: !document.hidden };
    pending.current = null;
    const pause = () => {
      const c = clock.current;
      if (c.active) c.seconds += (Date.now() - c.start) / 1000;
      c.active = false;
    };
    const resume = () => {
      clock.current.start = Date.now();
      clock.current.active = !document.hidden;
    };
    const visibility = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
    };
  }, [word?.id, mode]);
  const seconds = () => {
    const c = clock.current;
    return Math.min(
      300,
      Math.max(
        0,
        Math.round(c.seconds + (c.active ? (Date.now() - c.start) / 1000 : 0)),
      ),
    );
  };
  async function rate(
    rating,
    studyMode = mode === "learn" ? "learn" : "cards",
    answer = null,
  ) {
    if (!word || action.busy || admin) return;
    await action.run(async () => {
      const request = pending.current || {
        event: crypto.randomUUID(),
        seconds: seconds(),
        word: word.id,
        rating,
        studyMode,
        answer,
      };
      pending.current = request;
      const result = await reviewVocab(
        request.word,
        request.rating,
        request.seconds,
        request.event,
        request.studyMode,
        request.answer,
      );
      setUpdates((v) => ({ ...v, [word.id]: result.progress }));
      pending.current = null;
      clock.current = {
        start: Date.now(),
        seconds: 0,
        active: !document.hidden,
      };
      if (studyMode === "typed") setFeedback({ correct: result.correct, word });
      else {
        setIndex((i) => i + 1);
        setFlipped(false);
      }
      onRefresh?.();
    });
  }
  useEffect(() => {
    const key = (e) => {
      if (
        /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) ||
        mode !== "cards" ||
        action.busy
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((v) => !v);
      }
      if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(i + 1, sequence.length - 1));
        setFlipped(false);
      }
      if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
        setFlipped(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, sequence.length, action.busy]);
  const start = (practiceMode) =>
    action.run(async () => {
      const poolFilter = ["due", "weak", "starred"].includes(filter)
        ? filter
        : scopeFilter;
      if (practiceMode === "typed") {
        const id = await rpc("start_vocabulary_typed_test", {
          p_sets: setIds,
          p_count: count === 200 ? 0 : count,
          p_filter: poolFilter,
        });
        navigate(`/vocabulary/test/${id}`);
      } else
        navigate(
          `/practice/${await startVocabPool(setIds, practiceMode, count, poolFilter)}`,
        );
    });
  return (
    <>
      <div
        className="learning-tabs"
        role="group"
        aria-label="Vocabulary learning modes"
      >
        {[
          ["words", "Words"],
          ["learn", "Learn"],
          ["cards", "Flashcards"],
          ["context", "Read in Context"],
          ["typed", "Type the Word"],
          ["test", "Test"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`button ${mode === key ? "" : "button-secondary"}`}
            onClick={() => {
              setMode(key);
              setFeedback(null);
              setFlipped(false);
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="button button-secondary"
          onClick={() => start("meaning")}
          disabled={action.busy || admin}
        >
          Multiple Choice
        </button>
        <button
          className="button button-secondary"
          onClick={() => start("reverse")}
          disabled={action.busy || admin}
        >
          Word Selection
        </button>
      </div>
      {action.error && (
        <p className="form-error" role="alert">
          {action.error} Try the action again to retry the same review safely.
        </p>
      )}
      <div className="vocabulary-toolbar">
        <label>
          Search words and definitions
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this page"
          />
        </label>
        <label>
          Word status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {[
              "all",
              "new",
              "learning",
              "review",
              "mastered",
              "starred",
              "due",
              "weak",
            ].map((v) => (
              <option key={v} value={v}>
                {v === "weak"
                  ? "Words I Miss"
                  : v === "due"
                    ? "Review Due"
                    : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <small>
          {pool.length} on this page · {total} in the study pool
        </small>
      </div>
      {mode === "words" && (
        <section className="card learning-panel">
          <div className="item-list">
            {pool.map((w) => (
              <details key={w.id} className="vocab-word">
                <summary>
                  <span>
                    <strong>{w.word}</strong>
                    <span className="word-meaning">{w.definition}</span>
                  </span>
                  <span className="subtle-badge">
                    {status(w).mastery_state || "new"}
                    {status(w).starred ? " · ★" : ""}
                  </span>
                </summary>
                <WordDetails word={w} progress={status(w)} />
                <small>
                  {w.set_title || ""}
                  {w.source_page ? ` · Source page ${w.source_page}` : ""}
                </small>
                {!admin && (
                  <div className="button-row">
                    <button
                      className="button button-secondary button-compact"
                      aria-label={`Star ${w.word}`}
                      aria-pressed={!!status(w).starred}
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          const starred = !status(w).starred;
                          await starVocab(w.id, starred);
                          setUpdates((v) => ({
                            ...v,
                            [w.id]: { ...status(w), starred },
                          }));
                          onRefresh?.();
                        })
                      }
                    >
                      {status(w).starred ? "Unstar" : "Star"}
                    </button>
                    {[
                      ["know", "Know"],
                      ["need_review", "Need Review"],
                    ].map(([rating, label]) => (
                      <button
                        key={rating}
                        className="button button-secondary button-compact"
                        disabled={action.busy}
                        aria-label={`${label} ${w.word}`}
                        onClick={() =>
                          action.run(async () => {
                            const result = await reviewVocab(
                              w.id,
                              rating,
                              0,
                              crypto.randomUUID(),
                              "learn",
                            );
                            setUpdates((v) => ({
                              ...v,
                              [w.id]: result.progress,
                            }));
                            onRefresh?.();
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => {
                        setIndex(
                          sequence.findIndex((item) => item.id === w.id),
                        );
                        setMode("cards");
                        setFlipped(false);
                      }}
                    >
                      Review word
                    </button>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}
      {["cards", "learn", "typed"].includes(mode) && word && (
        <section className="card learning-panel flashcard-panel">
          <div className="section-heading">
            <small>
              Word {Math.min(index + 1, sequence.length)} of {sequence.length} ·{" "}
              {word.set_title || "Selected set"}
            </small>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={shuffled}
                onChange={(e) => {
                  setShuffled(e.target.checked);
                  setIndex(0);
                }}
              />
              Shuffle
            </label>
          </div>
          {mode === "cards" ? (
            <button
              className="flashcard"
              onClick={() => setFlipped((v) => !v)}
              aria-label="Flip flashcard"
            >
              <h2>{flipped ? word.definition : word.word}</h2>
              {flipped && (
                <>
                  <p>{word.part_of_speech}</p>
                  <p>{word.example}</p>
                  {word.synonym && <small>Synonyms: {word.synonym}</small>}
                  {word.translation && <small>{word.translation}</small>}
                </>
              )}
              <small>
                {flipped
                  ? "Click or Space to show word"
                  : "Click or Space to reveal meaning"}
              </small>
            </button>
          ) : mode === "learn" ? (
            <div className="vocabulary-lesson">
              <h2>{word.word}</h2>
              <WordDetails word={word} progress={status(word)} />
            </div>
          ) : (
            <form
              className="learning-form"
              onSubmit={(e) => {
                e.preventDefault();
                rate("good", "typed", typed);
              }}
            >
              <h2>{word.definition}</h2>
              <label>
                Type the word
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  disabled={!!feedback}
                />
              </label>
              <button
                className="button"
                disabled={action.busy || !!feedback || !typed.trim() || admin}
              >
                Check answer
              </button>
            </form>
          )}
          {mode === "typed" && feedback && (
            <div role="status">
              <strong>
                {feedback.correct ? "Correct" : "Needs review"} ·{" "}
                {feedback.word.word}
              </strong>
              <WordDetails
                word={feedback.word}
                progress={status(feedback.word)}
              />
              <button
                className="button"
                onClick={() => {
                  setFeedback(null);
                  setTyped("");
                  setIndex((i) => i + 1);
                }}
              >
                Next word
              </button>
            </div>
          )}
          {mode !== "typed" && !admin && (
            <div className="button-row">
              {(mode === "learn"
                ? [
                    ["know", "Know this"],
                    ["need_review", "Need review"],
                  ]
                : [
                    ["again", "Again"],
                    ["hard", "Hard"],
                    ["good", "Good"],
                    ["easy", "Easy"],
                  ]
              ).map(([rating, label]) => (
                <button
                  key={rating}
                  className="button button-secondary"
                  disabled={
                    action.busy ||
                    (pending.current && pending.current.rating !== rating)
                  }
                  onClick={() => rate(rating)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="button-row">
            <button
              className="button button-secondary"
              disabled={!index}
              onClick={() => {
                setIndex((i) => i - 1);
                setFlipped(false);
                setFeedback(null);
                setTyped("");
              }}
            >
              Previous word
            </button>
            <button
              className="button button-secondary"
              disabled={index >= sequence.length - 1}
              onClick={() => {
                setIndex((i) => i + 1);
                setFlipped(false);
                setFeedback(null);
                setTyped("");
              }}
            >
              Next word
            </button>
          </div>
        </section>
      )}
      {["cards", "learn", "typed"].includes(mode) &&
        !word &&
        sequence.length > 0 && (
          <section className="card empty-state">
            <h2>Study round complete</h2>
            <p>
              Your completed reviews are saved. Mastery builds through spaced
              recall over several days.
            </p>
            <button
              className="button button-secondary"
              onClick={() => {
                setIndex(0);
                setFlipped(false);
                setFeedback(null);
                setTyped("");
              }}
            >
              Review this page again
            </button>
          </section>
        )}
      {mode === "context" && (
        <section className="card learning-panel">
          {passages.length ? (
            passages.map((p) => (
              <article key={p.id}>
                <h2>{p.title}</h2>
                <small>Source passage</small>
                <ContextPassage
                  passage={p.passage}
                  words={words.filter(
                    (w) =>
                      !p.set_id ||
                      w.set_id === p.set_id ||
                      w.source_sets?.includes(p.set_id),
                  )}
                  onWord={setSelectedWord}
                />
              </article>
            ))
          ) : (
            <p>No source passage is available on this page.</p>
          )}
          {selectedWord && (
            <aside className="word-definition">
              <strong>{selectedWord.word}</strong>
              <WordDetails
                word={selectedWord}
                progress={status(selectedWord)}
              />
              <button
                className="button button-secondary button-compact"
                onClick={() => setSelectedWord(null)}
              >
                Close definition
              </button>
            </aside>
          )}
        </section>
      )}
      {mode === "test" && (
        <section className="card learning-panel">
          <h2>Test selected words</h2>
          <p>
            Results and answer explanations are saved in your practice history.
            Missed words return to review.
          </p>
          <div className="vocabulary-toolbar">
            <label>
              Question count
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[10, 20, 25, 50, 200].map((n) => (
                  <option key={n} value={n}>
                    {n === 200
                      ? testType === "typed"
                        ? "All available"
                        : "All available (up to 200)"
                      : n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Question types
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
              >
                <option value="mixed">
                  Mixed definitions and word selection
                </option>
                <option value="meaning">Definitions</option>
                <option value="reverse">Word selection</option>
                <option value="typed">Typed recall</option>
                <option value="source">Supplied context exercises</option>
              </select>
            </label>
            <button
              className="button"
              disabled={action.busy || admin}
              onClick={() => start(testType)}
            >
              Start test
            </button>
          </div>
          <button
            className="button button-secondary"
            onClick={() => {
              setFilter("weak");
              setMode("cards");
            }}
          >
            Practice weak words
          </button>
        </section>
      )}
      {!pool.length && mode !== "context" && mode !== "test" && (
        <section className="card empty-state">
          <h2>No words match</h2>
          <p>Choose another status, clear search, or select more sets.</p>
        </section>
      )}
      {hasMore && (
        <button
          className="button button-secondary"
          onClick={() => {
            setIndex(0);
            nextPage();
          }}
        >
          Next 100 words
        </button>
      )}
    </>
  );
}
