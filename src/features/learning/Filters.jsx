import useContent from "../books/useContent.js";
import { getBooks, getTopics } from "../books/api.js";
export const DOMAINS = {
  Math: [
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
  ],
  "Reading & Writing": [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
  ],
};
export default function Filters({ value, onChange, status = true }) {
  const books = useContent(getBooks),
    topics = useContent(
      () => (value.book ? getTopics(value.book) : Promise.resolve([])),
      [value.book],
    );
  const field = (key, v) =>
    onChange({
      ...value,
      [key]: v,
      ...(key === "section" ? { domain: "" } : {}),
      ...(key === "book" ? { topic: "" } : {}),
    });
  return (
    <div className="filter-grid">
      <label>
        Section
        <select
          aria-label="Section"
          value={value.section || ""}
          onChange={(e) => field("section", e.target.value)}
        >
          <option value="">All sections</option>
          {Object.keys(DOMAINS).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Domain
        <select
          value={value.domain || ""}
          onChange={(e) => field("domain", e.target.value)}
        >
          <option value="">All domains</option>
          {(value.section
            ? DOMAINS[value.section]
            : Object.values(DOMAINS).flat()
          ).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Skill
        <input
          value={value.skill || ""}
          onChange={(e) => field("skill", e.target.value)}
          placeholder="Exact skill name"
        />
      </label>
      <label>
        Difficulty
        <select
          value={value.difficulty || ""}
          onChange={(e) => field("difficulty", e.target.value)}
        >
          <option value="">Any difficulty</option>
          {["easy", "medium", "hard", "unclassified"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Book / source
        <select
          value={value.book || ""}
          onChange={(e) => field("book", e.target.value)}
        >
          <option value="">All books</option>
          {books.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Topic
        <select
          disabled={!value.book}
          value={value.topic || ""}
          onChange={(e) => field("topic", e.target.value)}
        >
          <option value="">All topics</option>
          {topics.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      {status && (
        <label>
          Previous practice
          <select
            value={value.status || ""}
            onChange={(e) => field("status", e.target.value)}
          >
            <option value="">Any status</option>
            <option value="unanswered">Unanswered</option>
            <option value="correct">Previously correct</option>
            <option value="incorrect">Previously incorrect</option>
            <option value="marked">Marked for review</option>
          </select>
        </label>
      )}
      {(books.error || topics.error) && (
        <p role="alert">{books.error || topics.error}</p>
      )}
    </div>
  );
}
