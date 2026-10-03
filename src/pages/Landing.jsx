import { Link, Navigate } from "react-router";
import useAuth from "../hooks/useAuth.js";
import { AuthLoading, profileHome } from "../auth/RequireAuth.jsx";
import AccountUnavailable from "./auth/AccountUnavailable.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
const features = [
  [
    "01",
    "SAT Question Bank",
    "Practice with purpose",
    "Find focused practice across Math and Reading & Writing. Build confidence one skill at a time.",
    "practice",
  ],
  [
    "02",
    "Daily Homework",
    "A little structure goes a long way",
    "Keep assignments, due dates, and your next steps together in a focused learning workspace.",
    "homework",
  ],
  [
    "03",
    "Books and Topic Practice",
    "Understand the why",
    "Move through books and topics to connect concepts with the questions that put them into practice.",
    "books",
  ],
  [
    "04",
    "Vocabulary Learning",
    "Words that open doors",
    "Learn meanings, revisit words, and build the vocabulary you need for more confident reading.",
    "vocabulary",
  ],
  [
    "05",
    "Progress Tracking",
    "See your direction",
    "Bring your goals and learning progress into view, so you can decide where to focus next.",
    "progress",
  ],
  [
    "06",
    "Group Standings",
    "Learn alongside your group",
    "Stay connected to your learning community and celebrate the work that moves you forward.",
    "standings",
  ],
];
export default function Landing() {
  const { session, profile, loading } = useAuth();
  usePageTitle("Prepare smarter for the SAT");
  if (loading) return <AuthLoading />;
  if (session)
    return profile ? (
      <Navigate to={profileHome(profile)} replace />
    ) : (
      <AccountUnavailable />
    );
  return (
    <div className="public-site">
      <a href="#public-main" className="skip-link">
        Skip to content
      </a>
      <header className="public-header">
        <Link to="/" className="wordmark">
          SAT<span>’</span>chi
        </Link>
        <nav aria-label="Public navigation">
          <a href="#features">Features</a>
          <a href="#practice">Practice</a>
          <a href="#vocabulary">Vocabulary</a>
          <a href="#about">About</a>
        </nav>
        <div className="public-actions">
          <Link to="/login" className="button button-secondary">
            Sign In
          </Link>
          <Link to="/signup" className="button">
            Sign Up
          </Link>
        </div>
      </header>
      <main id="public-main">
        <section className="hero">
          <div>
            <p className="eyebrow">A clearer path to your goal</p>
            <h1>
              Prepare smarter
              <br />
              for the <span>SAT.</span>
            </h1>
            <p className="hero-copy">
              Turn ambition into a steady learning routine. Bring SAT practice,
              homework, books, vocabulary, and progress together in one focused
              workspace.
            </p>
            <div className="button-row">
              <Link to="/signup" className="button">
                Start Learning <span aria-hidden="true">↗</span>
              </Link>
              <Link to="/login" className="button button-secondary">
                Sign In
              </Link>
            </div>
            <p className="hero-note">
              Your pace. Your plan. Your next chapter.
            </p>
          </div>
          <div className="hero-visual" aria-label="A focused learning plan">
            <div className="visual-heading">
              <span className="brand-mark">S′</span>
              <span>Your SAT journey</span>
            </div>
            <div className="journey-step">
              <span>01</span>
              <div>
                <strong>Set your direction</strong>
                <p>Start with a goal that matters to you.</p>
              </div>
            </div>
            <div className="journey-step">
              <span>02</span>
              <div>
                <strong>Build your routine</strong>
                <p>Make room for focused practice.</p>
              </div>
            </div>
            <div className="journey-step">
              <span>03</span>
              <div>
                <strong>Keep moving forward</strong>
                <p>Learn. Review. Grow your confidence.</p>
              </div>
            </div>
            <div className="visual-footer">
              Math <span>+</span> Reading & Writing
            </div>
          </div>
        </section>
        <section className="features-section" id="features">
          <div className="section-intro">
            <p className="eyebrow">One connected learning experience</p>
            <h2>Make every study session count.</h2>
            <p>
              A thoughtful space for the habits, skills, and support behind SAT
              preparation.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(([n, title, headline, text, id]) => (
              <article className="feature-card" id={id} key={id}>
                <span className="feature-number">{n}</span>
                <p className="eyebrow">{title}</p>
                <h3>{headline}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="about-section" id="about">
          <p className="eyebrow">Built around the learner</p>
          <h2>
            A big goal deserves
            <br />a clear next step.
          </h2>
          <p>
            SAT’chi brings students and their learning groups together around
            purposeful preparation. Start with your goals, then build a routine
            you can return to.
          </p>
          <Link to="/signup" className="button">
            Create your student account
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <Link to="/" className="wordmark">
          SAT’chi
        </Link>
        <p>Built for focused learning.</p>
        <Link to="/login">Sign In</Link>
      </footer>
    </div>
  );
}
