import { useSearchParams, useParams, Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { vocabSet } from "./api.js";
import VocabularyLearning from "./VocabularyLearning.jsx";
import VocabEditor from "./VocabEditor.jsx";
import VocabTestsEditor from "./VocabTestsEditor.jsx";
export default function VocabularySet({ admin = false }) {
  const { setId, bookId } = useParams(),
    [params] = useSearchParams(),
    state = useContent(() => vocabSet(setId), [setId]);
  return (
    <>
      <PageHeader
        title={state.data?.set.title || "Vocabulary set"}
        eyebrow="Words for stronger reading"
        description="Learn, recall, and return to words at the right time."
      />
      <Link
        className="primary-link"
        to={`${admin ? "/admin" : ""}/vocabulary/${bookId}`}
      >
        ← All sets
      </Link>
      <ContentState {...state} onRetry={state.reload} />
      {state.data && (
        <>
          <VocabularyLearning
            key={setId}
            words={state.data.words}
            progress={state.data.progress}
            passages={state.data.passages}
            setIds={[setId]}
            initialMode={params.get("mode") || "words"}
            admin={admin}
          />
          {admin && (
            <>
              <VocabTestsEditor setId={setId} />
              <VocabEditor
                setId={setId}
                words={state.data.words}
                passages={state.data.passages}
                reload={state.reload}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
