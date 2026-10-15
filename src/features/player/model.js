export function practiceSummary(items) {
  const correct = items.filter((i) => i.correct === true).length;
  const unanswered = items.filter(
    (i) => i.selected_answer == null && !i.selected_response?.trim(),
  ).length;
  const answered = items.length - unanswered;
  const pending = items.filter(
    (i) =>
      (i.selected_answer != null || i.selected_response?.trim()) &&
      i.correct == null,
  ).length;
  return {
    total: items.length,
    correct,
    incorrect: answered - correct - pending,
    unanswered,
    pending,
    accuracy:
      answered - pending
        ? Math.round((correct / (answered - pending)) * 100)
        : null,
  };
}
export function questionState(item, current, submitted, practice = false) {
  const states = [
    current ? "current" : "",
    item.selected_answer == null ? "unanswered" : "answered",
    item.marked ? "marked" : "",
  ];
  if (practice && item.prior && !item.attempts?.length) {
    const prior = item.prior;
    states.push(
      prior.first_correct === false && prior.eventually_correct
        ? "previously-corrected"
        : prior.correct === true
          ? "previously-correct"
          : prior.correct === false
            ? "previously-incorrect"
            : "previously-answered",
    );
  }
  if (practice && item.attempts?.length) states.push("checked-current");
  if (
    (submitted || (practice && item.attempts?.length)) &&
    item.selected_answer != null
  )
    states.push(
      item.correct == null ? "pending" : item.correct ? "correct" : "incorrect",
    );
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

// Display-only: collapse placeholders only when every choice is in the source
// image. Any real text or separate choice image must retain its existing UI.
export function allAnswerChoicesEmbedded(question) {
  return Boolean(
    question.question_type !== "open" &&
      question.image_url &&
      question.import_metadata?.questionImageIncludesOptions === true &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      (question.option_image_urls == null ||
        (Array.isArray(question.option_image_urls) &&
          !question.option_image_urls.some(Boolean))) &&
      question.options.every(
        (option) =>
          typeof option === "string" &&
          (!option.trim() ||
            /^(?:[A-D][.)]\s*)?Choice(?:\s+[A-D])?\s+in\s+(?:the\s+)?(?:question|source)\s+image\.?$/i.test(
              option.trim(),
            )),
      ),
  );
}
