export default function ImportPreview({ payload }) {
  const questions = [],
    topics = [];
  function visit(topic, path = "") {
    const title = path ? `${path} / ${topic.title}` : topic.title;
    topics.push(title);
    for (const q of topic.questions || [])
      if (questions.length < 10) questions.push({ ...q, topic: title });
    for (const child of topic.children || []) visit(child, title);
  }
  if (payload.topics) payload.topics.forEach((t) => visit(t));
  else questions.push(...payload.questions.slice(0, 10));
  return (
    <div className="import-content-preview">
      {topics.length > 0 && (
        <p className="page-description">
          Topic structure: {topics.slice(0, 20).join(" · ")}
          {topics.length > 20 ? " · …" : ""}
        </p>
      )}
      <p className="field-hint">
        Content preview shows the first ten questions. Review the source JSON
        for any remaining questions.
      </p>
      {questions.map((q, i) => (
        <details className="preview-question" key={i}>
          <summary>
            Preview question {i + 1}
            {q.topic ? ` — ${q.topic}` : ""}
          </summary>
          {q.passage && <p className="reading-text">{q.passage}</p>}
          {q.stimulus && <p className="reading-text">{q.stimulus}</p>}
          {q.imageUrl && (
            <img src={q.imageUrl} alt="Question reference" loading="lazy" />
          )}
          <h4>{q.question}</h4>
          <ol type="A">
            {q.options.map((o, j) => (
              <li key={j}>
                {o}
                {j === q.correctAnswer && (
                  <span className="subtle-badge">Correct answer</span>
                )}
              </li>
            ))}
          </ol>
          {q.explanation && <p className="reading-text">{q.explanation}</p>}
        </details>
      ))}
    </div>
  );
}
