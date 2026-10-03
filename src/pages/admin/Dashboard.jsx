import PageHeader from '../../components/PageHeader.jsx';
import SectionCard from '../../components/SectionCard.jsx';
import { adminNavigation } from '../../lib/navigation.js';

export default function AdminDashboard() {
  return (
    <>
      <PageHeader eyebrow="Manage the learning experience" title="Admin Dashboard" description="A dedicated workspace for your students, content, and learning operations." />
      <div className="foundation-note"><strong>Admin workspace</strong><p>Manage student accounts in your control panel. Learning materials, assignments, and analytics will be available in a future release.</p></div>
      <section className="dashboard-section" aria-labelledby="management-title">
        <div className="section-heading"><h2 id="management-title">Platform management</h2><span>Everything in its place</span></div>
        <div className="card-grid admin-card-grid">
          {adminNavigation.slice(1).map((page) => (
            <SectionCard key={page.slug} to={`/admin/${page.slug}`} icon={page.icon} title={page.label} description={page.description} />
          ))}
        </div>
      </section>
    </>
  );
}
