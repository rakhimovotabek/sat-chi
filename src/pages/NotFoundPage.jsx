import { Link } from 'react-router';
import usePageTitle from '../hooks/usePageTitle.js';

export default function NotFoundPage({ home, standalone = false }) {
  usePageTitle('Page not found');

  return (
    <section className={`empty-state ${standalone ? 'standalone-page' : ''}`}>
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This page isn’t part of your workspace. Return to the dashboard to continue.</p>
      <Link className="primary-link" to={home}>Back to dashboard</Link>
    </section>
  );
}
