import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';

export default function PlaceholderPage({ page }) {
  return (
    <>
      <PageHeader eyebrow="Your workspace" title={page.label} description={page.description} />
      <section className="empty-state" aria-labelledby="empty-state-title">
        <span className="empty-icon"><Icon name={page.icon} /></span>
        <span className="subtle-badge">Coming soon</span>
        <h2 id="empty-state-title">{page.emptyTitle}</h2>
        <p>{page.emptyDescription}</p>
      </section>
    </>
  );
}
