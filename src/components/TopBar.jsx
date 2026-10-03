import Icon from './Icon.jsx';
import { useState } from 'react';
import useAuth from '../hooks/useAuth.js';

export default function TopBar({ workspace, title, menuOpen, onToggleMenu }) {
  const { profile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      if (await signOut()) setError('Could not log out. Try again.');
    } catch { setError('Could not log out. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <button className="menu-button" type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-controls="workspace-sidebar" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <div className="breadcrumb"><span>{workspace === 'admin' ? 'Admin' : 'Student'} workspace</span><span aria-hidden="true">/</span><strong>{title}</strong></div>
      </div>
      <div className="account-controls">
        <div className="account-summary"><strong>{profile.display_name || profile.username || 'Account'}</strong><span>{profile.role}</span></div>
        <button className="button button-secondary button-compact" disabled={busy} onClick={logout}>{busy ? 'Logging out…' : 'Log out'}</button>
        {error && <span className="logout-error" role="alert">{error}</span>}
      </div>
    </header>
  );
}
