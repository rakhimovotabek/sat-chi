import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
const run = promisify(execFile);
export async function privateStorageClient(project = "ileffhbbaomfimwulvpw") {
  let keys;
  try {
    const { stdout } = await run(
      "npx",
      [
        "--offline",
        "supabase@2.119.0",
        "projects",
        "api-keys",
        "--project-ref",
        project,
        "--reveal",
        "--output",
        "json",
      ],
      { maxBuffer: 1024 * 1024, timeout: 60000 },
    );
    keys = JSON.parse(
      stdout.slice(
        Math.min(
          ...[stdout.indexOf("["), stdout.indexOf("{")].filter((n) => n >= 0),
        ),
      ),
    );
  } catch {
    throw new Error("Private Storage credentials unavailable");
  }
  const entries = Array.isArray(keys) ? keys : keys.keys || keys.api_keys || [],
    key =
      entries.find((k) => k.name === "service_role")?.api_key ||
      entries.find((k) => k.type === "secret")?.api_key;
  if (!key || key.includes("***"))
    throw new Error("Private Storage credential unavailable");
  return createClient(`https://${project}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
