export default function SectionAccuracy({ data }) {
  const rows = ["Math", "Reading & Writing"].map((section) => {
    const items = data.breakdowns.filter((b) => b.section === section);
    return {
      section,
      total: items.reduce((n, b) => n + Number(b.attempted), 0),
      correct: items.reduce((n, b) => n + Number(b.correct), 0),
      known: items.reduce((n, b) => n + Number(b.first_known || 0), 0),
    };
  });
  return (
    <section className="learning-columns">
      {rows.map((r) => (
        <article className="card learning-panel" key={r.section}>
          <h2>{r.section}</h2>
          <div className="section-heading">
            <strong className="big-number">
              {r.known ? `${Math.round((r.correct / r.known) * 100)}%` : "—"}
            </strong>
            <span>
              {r.total} attempted · {r.correct} correct on first attempt
            </span>
          </div>
          <p className="empty-copy">
            {r.total
              ? `First-attempt accuracy from ${r.known} recorded initial results.${r.known < r.total ? " Partial history; unknown results excluded." : ""}`
              : "Complete a session in this section to see your accuracy."}
          </p>
        </article>
      ))}
    </section>
  );
}
