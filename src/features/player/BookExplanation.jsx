import { useState } from "react";
import { getBookExplanation } from "../books/api.js";
import QuestionImage from "../../components/QuestionImage.jsx";

export function ExplanationContent({ explanation }) {
  if (!explanation?.trim())
    return (
      <p className="reading-text">
        Explanation is not available for this question.
      </p>
    );
  // Only package image Markdown is interpreted; all other content stays text.
  const parts = [];
  const pattern =
    /!\[([^\]]*)\]\((https:\/\/[^\s)]+\/storage\/v1\/object\/authenticated\/book-package-assets\/[a-f0-9]{64}\/[a-f0-9]{64}\.png)\)/g;
  let position = 0;
  for (const match of explanation.matchAll(pattern)) {
    if (match.index > position)
      parts.push(
        <p className="reading-text" key={`text-${position}`}>
          {explanation.slice(position, match.index)}
        </p>,
      );
    parts.push(
      <QuestionImage
        key={`image-${match.index}`}
        src={match[2]}
        alt={match[1] || "Book explanation"}
      />,
    );
    position = match.index + match[0].length;
  }
  if (position < explanation.length)
    parts.push(
      <p className="reading-text" key={`text-${position}`}>
        {explanation.slice(position)}
      </p>,
    );
  return parts;
}

export default function BookExplanation({ sessionId, item, waitForSave }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const available =
    item.has_answered ||
    item.selected_answer != null ||
    Boolean(item.selected_response?.trim());
  if (!available) return null;
  async function reveal() {
    if (open && !error) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (content !== undefined) return;
    setLoading(true);
    setError("");
    try {
      await waitForSave();
      const result = await getBookExplanation(sessionId, item.id);
      setContent(result.explanation ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="book-explanation-control">
      <button
        type="button"
        className="button button-secondary button-compact"
        aria-expanded={open}
        aria-controls={`explanation-${item.id}`}
        onClick={reveal}
      >
        Explanation
      </button>
      {open && (
        <section
          id={`explanation-${item.id}`}
          className="question-explanation"
          aria-label="Book explanation"
        >
          {loading ? (
            <p role="status">Loading explanation…</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <button
                className="button button-secondary button-compact"
                onClick={reveal}
              >
                Retry explanation
              </button>
            </div>
          ) : (
            <ExplanationContent explanation={content} />
          )}
        </section>
      )}
    </div>
  );
}
