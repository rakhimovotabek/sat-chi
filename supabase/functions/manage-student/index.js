import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createManageStudentHandler } from './handler.js';

Deno.serve(createManageStudentHandler({
  createClient,
  getEnv: (name) => Deno.env.get(name),
}));
