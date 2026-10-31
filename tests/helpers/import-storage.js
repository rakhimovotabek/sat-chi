// Disk-backed substitute for Supabase Storage's HTTP transport. Metadata access
// uses the real PostgreSQL policies. This is not the Supabase Storage service.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export function importStorage({ folder, files, sql, claims, quote }) {
  return async (req, res, url) => {
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/(?:authenticated\/)?(universal-book-staging|book-package-assets)\/(.+)$/,
    );
    if (!match) return false;
    const [, bucket, path] = match;
    const identity = claims(
      req.headers.authorization?.replace(/^Bearer /i, ""),
    );
    if (identity.role !== "service_role")
      throw new Error("Service credentials required for raw objects");
    const key = `${bucket}/${path}`;
    if (["POST", "PUT"].includes(req.method)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error("Local object too large");
        chunks.push(chunk);
      }
      const directory = join(folder, "import-storage");
      await mkdir(directory, { recursive: true });
      const filename = join(
        directory,
        createHash("sha256").update(key).digest("hex") +
          "." +
          path.split(".").at(-1),
      );
      await writeFile(filename, Buffer.concat(chunks), { mode: 0o600 });
      files.set(key, filename);
      await sql(
        `insert into storage.objects(bucket_id,name)select ${quote(bucket)},${quote(path)} where not exists(select 1 from storage.objects where bucket_id=${quote(bucket)} and name=${quote(path)});`,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ Key: key }));
    } else if (req.method === "GET") {
      const filename = files.get(key);
      if (!filename) throw new Error("Object missing");
      res.writeHead(200, {
        "Content-Type": path.endsWith(".zip")
          ? "application/zip"
          : "application/octet-stream",
      });
      res.end(await readFile(filename));
    } else throw new Error("Unsupported local object operation");
    return true;
  };
}
