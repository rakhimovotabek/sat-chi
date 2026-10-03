import PageHeader from "../../components/PageHeader.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { importJobs } from "./api.js";
export default function ImportStatus() {
  const state = useContent(importJobs);
  return (
    <>
      <PageHeader
        title="Import status"
        eyebrow="Private source processing"
        description="Validated extraction reports. Source PDFs remain on the owner's computer and are never offered for download."
      />
      <ContentState {...state} onRetry={state.reload} />
      {state.data?.map((job) => (
        <article key={job.id} className="card learning-panel">
          <div className="section-heading">
            <h2>{job.title}</h2>
            <span className="subtle-badge">{job.status}</span>
          </div>
          <p>{job.source_file}</p>
          <div className="section-list">
            <span>{job.detected_topics} detected topics</span>
            <span>{job.detected_questions} candidate questions</span>
            <span>
              {job.imported_count} imported · {job.skipped_count} skipped
            </span>
          </div>
          {[...job.warnings, ...job.errors].map((text, i) => (
            <p className="empty-copy" key={i}>
              {text}
            </p>
          ))}
        </article>
      ))}
      {state.data && !state.data.length && (
        <section className="card empty-state">
          <h2>No import reports</h2>
          <p>
            Run the local import inspection command, then submit its private
            manifest using the documented administrator workflow.
          </p>
        </section>
      )}
    </>
  );
}
