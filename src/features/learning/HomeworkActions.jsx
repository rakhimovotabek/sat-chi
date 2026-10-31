import { useRef, useState } from "react";
import Modal from "../../components/Modal.jsx";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import { rpc } from "./api.js";
import "./homework-actions.css";

function DeleteConfirmation({ id, kind, onClose, onDeleted }) {
  const state = useContent(
    () => rpc("homework_delete_preview", { p_kind: kind, p_homework: id }),
    [id, kind],
  );
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const preview = state.data;
  async function remove(event) {
    event.preventDefault();
    if (!confirmed || pending.current || !preview) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await rpc("delete_homework", {
        p_kind: kind,
        p_homework: id,
        p_confirm: true,
      });
      onDeleted(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      className="homework-delete-dialog"
      title="Delete homework"
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <ContentState {...state} onRetry={state.reload} />
      {preview && (
        <form onSubmit={remove} aria-busy={busy}>
          <h3>{preview.title}</h3>
          <dl className="daily-overview">
            <div>
              <dt>Assigned audience</dt>
              <dd>
                {preview.audience.allStudents
                  ? "All students"
                  : [
                      ...preview.groups.map((group) => group.name),
                      ...preview.students
                        .slice(0, 10)
                        .map((student) => student.name || "Student"),
                      ...(preview.students.length > 10
                        ? [`and ${preview.students.length - 10} more students`]
                        : []),
                    ].join(", ") || "No students assigned"}
              </dd>
            </div>
            <div>
              <dt>Assignment recipients</dt>
              <dd>{preview.assignments}</dd>
            </div>
            <div>
              <dt>Submissions</dt>
              <dd>{preview.submissions}</dd>
            </div>
            <div>
              <dt>Started attempts</dt>
              <dd>{preview.started}</dd>
            </div>
          </dl>
          <p>
            {preview.retains_history
              ? "This assignment will disappear from pending homework and normal management views. Student attempts, answers and grades will be retained in history and reporting."
              : "This unused assignment will be permanently removed, including its pending student assignments. Shared Books and Question Bank content will stay available."}
          </p>
          {kind === "recurring" && (
            <p>
              Future daily assignments will stop. Deleted homework cannot be
              restored.
            </p>
          )}
          <p>
            Deletion cannot be undone. If student work arrives before deletion
            completes, the server will retain that history.
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
              required
            />
            I understand and want to delete this homework.
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Keep homework
            </button>
            <button
              type="submit"
              className="button button-danger"
              disabled={!confirmed || busy}
            >
              {busy ? "Deleting…" : "Delete homework"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function HomeworkActions({
  assignment,
  kind = "one-time",
  onEdit,
  onChanged,
  onDeleted,
  onArchive,
}) {
  const [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function change(next) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await rpc(
        kind === "recurring"
          ? "set_daily_homework_state"
          : "set_homework_state",
        kind === "recurring"
          ? { p_template: assignment.id, p_state: next }
          : { p_homework: assignment.id, p_state: next },
      );
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <details className="homework-actions">
        <summary>
          Actions
          <span className="sr-only">
            {" "}
            for {assignment.title || assignment.data?.title}
          </span>
        </summary>
        <div className="button-row">
          {assignment.state !== "archived" && (
            <>
              <button
                className="button button-secondary button-compact"
                type="button"
                onClick={onEdit}
                disabled={busy}
              >
                Edit
              </button>
              <button
                className="button button-secondary button-compact"
                type="button"
                onClick={() =>
                  change(assignment.state === "active" ? "paused" : "active")
                }
                disabled={busy}
              >
                {assignment.state === "active" ? "Pause" : "Resume"}
              </button>
            </>
          )}
          <button
            className="button button-secondary button-compact"
            type="button"
            onClick={() =>
              assignment.state === "archived"
                ? change("paused")
                : onArchive
                  ? onArchive()
                  : change("archived")
            }
            disabled={busy}
          >
            {assignment.state === "archived" ? "Restore to paused" : "Archive"}
          </button>
          <button
            className="button button-danger button-compact"
            type="button"
            onClick={() => setDeleting(true)}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {deleting && (
        <DeleteConfirmation
          id={assignment.id}
          kind={kind}
          onClose={() => setDeleting(false)}
          onDeleted={(result) => {
            setDeleting(false);
            onDeleted(result);
          }}
        />
      )}
    </>
  );
}
