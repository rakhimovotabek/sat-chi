import ReferenceImage from "../../components/QuestionImage.jsx";
export default function Stimulus({ question }) {
  const table = question.stimulus_table;
  return (
    <section
      className="stimulus-panel"
      aria-label="Passage and reference material"
    >
      <p className="eyebrow">Passage & reference</p>
      {question.passage && (
        <div className="reading-text">{question.passage}</div>
      )}
      {question.stimulus && (
        <div className="reading-text stimulus-text">{question.stimulus}</div>
      )}
      {question.image_url && (
        <ReferenceImage key={question.image_url} src={question.image_url} />
      )}
      {table && (
        <div className="table-scroll">
          <table className="stimulus-table">
            <thead>
              <tr>
                {table.columns.map((v, i) => (
                  <th key={i} scope="col">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!question.passage &&
        !question.stimulus &&
        !question.image_url &&
        !table && (
          <div className="reference-empty">
            <h2>Focus on the question.</h2>
            <p>
              This question does not include a passage or reference material.
            </p>
          </div>
        )}
    </section>
  );
}
