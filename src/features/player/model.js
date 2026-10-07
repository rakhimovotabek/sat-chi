export function practiceSummary(items) {
  const correct = items.filter((i) => i.correct === true).length;
  const unanswered = items.filter((i) => i.selected_answer == null).length;
  const answered = items.length - unanswered;
  return {
    total: items.length,
    correct,
    incorrect: answered - correct,
    unanswered,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
  };
}
export function questionState(item, current, submitted, practice = false) {
  const states = [
    current ? "current" : "",
    item.selected_answer == null ? "unanswered" : "answered",
    item.marked ? "marked" : "",
  ];
  if (
    (submitted || (practice && item.attempts?.length)) &&
    item.selected_answer != null
  )
    states.push(item.correct ? "correct" : "incorrect");
  if (
    practice &&
    item.correct === true &&
    item.attempts?.some((a) => a.correct === false)
  )
    states.push("mixed");
  return states.filter(Boolean);
}
export function questionAnswerIssue(question) {
  if (question.question_type === "open") return null;
  if (question.question_type && question.question_type !== "mcq")
    return "Unsupported question type";
  if (!Array.isArray(question.options) || question.options.length !== 4)
    return "Missing answer choices";
  const embedded =
    question.image_url &&
    question.import_metadata?.questionImageIncludesOptions === true;
  return question.options.every(
    (option, i) =>
      typeof option === "string" &&
      (question.option_image_urls?.[i] ||
        embedded ||
        (option.trim() &&
          !/^\s*Choice [A-D] in the source image\s*$/i.test(option))),
  )
    ? null
    : "Missing answer choices";
}
