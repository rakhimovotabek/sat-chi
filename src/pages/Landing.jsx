import { useState } from "react";
import { Link, Navigate } from "react-router";
import useAuth from "../hooks/useAuth.js";
import { AuthLoading, profileHome } from "../auth/RequireAuth.jsx";
import AccountUnavailable from "./auth/AccountUnavailable.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
import CreatorSignature from "../components/CreatorSignature.jsx";
import Icon from "../components/Icon.jsx";
const features = [
  {
    name: "Question Bank",
    icon: "questions",
    title: "Find your next breakthrough.",
    text: "Choose SAT’chi Bank or SBank. Focus your session by subject, domain, skill and difficulty.",
    route: "/question-bank",
    items: [
      "Math",
      "Reading & Writing",
      "Domain & skill filters",
      "Review after Check",
    ],
  },
  {
    name: "Books",
    icon: "books",
    title: "One chapter. A clearer understanding.",
    text: "Move through published books, explore topics and pick up where you left off.",
    route: "/books",
    items: [
      "Your library",
      "Topics & chapters",
      "Saved answers",
      "Explanations",
    ],
  },
  {
    name: "Progress",
    icon: "results",
    title: "See the learning behind the numbers.",
    text: "Understand first-attempt accuracy, activity and the skills that need your attention.",
    route: "/progress",
    items: [
      "First-attempt accuracy",
      "Study activity",
      "Domain strengths",
      "Book progress",
    ],
  },
  {
    name: "Battles",
    icon: "standings",
    title: "Good thinking. Great competition.",
    text: "Meet in a shared arena for Math, Reading & Writing or Vocabulary. Play head-to-head or as a team.",
    route: "/battles",
    items: [
      "Create a lobby",
      "Invite a friend",
      "Ready together",
      "Play the same questions",
    ],
  },
  {
    name: "Vocabulary",
    icon: "vocabulary",
    title: "Make the right words stick.",
    text: "Learn meanings, recall words and revisit your vocabulary in focused study sessions.",
    route: "/vocabulary",
    items: [
      "Choose a set",
      "Study words",
      "Test your recall",
      "Review your results",
    ],
  },
  {
    name: "Homework",
    icon: "homework",
    title: "A clear next step, every day.",
    text: "Keep assignments, deadlines and saved results together, alongside your independent practice.",
    route: "/homework",
    items: [
      "Daily homework",
      "Group assignments",
      "Completion status",
      "Saved results",
    ],
  },
];
function Showcase() {
  const [selected, setSelected] = useState(0);
  const feature = features[selected];
  return (
    <div className="product-showcase">
      <div className="showcase-toolbar">
        <span className="wordmark">SAT’chi</span>
        <span>Explore your workspace</span>
      </div>
      <div className="showcase-tabs" role="group" aria-label="Feature preview">
        {features.map((f, i) => (
          <button
            key={f.name}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <Icon name={f.icon} />
            {f.name}
          </button>
        ))}
      </div>
      <div className="showcase-content" key={feature.name} aria-live="polite">
        <Icon name={feature.icon} />
        <h2>{feature.title}</h2>
        <p>{feature.text}</p>
        <ul>
          {feature.items.map((item) => (
            <li key={item}>
              <Icon name="chevron" />
              {item}
            </li>
          ))}
        </ul>
        <Link className="primary-link" to={feature.route}>
          Open {feature.name} <Icon name="arrow" />
        </Link>
      </div>
      <p className="showcase-caption">
        Feature preview · Sign in to see your own learning
      </p>
    </div>
  );
}
export default function Landing() {
  const { session, profile, loading } = useAuth();
  usePageTitle("Make every question count");
  if (loading) return <AuthLoading />;
  if (session)
    return profile ? (
      <Navigate to={profileHome(profile)} replace />
    ) : (
      <AccountUnavailable />
    );
  return (
    <div className="public-site premium-public">
      <a href="#public-main" className="skip-link">
        Skip to content
      </a>
      <header className="public-header">
        <Link to="/" className="wordmark">
          SAT<span>’</span>chi
        </Link>
        <nav aria-label="Public navigation">
          <a href="#features">Explore</a>
          <a href="#practice">Practice</a>
          <a href="#challenge">Battles</a>
        </nav>
        <div className="public-actions">
          <Link to="/login" className="button button-secondary">
            Sign In
          </Link>
          <Link to="/signup" className="button">
            Get Started
          </Link>
        </div>
      </header>
      <main id="public-main">
        <section className="hero">
          <div className="hero-story">
            <h1>
              <span>Master the SAT.</span>
              <br />
              Make every
              <br className="hero-break" /> question count.
            </h1>
            <p className="hero-copy">
              Find your focus. Challenge your thinking. Turn practice into
              progress you can actually see.
            </p>
            <div className="button-row">
              <Link to="/signup" className="button">
                Get Started <Icon name="arrow" />
              </Link>
              <a href="#features" className="button button-secondary">
                Explore Features
              </a>
            </div>
            <p className="hero-note">Math · Reading & Writing · Vocabulary</p>
          </div>
          <Showcase />
        </section>
        <section id="features" className="landing-manifesto">
          <h2>
            Your ambition.
            <br />
            <span>A workspace to match.</span>
          </h2>
          <p>
            Practice, review and compete in one connected place. Your saved work
            stays with you, from the first question to your next breakthrough.
          </p>
        </section>
        <section className="landing-practice" id="practice">
          <div>
            <Icon name="books" />
            <h2>
              Less searching.
              <br />
              More understanding.
            </h2>
            <p>
              Follow a book chapter by chapter, or build a focused Question Bank
              session around the skill you want to strengthen. Check your
              answer, explore the explanation and keep going.
            </p>
            <Link className="primary-link" to="/question-bank">
              Find your focus <Icon name="arrow" />
            </Link>
          </div>
          <div className="practice-path">
            <span>Choose your subject</span>
            <strong>
              Math <span>or</span> Reading & Writing
            </strong>
            <hr />
            <span>Narrow your focus</span>
            <strong>Domain → Skill → Difficulty</strong>
            <hr />
            <span>Make it count</span>
            <strong>Practice. Check. Understand.</strong>
          </div>
        </section>
        <section className="landing-progress">
          <div>
            <h2>
              Progress is personal.
              <br />
              Your insights should be, too.
            </h2>
            <p>
              See the difference between attempts and questions, first-attempt
              accuracy and eventually getting it right. Know what is improving
              and what deserves another look.
            </p>
          </div>
          <Link className="button button-secondary" to="/progress">
            Explore your progress <Icon name="arrow" />
          </Link>
        </section>
        <section className="landing-arena" id="challenge">
          <Icon name="standings" />
          <h2>
            Bring a friend.
            <br />
            Bring your best thinking.
          </h2>
          <p>
            One shared question set. A little friendly pressure. Battle
            head-to-head or team up for Math, Reading & Writing and Vocabulary.
          </p>
          <Link className="button" to="/battles">
            Enter Battles <Icon name="arrow" />
          </Link>
          <div className="arena-formats">
            <span>1 vs 1</span>
            <span>2 vs 2</span>
            <span>3 vs 3</span>
          </div>
        </section>
        <section className="landing-close">
          <div>
            <h2>
              Build a rhythm.
              <br />
              Keep your momentum.
            </h2>
            <p>
              Vocabulary, Homework and your study plan give every session a
              purpose. Start with one good question.
            </p>
          </div>
          <Link to="/signup" className="button">
            Start your SAT journey <Icon name="arrow" />
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <Link to="/" className="wordmark">
          SAT’chi
        </Link>
        <CreatorSignature />
        <Link to="/login">Sign In</Link>
      </footer>
    </div>
  );
}
