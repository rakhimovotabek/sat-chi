import { supabase } from './supabase.js';

export const STUDENTS_PAGE_SIZE = 50;

export async function listStudents(page = 0) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const start = page * STUDENTS_PAGE_SIZE;
  const { data, count, error } = await supabase.from('profiles')
    .select('id,display_name,username,active,created_at', { count: 'exact' })
    .eq('role', 'student').eq('active', true).order('created_at', { ascending: false }).order('id')
    .range(start, start + STUDENTS_PAGE_SIZE - 1);
  if (error) throw new Error('Could not load students. Check your connection and database setup.');
  return { students: data || [], count: count || 0 };
}

export async function manageStudent(body) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (body.action === 'delete') {
    // Existing RLS and the profile guard allow only active admins to deactivate
    // students. Preserve Auth, homework history and progress instead of cascading.
    const { data, error } = await supabase.from('profiles')
      .update({ active: false }).eq('id', body.student_id).eq('role', 'student')
      .select('id,active').single();
    if (error || !data || data.active !== false) {
      throw new Error(error?.message || 'Could not deactivate the student account.');
    }
    return { deleted_id: data.id, deactivated: true };
  }
  // functions.invoke sends the current session JWT. No service-role key is used.
  const { data, error } = await supabase.functions.invoke('manage-student', { body });
  if (error) {
    let message = 'Account management failed. Check the function deployment and try again.';
    if (error.context instanceof Response) {
      try {
        const response = await error.context.json();
        if (typeof response.error === 'string') message = response.error;
      } catch { /* Keep the safe fallback for non-JSON gateway errors. */ }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
