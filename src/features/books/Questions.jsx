import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { getBooks, getTopics } from "./api.js";
import TopicQuestions from "./TopicQuestions.jsx";
export default function Questions() {
  const books = useContent(getBooks);
  const [book, setBook] = useState("");
  const [topic, setTopic] = useState("");
  const topics = useContent(
    () => (book ? getTopics(book) : Promise.resolve([])),
    [book],
  );
  return (
    <>
      <PageHeader
        title="Questions"
        eyebrow="Content management"
        description="Choose a book and topic to author questions and manage answer keys."
      />
      <div className="card profile-fields">
        <label>
          Book
          <select
            value={book}
            onChange={(e) => {
              setBook(e.target.value);
              setTopic("");
            }}
          >
            <option value="">Choose a book</option>
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
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!book || topics.loading}
          >
            <option value="">Choose a topic</option>
            {topics.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ContentState {...books} onRetry={books.reload} />
      {book && <ContentState {...topics} onRetry={topics.reload} />}{" "}
      {topic && topics.data?.find((t) => t.id === topic) && (
        <TopicQuestions
          key={topic}
          topic={topics.data.find((t) => t.id === topic)}
        />
      )}{" "}
      {!topic && !books.loading && (
        <p className="card page-description">
          Select a topic to view, create, edit, delete, or import questions.
        </p>
      )}
    </>
  );
}
