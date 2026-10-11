import FormattedText from "../../components/FormattedText.jsx";
import QuestionImage from "../../components/QuestionImage.jsx";
import Stimulus from "../player/Stimulus.jsx";
import { answerStatus } from "./homework-results-model.js";
export default function AdminAnswer({ item, review }) {
  const q = item.question,
    open = q.question_type === "open";
  const official = review?.accepted_range
    ? `${review.accepted_range.min} to ${review.accepted_range.max} (${review.accepted_range.inclusive ? "inclusive" : "exclusive"})`
    : review?.accepted_answers?.join(" or ") || review?.correct_answer;
  return (
    <>
      {(q.passage || q.stimulus || q.image_url || q.stimulus_table) && (
        <Stimulus question={q} />
      )}
      <div className="reading-text">
        <FormattedText>{q.question_text}</FormattedText>
      </div>
      <p>
        <strong>{answerStatus(item)}</strong>
      </p>
      <p>
        Student answer:{" "}
        {open
          ? item.selected_response?.trim() || "Unanswered"
          : item.selected_answer == null
            ? "Unanswered"
            : `Choice ${String.fromCharCode(65 + item.selected_answer)}`}
      </p>
      {!open && (
        <ol className="admin-answer-options">
          {(q.options || []).map((option, n) => (
            <li
              key={n}
              className={
                item.selected_answer === n ? "selected-admin-answer" : ""
              }
            >
              <strong>
                {String.fromCharCode(65 + n)}
                {item.selected_answer === n ? " · Student selection" : ""}
                {review?.correct_answer != null &&
                Number(review.correct_answer) === n
                  ? " · Correct answer"
                  : ""}
              </strong>
              {q.option_image_urls?.[n] && (
                <QuestionImage
                  src={q.option_image_urls[n]}
                  alt={`Choice ${String.fromCharCode(65 + n)}`}
                  allowZoom={false}
                />
              )}
              <FormattedText>{option}</FormattedText>
            </li>
          ))}
        </ol>
      )}
      <p>
        Official answer:{" "}
        {official == null
          ? "Unavailable"
          : open
            ? String(official)
            : `Choice ${String.fromCharCode(65 + Number(official))}`}
      </p>
      {review?.explanation && (
        <div className="reading-text">
          <strong>Explanation</strong>
          <FormattedText>{review.explanation}</FormattedText>
        </div>
      )}
      {!item.attempts?.length && (
        <p className="empty-copy">
          No recorded check history for this question.
        </p>
      )}
    </>
  );
}
