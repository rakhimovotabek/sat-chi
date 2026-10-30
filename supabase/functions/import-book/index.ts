import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createImportHandler } from "./handler.js";
Deno.serve(
  createImportHandler({ createClient, env: (name) => Deno.env.get(name) }),
);
