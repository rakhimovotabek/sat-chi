import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "./useContent.js";
import ContentState from "./ContentState.jsx";
import { getTopics } from "./api.js";
import TopicQuestions from "./TopicQuestions.jsx";
import BookSelect from "./BookSelect.jsx";
export default function Questions() {
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
        <BookSelect
          value={book}
          onChange={(id) => {
            setBook(id);
            setTopic("");
          }}
        />
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
      {book && <ContentState {...topics} onRetry={topics.reload} />}{" "}
      {topic && topics.data?.find((t) => t.id === topic) && (
        <TopicQuestions
          key={topic}
          topic={topics.data.find((t) => t.id === topic)}
        />
      )}{" "}
      {!topic && (
        <p className="card page-description">
          Select a topic to view, create, edit, delete, or import questions.
        </p>
      )}
    </>
  );
}
