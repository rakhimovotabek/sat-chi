import { useState } from 'react';
import useAuth from '../../hooks/useAuth.js';
import usePageTitle from '../../hooks/usePageTitle.js';

export default function AccountUnavailable() {
  const { error, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [busy, setBusy] = useState(false);
  usePageTitle('Account unavailable');

  const logout = async () => {
    setBusy(true);
    try {
      const result = await signOut();
      if (result) setLogoutError('Could not sign out. Please try again.');
    } catch { setLogoutError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="eyebrow">SAT’chi</p>
        <h1>Account unavailable</h1>
        <p className="page-description" role="alert">{error || 'Your account could not be verified.'}</p>
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <div className="button-row">
          <button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button>
          <button className="button" disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Log out'}</button>
        </div>
      </section>
    </main>
  );
}
