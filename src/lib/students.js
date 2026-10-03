import { supabase } from './supabase.js';

export const STUDENTS_PAGE_SIZE = 50;

export async function listStudents(page = 0) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const start = page * STUDENTS_PAGE_SIZE;
  const { data, count, error } = await supabase.from('profiles')
    .select('id,display_name,username,active,created_at', { count: 'exact' })
    .eq('role', 'student').order('created_at', { ascending: false }).order('id')
    .range(start, start + STUDENTS_PAGE_SIZE - 1);
  if (error) throw new Error('Could not load students. Check your connection and database setup.');
  return { students: data || [], count: count || 0 };
}

export async function manageStudent(body) {
  if (!supabase) throw new Error('Supabase is not configured.');
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
