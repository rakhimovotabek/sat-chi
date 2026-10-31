export default function ContentState({ loading, error, onRetry }) {
  if (loading)
    return (
      <div className="content-skeleton" role="status" aria-label="Loading learning materials">
        <span className="visually-hidden">Loading learning materials…</span>
        <div aria-hidden="true"><span /><span /><span /></div>
      </div>
    );
  if (error)
    return (
      <div className="form-error" role="alert">
        {error}
        <div className="button-row">
          <button className="button button-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  return null;
}
