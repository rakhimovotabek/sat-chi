export default function SectionAccuracy({ data }) {
  const rows = ["Math", "Reading & Writing"].map((section) => {
    const items = data.breakdowns.filter((b) => b.section === section);
    return {
      section,
      total: items.reduce((n, b) => n + Number(b.attempted), 0),
      correct: items.reduce((n, b) => n + Number(b.correct), 0),
    };
  });
  return (
    <section className="learning-columns">
      {rows.map((r) => (
        <article className="card learning-panel" key={r.section}>
          <h2>{r.section}</h2>
          <div className="section-heading">
            <strong className="big-number">
              {r.total ? `${Math.round((r.correct / r.total) * 100)}%` : "—"}
            </strong>
            <span>
              {r.total} answered · {r.correct} correct
            </span>
          </div>
          <p className="empty-copy">
            {r.total
              ? "Accuracy in completed practice sessions."
              : "Complete a session in this section to see your accuracy."}
          </p>
        </article>
      ))}
    </section>
  );
}
