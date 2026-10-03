import { Link } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import Icon from '../../components/Icon.jsx';

export default function StudentDashboard() {
  return (
    <>
      <PageHeader eyebrow="Make progress, every day" title="Your SAT journey starts here." description="A dedicated space to learn, practice, and grow with confidence." />
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="welcome-label">Welcome to SAT’chi</span>
          <h2 id="welcome-title">Small steps.<br />Stronger foundations.</h2>
          <p>Your books, assignments, and practice will come together in one focused workspace.</p>
          <Link className="primary-link" to="/books">Explore your workspace <Icon name="arrow" /></Link>
        </div>
        <div className="welcome-art" aria-hidden="true"><span>SAT</span><div className="art-rule" /><small>LEARN · PRACTICE · GROW</small></div>
      </section>
      <section className="dashboard-section" aria-labelledby="learning-title">
        <div className="section-heading"><h2 id="learning-title">Your learning space</h2><span>A place for every part of prep</span></div>
        <div className="card-grid">
          <SectionCard to="/homework" icon="homework" title="Homework" description="Keep your assignments and focused practice together." />
          <SectionCard to="/books" icon="books" title="Books & topics" description="Build your understanding with structured learning materials." />
          <SectionCard to="/vocabulary" icon="vocabulary" title="Vocabulary" description="Develop the word knowledge that supports stronger reading." />
        </div>
      </section>
      <section className="progress-panel" aria-labelledby="progress-title">
        <span className="card-icon"><Icon name="results" /></span>
        <div><h2 id="progress-title">Room to grow</h2><p>Your progress and study time will appear here once learning activity is connected.</p></div>
        <span className="subtle-badge">Coming soon</span>
      </section>
    </>
  );
}
