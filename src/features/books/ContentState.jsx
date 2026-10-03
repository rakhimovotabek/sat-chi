export default function ContentState({ loading, error, onRetry }) {
  if (loading)
    return (
      <p className="card" role="status">
        Loading learning materials…
      </p>
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
