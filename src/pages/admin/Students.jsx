import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import CreateStudentForm from '../../components/CreateStudentForm.jsx';
import StudentsTable from '../../components/StudentsTable.jsx';
import { listStudents, manageStudent, STUDENTS_PAGE_SIZE } from '../../lib/students.js';

export default function Students() {
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [students, setStudents] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    listStudents(page).then((result) => {
      if (!live) return;
      if (page > 0 && !result.students.length) { setPage((current) => current - 1); return; }
      setStudents(result.students);
      setCount(result.count);
    }).catch((failure) => { if (live) { setError(failure.message); setStudents([]); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, refresh]);

  const create = async (fields) => {
    setBusy(true);
    setNotice('');
    try {
      await manageStudent({ action: 'create', ...fields });
      setNotice('Student account created.');
      setPage(0);
      setRefresh((current) => current + 1);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await manageStudent({ action: 'delete', student_id: pendingDelete.id });
      setPendingDelete(null);
      setNotice('Student account deactivated. Assignments and progress are preserved.');
      setRefresh((current) => current + 1);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Student management" title="Students" description="Manage real student accounts and profiles in your learning platform." />
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <CreateStudentForm busy={busy} onCreate={create} />
      {pendingDelete && (
        <section className="delete-confirmation" aria-labelledby="delete-title">
          <h2 id="delete-title">Delete {pendingDelete.display_name || pendingDelete.username || 'this student'}?</h2>
          <p>This deactivates the student account and removes it from active lists. Assignments and progress are preserved.</p>
          <div className="button-row">
            <button className="button button-secondary" disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button>
            <button className="button button-danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Confirm deletion'}</button>
          </div>
        </section>
      )}
      <section className="management-panel" aria-labelledby="students-title" aria-busy={loading}>
        <div className="section-heading"><h2 id="students-title">Student directory</h2><button className="button button-secondary button-compact" disabled={loading || busy} onClick={() => setRefresh((current) => current + 1)}>Refresh</button></div>
        {loading ? <p role="status">Loading students…</p> : error && !students.length ? <p>Student data is unavailable. Use Refresh to retry.</p> : students.length ? <StudentsTable students={students} busy={busy} onDelete={setPendingDelete} /> : <p className="page-description">No student accounts yet. Create the first student above.</p>}
        {!loading && !error && count > 0 && <div className="pagination">
          <span>{page * STUDENTS_PAGE_SIZE + 1}–{Math.min((page + 1) * STUDENTS_PAGE_SIZE, count)} of {count} students</span>
          <div className="button-row">
            <button className="button button-secondary button-compact" disabled={busy || page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <button className="button button-secondary button-compact" disabled={busy || (page + 1) * STUDENTS_PAGE_SIZE >= count} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </div>}
      </section>
    </>
  );
}
