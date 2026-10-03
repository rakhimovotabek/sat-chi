import { useState } from 'react';

export default function CreateStudentForm({ busy, onCreate }) {
  const [fields, setFields] = useState({ email: '', password: '', display_name: '', username: '' });
  const [error, setError] = useState('');
  const update = (event) => setFields((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onCreate(fields);
      setFields({ email: '', password: '', display_name: '', username: '' });
    } catch (failure) { setError(failure.message); }
  };

  return (
    <section className="management-panel" aria-labelledby="create-student-title">
      <h2 id="create-student-title">Create student account</h2>
      <p className="page-description">Use the student’s email and a unique password. Share credentials with the student privately.</p>
      <form className="student-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Display name<input name="display_name" value={fields.display_name} onChange={update} maxLength={120} required /></label>
          <label>Username (optional)<input name="username" value={fields.username} onChange={update} pattern="[a-z0-9_]{3,32}" maxLength={32} autoCapitalize="none" title="3–32 lowercase letters, digits, or underscores" /></label>
          <label>Email<input name="email" type="email" value={fields.email} onChange={update} maxLength={254} autoComplete="off" required /></label>
          <label>Initial password<input name="password" type="password" value={fields.password} onChange={update} minLength={12} maxLength={128} autoComplete="new-password" required /></label>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" disabled={busy} type="submit">{busy ? 'Please wait…' : 'Create student'}</button>
      </form>
    </section>
  );
}
