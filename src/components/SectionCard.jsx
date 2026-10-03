import { Link } from 'react-router';
import Icon from './Icon.jsx';

export default function SectionCard({ to, icon, title, description }) {
  return (
    <Link className="section-card" to={to}>
      <span className="card-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="card-link">Explore section <Icon name="arrow" /></span>
    </Link>
  );
}
