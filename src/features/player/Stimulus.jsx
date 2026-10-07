import { formattedTextPlain } from "../../components/formatted-text.js";
import FormattedText from "../../components/FormattedText.jsx";
import ReferenceImage from "../../components/QuestionImage.jsx";
export default function Stimulus({ question, children }) {
  const table = question.stimulus_table;
  // A later passage edit must take precedence over older source formatting.
  const passage =
    question.passage_markup &&
    formattedTextPlain(question.passage_markup) === question.passage
      ? question.passage_markup
      : question.passage;
  return (
    <section
      className="stimulus-panel annotation-surface"
      aria-label="Passage and reference material"
    >
      <p className="eyebrow">Passage & reference</p>
      {question.passage && (
        <div className="reading-text">
          <FormattedText>{passage}</FormattedText>
        </div>
      )}
      {question.stimulus && (
        <div className="reading-text stimulus-text">
          <FormattedText>{question.stimulus}</FormattedText>
        </div>
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
      {children}
    </section>
  );
}
