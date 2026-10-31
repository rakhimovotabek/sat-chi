function readMapping(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function MatchingChoices({
  question,
  response,
  onChange,
  disabled,
}) {
  const mapping = readMapping(response);
  return (
    <fieldset className="battle-matching" disabled={disabled}>
      <legend>Four word-definition pairs</legend>
      <p>
        Choose a different definition for each word. All four correct earn 100
        points; otherwise this round earns zero.
      </p>
      <div className="battle-match-rows">
        {question.matching_words.map((word, index) => (
          <label key={word.id}>
            <strong>{word.word}</strong>
            <select
              aria-label={`Definition for ${word.word}`}
              required
              value={mapping[index] ?? ""}
              onChange={(event) => {
                const next = Array.from(
                  { length: 4 },
                  (_, position) => mapping[position] ?? null,
                );
                next[index] =
                  event.target.value === "" ? null : Number(event.target.value);
                onChange(JSON.stringify(next));
              }}
            >
              <option value="">Choose a definition</option>
              {question.matching_definitions.map((definition, choice) => (
                <option
                  key={choice}
                  value={choice}
                  disabled={
                    mapping.includes(choice) && mapping[index] !== choice
                  }
                >
                  {definition}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MatchingPairs({ question, mapping, title }) {
  const choices = readMapping(mapping);
  return (
    <section aria-label={title}>
      <h4>{title}</h4>
      {choices.length === 4 ? (
        <dl className="battle-pairs">
          {question.matching_words.map((word, index) => (
            <div key={word.id}>
              <dt>{word.word}</dt>
              <dd>
                {question.matching_definitions[choices[index]] ??
                  "No definition selected"}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No pairs submitted.</p>
      )}
    </section>
  );
}
