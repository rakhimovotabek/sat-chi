import { Component } from "react";
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="auth-screen">
          <section className="auth-card">
            <p className="eyebrow">SAT’chi</p>
            <h1>Let's try that again.</h1>
            <p className="page-description" role="alert">
              This page could not finish loading. Check your connection and
              reload.
            </p>
            <div className="button-row">
              <button
                className="button"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
              <a className="button button-secondary" href="/">
                Return home
              </a>
            </div>
          </section>
        </main>
      );
    return this.props.children;
  }
}
