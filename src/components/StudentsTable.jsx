export default function StudentsTable({ students, busy, onDelete }) {
  return (
    <div className="table-scroll">
      <table className="students-table">
        <caption className="visually-hidden">Student profiles</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Username</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td><strong>{student.display_name || 'Unnamed student'}</strong><small>{student.id}</small></td>
              <td>{student.username || 'Not set'}</td>
              <td><span className="subtle-badge">{student.active ? 'Active' : 'Inactive'}</span></td>
              <td>{new Date(student.created_at).toLocaleDateString()}</td>
              <td><button className="button button-danger button-compact" disabled={busy} onClick={() => onDelete(student)} aria-label={`Delete ${student.display_name || student.username || student.id}`}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
